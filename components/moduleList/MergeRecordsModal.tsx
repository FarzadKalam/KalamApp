import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Empty, Modal, Radio, Spin } from 'antd';
import { FieldType, ModuleDefinition, ModuleField } from '../../types';
import { buildDefaultMergeSelections, buildMergePayload, getMergeableModuleFields } from '../../utils/moduleListMerge';
import { formatListCellValue } from '../../utils/listPrintExport';
import { readCurrencyConfig } from '../../utils/currency';
import { getFieldLabelFa } from '../../utils/fieldLabel';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

interface MergeRecordsModalProps {
  open: boolean;
  moduleConfig: ModuleDefinition;
  records: Array<Record<string, any>>;
  loading?: boolean;
  submitting?: boolean;
  canViewField?: (fieldKey: string) => boolean;
  dynamicOptions?: Record<string, any[]>;
  relationOptions?: Record<string, any[]>;
  onCancel: () => void;
  onConfirm: (payload: Record<string, any>, meta: { survivorId: string; duplicateIds: string[] }) => Promise<void> | void;
}

const getRecordTitle = (moduleConfig: ModuleDefinition, record: Record<string, any>, index: number) => {
  const keyField = moduleConfig.fields.find((field) => field.isKey);
  const priorityField = keyField || moduleConfig.fields.find((field) =>
    ['name', 'title', 'full_name', 'business_name', 'system_code', 'code'].includes(String(field.key || ''))
  );
  const title = priorityField ? String(record?.[priorityField.key] || '').trim() : '';
  return title || `رکورد ${toPersianNumber(index + 1)}`;
};

const getFieldOptions = (
  field: ModuleField,
  dynamicOptions: Record<string, any[]> = {},
) => [
  ...(Array.isArray(field.options) ? field.options : []),
  ...(field.dynamicOptionsCategory && Array.isArray(dynamicOptions[field.dynamicOptionsCategory])
    ? dynamicOptions[field.dynamicOptionsCategory]
    : []),
];

const getDisplayValue = (
  field: ModuleField,
  record: Record<string, any>,
  relationOptions: Record<string, any[]> = {},
  dynamicOptions: Record<string, any[]> = {},
) => {
  const formatted = formatListCellValue(
    {
      key: field.key,
      label: getFieldLabelFa(field, { fallback: field.key }),
      type: field.type,
      options: getFieldOptions(field, dynamicOptions),
    },
    record,
    relationOptions,
    readCurrencyConfig().label || '',
    'fa'
  );

  if (field.type === FieldType.JSON && formatted === '-') {
    const rawValue = record?.[field.key];
    if (Array.isArray(rawValue)) return rawValue.length ? `${toPersianNumber(rawValue.length)} مورد` : '-';
    if (rawValue && typeof rawValue === 'object') return 'داده ساختاریافته';
  }

  return formatted;
};

const MergeRecordsModal: React.FC<MergeRecordsModalProps> = ({
  open,
  moduleConfig,
  records,
  loading = false,
  submitting = false,
  canViewField,
  dynamicOptions = {},
  relationOptions = {},
  onCancel,
  onConfirm,
}) => {
  const [selections, setSelections] = useState<Record<string, string>>({});

  const fields = useMemo(
    () => getMergeableModuleFields(moduleConfig, canViewField),
    [canViewField, moduleConfig]
  );
  const survivorId = String(records[0]?.id || '').trim();
  const duplicateIds = useMemo(
    () => records.slice(1).map((record) => String(record?.id || '').trim()).filter(Boolean),
    [records]
  );

  useEffect(() => {
    if (!open) {
      setSelections({});
      return;
    }
    setSelections(buildDefaultMergeSelections(fields, records));
  }, [fields, open, records]);

  const handleOk = async () => {
    if (!survivorId || duplicateIds.length === 0) return;
    const payload = buildMergePayload(fields, records, selections);
    await onConfirm(payload, { survivorId, duplicateIds });
  };

  const selectedCount = records.length;
  const canSubmit = selectedCount >= 2 && fields.length > 0 && !loading && !submitting;

  return (
    <Modal
      title={`ادغام ${toPersianNumber(selectedCount)} رکورد`}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="ادغام کن"
      cancelText="انصراف"
      confirmLoading={submitting}
      okButtonProps={{ disabled: !canSubmit }}
      width={Math.min(1120, Math.max(760, 300 + records.length * 220))}
      destroyOnHidden
      className="kalam-merge-records-modal"
    >
      <div className="space-y-3" dir="rtl">
        <Alert
          type="info"
          showIcon
          message="رکورد اول به عنوان رکورد نهایی نگه داشته می‌شود. برای هر فیلد مقدار دلخواه را انتخاب کنید؛ بعد از تایید، رکوردهای دیگر به سطل بازیافت منتقل یا حذف می‌شوند."
        />

        {loading ? (
          <div className="flex min-h-52 items-center justify-center">
            <Spin />
          </div>
        ) : fields.length === 0 ? (
          <Empty description="فیلد قابل ادغامی برای این ماژول پیدا نشد." />
        ) : records.length < 2 ? (
          <Empty description="برای ادغام حداقل دو رکورد انتخاب کنید." />
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-gray-200 dark:border-white/10">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-[#171717]">
                <tr>
                  <th className="sticky right-0 z-20 min-w-44 border-b border-l border-gray-200 bg-gray-50 px-3 py-2 text-right font-bold text-gray-700 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200">
                    فیلد
                  </th>
                  {records.map((record, index) => (
                    <th
                      key={String(record.id || index)}
                      className="min-w-52 border-b border-l border-gray-200 px-3 py-2 text-right font-bold text-gray-700 dark:border-white/10 dark:text-gray-200"
                    >
                      <div className="flex flex-col gap-1">
                        <span>{getRecordTitle(moduleConfig, record, index)}</span>
                        {index === 0 ? (
                          <span className="text-[11px] font-normal text-green-600 dark:text-green-300">رکورد نهایی</span>
                        ) : null}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => {
                  const fieldKey = String(field.key || '').trim();
                  return (
                    <tr key={fieldKey} className="align-top">
                      <td className="sticky right-0 z-[1] border-b border-l border-gray-100 bg-white px-3 py-2 font-semibold text-gray-700 dark:border-white/10 dark:bg-[#111827] dark:text-gray-200">
                        {getFieldLabelFa(field, { moduleId: moduleConfig.id, fallback: fieldKey })}
                      </td>
                      {records.map((record, index) => {
                        const recordId = String(record?.id || '').trim();
                        return (
                          <td
                            key={`${fieldKey}_${recordId || index}`}
                            className="border-b border-l border-gray-100 px-3 py-2 dark:border-white/10"
                          >
                            <label className="flex cursor-pointer items-start gap-2">
                              <Radio
                                checked={selections[fieldKey] === recordId}
                                onChange={() => setSelections((prev) => ({ ...prev, [fieldKey]: recordId }))}
                              />
                              <span className="min-w-0 flex-1 break-words leading-7 text-gray-700 dark:text-gray-200">
                                {getDisplayValue(field, record, relationOptions, dynamicOptions)}
                              </span>
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default MergeRecordsModal;
