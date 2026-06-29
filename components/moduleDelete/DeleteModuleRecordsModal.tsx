import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Checkbox, Divider, Modal, Segmented, Space, Spin, Tag, Typography } from 'antd';
import AdaptiveSelectField from '../AdaptiveSelectField';
import type { ModuleDefinition } from '../../types';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import {
  DeleteModuleRecordsOptions,
  DeleteModuleRecordsPreview,
  buildDeletedRelationLabel,
  deleteModuleRecordsWithOptions,
  fetchModuleDeletePreview,
  fetchModuleDeleteReplacementOptions,
  normalizeDeleteModuleRecordsOptions,
} from '../../utils/moduleDelete';

const { Text } = Typography;

type DeleteModuleRecordsModalProps = {
  open: boolean;
  moduleId: string;
  moduleConfig?: ModuleDefinition | null;
  recordIds: Array<string | number>;
  seededRecords?: Record<string, any>[];
  onCancel: () => void;
  onDeleted?: (payload: {
    preview: DeleteModuleRecordsPreview;
    options: DeleteModuleRecordsOptions;
    result: any;
  }) => void | Promise<void>;
};

const normalizeText = (value: unknown) => String(value || '').trim();

const previewNumber = (value: number) => toPersianNumber(Math.max(0, Number(value || 0)));

const DeleteModuleRecordsModal: React.FC<DeleteModuleRecordsModalProps> = ({
  open,
  moduleId,
  moduleConfig,
  recordIds,
  seededRecords,
  onCancel,
  onDeleted,
}) => {
  const normalizedIds = useMemo(
    () => Array.from(new Set((recordIds || []).map((value) => normalizeText(value)).filter(Boolean))),
    [recordIds],
  );
  const [preview, setPreview] = useState<DeleteModuleRecordsPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replaceEnabled, setReplaceEnabled] = useState(false);
  const [replacementOptions, setReplacementOptions] = useState<any[]>([]);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementRecordId, setReplacementRecordId] = useState<string | null>(null);
  const [replacementSearch, setReplacementSearch] = useState('');
  const [options, setOptions] = useState<DeleteModuleRecordsOptions>(() => normalizeDeleteModuleRecordsOptions(null));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setReplaceEnabled(false);
    setReplacementRecordId(null);
    setReplacementSearch('');
    setReplacementOptions([]);
    setOptions(normalizeDeleteModuleRecordsOptions(null));
    void fetchModuleDeletePreview({
      moduleId,
      moduleConfig,
      recordIds: normalizedIds,
      seededRecords,
    }).then((nextPreview) => {
      if (cancelled) return;
      setPreview(nextPreview);
      setOptions(normalizeDeleteModuleRecordsOptions({
        deletePayments: true,
        processMode: nextPreview.hasProcesses ? 'all' : 'none',
        deleteRelatedActivities: false,
        deleteFiles: false,
      }));
    }).catch(() => {
      if (!cancelled) setPreview(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [moduleConfig, moduleId, normalizedIds, open, seededRecords]);

  useEffect(() => {
    if (!open || !replaceEnabled) return;
    let cancelled = false;
    setReplacementLoading(true);
    void fetchModuleDeleteReplacementOptions({
      moduleId,
      excludedRecordIds: normalizedIds,
      search: replacementSearch,
    }).then((rows) => {
      if (!cancelled) setReplacementOptions(rows);
    }).finally(() => {
      if (!cancelled) setReplacementLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [moduleId, normalizedIds, open, replaceEnabled, replacementSearch]);

  const effectiveOptions = useMemo(() => normalizeDeleteModuleRecordsOptions({
    ...options,
    replacementRecordId: replaceEnabled ? replacementRecordId : null,
  }), [options, replaceEnabled, replacementRecordId]);

  const summaryBadges = useMemo(() => {
    if (!preview) return [];
    return [
      preview.hasPayments ? { key: 'payments', label: 'پرداخت/دریافت', value: preview.paymentsCount } : null,
      preview.hasProcesses ? { key: 'processes', label: 'فرآیند', value: preview.processCount } : null,
      preview.hasActivities ? { key: 'activities', label: 'فعالیت', value: preview.activityCount } : null,
      preview.hasFiles ? { key: 'files', label: 'فایل', value: preview.fileCount } : null,
    ].filter(Boolean) as Array<{ key: string; label: string; value: number }>;
  }, [preview]);

  const selectedReplacementOption = useMemo(
    () => replacementOptions.find((item: any) => normalizeText(item?.value) === normalizeText(replacementRecordId)) || null,
    [replacementOptions, replacementRecordId],
  );

  const canSubmit = !deleting && !loading && normalizedIds.length > 0 && (!replaceEnabled || !!replacementRecordId);

  const handleConfirm = async () => {
    if (!preview || !canSubmit) return;
    setDeleting(true);
    try {
      const result = await deleteModuleRecordsWithOptions({
        moduleId,
        moduleConfig,
        recordIds: normalizedIds,
        options: effectiveOptions,
      });
      await onDeleted?.({
        preview,
        options: effectiveOptions,
        result,
      });
    } catch (error) {
      Modal.error({
        title: 'حذف ناموفق بود',
        content: toFaErrorMessage(error as any, 'حذف رکوردها ناموفق بود.'),
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="حذف رکورد"
      okText="حذف"
      okType="danger"
      cancelText="انصراف"
      onCancel={() => {
        if (!deleting) onCancel();
      }}
      onOk={() => void handleConfirm()}
      okButtonProps={{ disabled: !canSubmit, loading: deleting }}
      cancelButtonProps={{ disabled: deleting }}
      destroyOnHidden
      centered
      width={720}
    >
      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <Spin />
        </div>
      ) : preview ? (
        <div className="space-y-4 text-right" dir="rtl">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-[#161616]">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              شما در حال حذف {previewNumber(preview.recordCount)} مورد از ماژول {preview.moduleTitle} هستید.
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              با اطلاعات داخل این رکورد{preview.recordCount > 1 ? 'ها' : ''} چه رفتاری انجام شود؟
            </div>
            {preview.recordTitles.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {preview.recordTitles.slice(0, 5).map((title) => (
                  <Tag key={title} className="!m-0">
                    {title}
                  </Tag>
                ))}
                {preview.recordTitles.length > 5 ? (
                  <Tag className="!m-0">+{previewNumber(preview.recordTitles.length - 5)} مورد دیگر</Tag>
                ) : null}
              </div>
            ) : null}
          </div>

          {summaryBadges.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {summaryBadges.map((item) => (
                <Tag key={item.key} color="processing" className="!m-0">
                  {previewNumber(item.value)} {item.label}
                </Tag>
              ))}
            </div>
          ) : null}

          <Space direction="vertical" size={12} className="w-full">
            <Checkbox
              checked={effectiveOptions.deletePayments}
              onChange={(event) => setOptions((prev) => ({ ...prev, deletePayments: event.target.checked }))}
              disabled={!preview.hasPayments}
            >
              حذف جدول دریافت / پرداخت
            </Checkbox>

            <div className="space-y-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">رفتار فرآیندها</div>
              <Segmented
                block
                options={[
                  { label: 'حذف همه فرآیندها', value: 'all', disabled: !preview.hasProcesses },
                  { label: 'فقط فرآیندهای تکمیل‌نشده', value: 'incomplete', disabled: !preview.hasProcesses || preview.incompleteProcessCount === 0 },
                  { label: 'بدون حذف فرآیند', value: 'none' },
                ]}
                value={effectiveOptions.processMode}
                onChange={(value) => setOptions((prev) => ({ ...prev, processMode: String(value) as DeleteModuleRecordsOptions['processMode'] }))}
              />
              {preview.hasProcesses && preview.incompleteProcessCount > 0 ? (
                <Text type="secondary" className="!text-xs">
                  از {previewNumber(preview.processCount)} مورد فرآیندی شناسایی‌شده، {previewNumber(preview.incompleteProcessCount)} مورد هنوز تکمیل نشده است.
                </Text>
              ) : null}
            </div>

            <Checkbox
              checked={effectiveOptions.deleteRelatedActivities}
              onChange={(event) => setOptions((prev) => ({ ...prev, deleteRelatedActivities: event.target.checked }))}
              disabled={!preview.hasActivities}
            >
              حذف فعالیت‌های مرتبط
            </Checkbox>

            <Checkbox
              checked={effectiveOptions.deleteFiles}
              onChange={(event) => setOptions((prev) => ({ ...prev, deleteFiles: event.target.checked }))}
              disabled={!preview.hasFiles}
            >
              حذف همه فایل‌های مرتبط
            </Checkbox>
          </Space>

          <Divider className="!my-1" />

          <div className="space-y-3 rounded-2xl border border-dashed border-gray-300 p-4 dark:border-gray-600">
            <Checkbox
              checked={replaceEnabled}
              onChange={(event) => {
                const checked = event.target.checked;
                setReplaceEnabled(checked);
                if (!checked) {
                  setReplacementRecordId(null);
                  setReplacementSearch('');
                }
              }}
            >
              جایگزینی رکورد{preview.recordCount > 1 ? 'های' : ''} حذف‌شده
            </Checkbox>

            {replaceEnabled ? (
              <div className="space-y-2">
                <AdaptiveSelectField
                  value={replacementRecordId || undefined}
                  onChange={(value) => setReplacementRecordId(normalizeText(value) || null)}
                  options={replacementOptions}
                  loading={replacementLoading}
                  showSearch
                  allowClear
                  placeholder="انتخاب رکورد جایگزین"
                  onSearch={(value) => setReplacementSearch(value)}
                  filterOption={false}
                  pickerTitle="انتخاب رکورد جایگزین"
                  mobileSearchPlaceholder="جستجوی رکورد جایگزین"
                />
                <Text type="secondary" className="!text-xs">
                  اگر فعالیت‌ها یا ارتباط‌های داده‌ای باقی بمانند، به {buildDeletedRelationLabel(String(selectedReplacementOption?.label || '').replace(/\s+\(حذف شده\)$/u, ''))} منتقل می‌شوند.
                </Text>
              </div>
            ) : (
              <Alert
                type="info"
                showIcon
                message="اگر جایگزین انتخاب نشود، ارتباط‌های باقی‌مانده با عنوان «رکورد حذف شده» نمایش داده می‌شوند."
              />
            )}
          </div>
        </div>
      ) : (
        <Alert
          type="error"
          showIcon
          message="پیش‌نمایش حذف بارگذاری نشد."
        />
      )}
    </Modal>
  );
};

export default DeleteModuleRecordsModal;
