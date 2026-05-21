import React, { useEffect, useMemo, useState } from 'react';
import { App, Popover, Spin, Button, Modal, Tag } from 'antd';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import SmartFieldRenderer from './SmartFieldRenderer';
import PhoneActionsPopover from './PhoneActionsPopover';
import RecordMessageActions from './RecordMessageActions';
import { getFieldLabelFa } from '../utils/fieldLabel';
import { formatPersianPrice, toPersianNumber } from '../utils/persianNumberFormatter';
import { getPrimaryRecordPhone, hasAnyRecordBotTarget } from '../utils/recordMessaging';
import { fetchRecordTagsMap } from '../utils/referenceData';
import { fetchCurrentUserRolePermissions, type PermissionMap } from '../utils/permissions';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { getRecordDisplayLabel } from '../utils/recordLabel';
import { fetchRelationOptionsForField } from '../utils/relationOptions';
import ResilientImage from './common/ResilientImage';

interface RelatedRecordPopoverProps {
  moduleId: string;
  recordId: string;
  label?: string;
  children?: React.ReactNode;
  mode?: 'popover' | 'modal';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  overlayZIndex?: number;
  onNavigate?: (path: string) => void;
  hideFullRecordAction?: boolean;
}

const isEmptyValue = (value: any) => (
  value === null
  || value === undefined
  || value === ''
  || (Array.isArray(value) && value.length === 0)
);

const COLOR_MAP: Record<string, string> = {
  green: '#16a34a',
  red: '#dc2626',
  blue: '#2563eb',
  orange: '#ea580c',
  yellow: '#ca8a04',
  purple: '#7c3aed',
  cyan: '#0891b2',
  gray: '#64748b',
  grey: '#64748b',
};

const toEnglishDigits = (raw: string) =>
  raw
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

const formatNumericText = (value: any) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = toEnglishDigits(raw).replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return toPersianNumber(raw);
  }
  return formatPersianPrice(normalized, true);
};

const normalizeEditableField = (field: any) => (
  field?.type === FieldType.USER
    ? {
        ...field,
        type: FieldType.RELATION,
        relationConfig: { targetModule: 'profiles', targetField: 'full_name' },
      }
    : field
);

const resolveUpdateTable = (moduleId: string, moduleConfig: any) => {
  if (moduleId === 'sms_delivery_reports') return 'outbound_messages';
  return moduleConfig?.table || moduleId;
};

const isEqualFieldValue = (a: any, b: any) => {
  if (a === b) return true;
  if (a === undefined && (b === null || b === '')) return true;
  if (b === undefined && (a === null || a === '')) return true;
  if ((a === null && b === '') || (a === '' && b === null)) return true;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }
  return String(a ?? '') === String(b ?? '');
};

const resolveStatusColor = (rawColor: any) => {
  const color = String(rawColor || '').trim().toLowerCase();
  if (!color) return '#475569';
  if (color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl')) return color;
  return COLOR_MAP[color] || '#475569';
};

const getPlainObject = (value: any): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const SMS_PROVIDER_STATUS_LABELS: Record<string, string> = {
  provider_accepted: 'پذیرفته‌شده توسط سرویس‌دهنده',
  sent: 'ارسال شده',
  delivered: 'رسیده به گوشی',
  not_delivered: 'نرسیده به گوشی',
  operator_failed: 'خطای مخابراتی',
  filtered: 'فیلتر شده',
  blacklisted: 'لیست سیاه',
  unknown_delivery: 'وضعیت تحویل نامشخص',
  failed: 'ناموفق',
};

const RelatedRecordPopover: React.FC<RelatedRecordPopoverProps> = ({
  moduleId,
  recordId,
  label,
  children,
  mode = 'popover',
  open: controlledOpen,
  onOpenChange,
  overlayZIndex = 5000,
  onNavigate,
  hideFullRecordAction = false,
}) => {
  const { message } = App.useApp();
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingQuickPreview, setSavingQuickPreview] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [draftRecord, setDraftRecord] = useState<any>(null);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, { label: string; value: string }[]>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, { label: string; value: string }[]>>({});
  const [rolePermissions, setRolePermissions] = useState<PermissionMap | null>(null);
  const isMobileViewport = typeof window !== 'undefined' ? window.innerWidth < 768 : false;

  const moduleConfig = MODULES[moduleId];
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? !!controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (mode !== 'modal' || !open || typeof window === 'undefined') return;
    const stateKey = `quickPreview:${moduleId}:${recordId}`;
    window.history.pushState({ quickPreviewModal: stateKey }, '', window.location.href);
    const handlePopState = () => setOpen(false);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [mode, moduleId, open, recordId]);

  const fields = useMemo(() => {
    const allFields = (moduleConfig?.fields || []).filter((field: any) => field.type !== FieldType.IMAGE);
    const quickPreviewKeys = (moduleConfig?.quickPreview?.fieldKeys || [])
      .map((key: any) => String(key || '').trim())
      .filter(Boolean);

    if (quickPreviewKeys.length > 0) {
      const byKey = new Map(allFields.map((field: any) => [String(field.key), field]));
      return quickPreviewKeys
        .map((key: string) => byKey.get(key))
        .filter(Boolean) as any[];
    }

    return allFields.filter((field: any) => field.isTableColumn);
  }, [moduleConfig]);

  const editableFieldKeys = useMemo(() => new Set(
    (moduleConfig?.quickPreview?.editableFields || [])
      .map((key: any) => String(key || '').trim())
      .filter(Boolean)
  ), [moduleConfig]);

  const editableFields = useMemo(
    () => fields.filter((field: any) => editableFieldKeys.has(String(field.key || ''))),
    [editableFieldKeys, fields]
  );

  const canEditModule = moduleConfig ? rolePermissions?.[moduleId]?.edit !== false : false;
  const canEditField = (field: any) => {
    const fieldKey = String(field?.key || '').trim();
    if (!fieldKey || !editableFieldKeys.has(fieldKey)) return false;
    if (!canEditModule) return false;
    return rolePermissions?.[moduleId]?.fields?.[fieldKey] !== false;
  };

  const audioFieldKey = String(moduleConfig?.quickPreview?.audioField || '').trim();
  const audioUrl = audioFieldKey ? String(draftRecord?.[audioFieldKey] || record?.[audioFieldKey] || '').trim() : '';

  const hasDirtyQuickPreview = useMemo(() => (
    editableFields.some((field: any) => {
      if (field.type === FieldType.TAGS) return false;
      return !isEqualFieldValue(record?.[field.key], draftRecord?.[field.key]);
    })
  ), [draftRecord, editableFields, record]);

  const previewImageUrl = useMemo(() => {
    if (!record || !moduleConfig) return '';
    const imageField = (moduleConfig.fields || []).find(
      (field: any) => field?.type === FieldType.IMAGE && String(record?.[field.key] || '').trim()
    );
    if (imageField) return String(record?.[imageField.key] || '').trim();
    const fallbackKeys = ['image_url', 'avatar_url', 'logo_url'];
    for (const key of fallbackKeys) {
      const value = String(record?.[key] || '').trim();
      if (value) return value;
    }
    return '';
  }, [moduleConfig, record]);

  const statusMeta = useMemo(() => {
    if (!moduleConfig || !record) return null;
    const statusField = (moduleConfig.fields || []).find((f: any) => String(f?.key || '') === 'status');
    if (!statusField) return null;
    const rawStatus = String(record?.status || '').trim();
    if (!rawStatus) return null;
    const option = (statusField.options || []).find((opt: any) => String(opt?.value || '') === rawStatus);
    return {
      label: String(option?.label || rawStatus),
      color: resolveStatusColor(option?.color),
    };
  }, [moduleConfig, record]);

  const smsProviderDetails = useMemo(() => {
    if (moduleId !== 'sms_delivery_reports' || !record) return [];
    const metadata = getPlainObject(record?.metadata);
    const details = [
      {
        key: 'provider_message_id',
        label: 'شناسه پیام ملی‌پیامک',
        value: record?.provider_message_id || metadata.provider_result,
      },
      {
        key: 'provider_status',
        label: 'وضعیت پاسخ API',
        value: metadata.provider_status_text || metadata.provider_status,
      },
      {
        key: 'delivery_code',
        label: 'کد تحویل ملی‌پیامک',
        value: metadata.delivery_code,
      },
      {
        key: 'delivery_label',
        label: 'شرح تحویل',
        value: metadata.delivery_label || SMS_PROVIDER_STATUS_LABELS[String(metadata.delivery_status || record?.status || '').trim()],
      },
      {
        key: 'provider_method',
        label: 'روش ارسال/استعلام',
        value: [metadata.provider_method, metadata.delivery_method].filter(Boolean).join(' / '),
      },
      {
        key: 'delivery_error',
        label: 'خطای استعلام تحویل',
        value: metadata.delivery_error,
      },
      {
        key: 'provider_raw',
        label: 'پاسخ خام ارسال',
        value: metadata.provider_raw,
      },
      {
        key: 'delivery_raw',
        label: 'پاسخ خام تحویل',
        value: metadata.delivery_raw,
      },
    ];

    return details
      .map((item) => ({ ...item, value: String(item.value ?? '').trim() }))
      .filter((item) => item.value);
  }, [moduleId, record]);

  const previewTitle = useMemo(() => {
    if (!moduleConfig) return label || recordId || '-';
    return getRecordDisplayLabel(record || {}, moduleId, { fallback: label || recordId || '-' });
  }, [label, moduleConfig, moduleId, record, recordId]);

  const hasQuickMessageActions = useMemo(() => {
    if (!record) return false;
    return Boolean(getPrimaryRecordPhone(moduleId, record) || hasAnyRecordBotTarget(record));
  }, [moduleId, record]);

  useEffect(() => {
    if (!open || !moduleConfig) return;
    let cancelled = false;
    const loadPermissions = async () => {
      const permissions = await fetchCurrentUserRolePermissions(supabase).catch(() => null);
      if (!cancelled) setRolePermissions(permissions);
    };
    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, [moduleConfig, open]);

  useEffect(() => {
    if (!open || !moduleConfig || !recordId) return;
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from(moduleConfig.table || moduleId)
          .select('*')
          .eq('id', recordId)
          .single();
        if (error) throw error;
        if (cancelled) return;
        let nextRecord = data || null;
        const tagsField = fields.find((field: any) => field.type === FieldType.TAGS);
        if (nextRecord && tagsField) {
          const tagsMap = (await fetchRecordTagsMap(supabase, moduleId, [recordId]).catch(() => ({}))) as Record<string, any[]>;
          nextRecord = {
            ...nextRecord,
            [tagsField.key]: tagsMap[String(recordId)] || [],
          };
        }
        if (cancelled) return;
        setRecord(nextRecord);
        setDraftRecord(nextRecord);

        const categorySet = new Set<string>();
        fields.forEach((field: any) => {
          if (field.dynamicOptionsCategory) categorySet.add(String(field.dynamicOptionsCategory));
        });

        const dynEntries = await Promise.all(
          Array.from(categorySet).map(async (category) => {
            const { data: options } = await supabase
              .from('dynamic_options')
              .select('label, value')
              .eq('category', category)
              .eq('is_active', true)
              .order('display_order', { ascending: true });
            return [category, (options || []).map((option: any) => ({
              label: String(option?.label || ''),
              value: String(option?.value || ''),
            }))] as const;
          })
        );
        if (!cancelled) {
          setDynamicOptions(Object.fromEntries(dynEntries));
        }

        const relationEntries = await Promise.all(
          fields
            .filter((field: any) => (
              field.type === FieldType.RELATION
              || field.type === FieldType.MULTI_RELATION
              || field.type === FieldType.USER
            ))
            .map(async (field: any) => {
              const rawValue = nextRecord?.[field.key];
              if (isEmptyValue(rawValue)) return [field.key, []] as const;

              const normalizedValues = Array.isArray(rawValue)
                ? rawValue.map((item) => String(item ?? '').trim()).filter(Boolean)
                : [String(rawValue ?? '').trim()].filter(Boolean);

              if (normalizedValues.length === 0) return [field.key, []] as const;

              if (field.type === FieldType.USER) {
                const { data: relatedRows } = await supabase
                  .from('profiles')
                  .select('id, full_name')
                  .in('id', normalizedValues);
                const byId = new Map<string, { label: string; value: string }>();
                (relatedRows || []).forEach((row: any) => {
                  const id = String(row?.id || '').trim();
                  if (!id) return;
                  byId.set(id, {
                    label: String(row?.full_name || row?.id || id).trim(),
                    value: id,
                    module: 'profiles',
                  } as any);
                });
                return [field.key, normalizedValues.map((id) => byId.get(id) || { label: id, value: id })] as const;
              }

              const relationConfig = field.type === FieldType.MULTI_RELATION
                ? field?.multiRelationConfig
                : field?.relationConfig;
              if (!relationConfig?.targetModule) return [field.key, []] as const;
              const effectiveField = field.type === FieldType.MULTI_RELATION
                ? { ...field, relationConfig }
                : field;
              const optionGroups = await Promise.all(
                normalizedValues.map((exactId) =>
                  fetchRelationOptionsForField(supabase, effectiveField, {
                    allValues: nextRecord || undefined,
                    exactId,
                    limit: 1,
                  }).catch(() => [])
                )
              );
              const options = Array.from(
                new Map(
                  optionGroups
                    .flat()
                    .map((option: any) => [String(option?.value || '').trim(), option] as const)
                ).values()
              );
              return [field.key, options] as const;
            })
        );

        if (!cancelled) {
          setRelationOptions(Object.fromEntries(relationEntries));
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setRecord(null);
          setDraftRecord(null);
          setDynamicOptions({});
          setRelationOptions({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [fields, moduleConfig, moduleId, open, recordId]);

  const openFullRecord = () => {
    const path = `/${moduleId}/${recordId}`;
    if (onNavigate) {
      onNavigate(path);
      setOpen(false);
      return;
    }
    window.open(path, '_blank');
  };

  const handleDraftChange = (field: any, nextValue: any) => {
    const fieldKey = String(field?.key || '');
    setDraftRecord((prev: any) => {
      const next = { ...(prev || {}) };
      next[fieldKey] = nextValue;
      if (fieldKey === 'module_id') {
        next.record_id = null;
      }
      return next;
    });
  };

  const handleSaveQuickPreview = async () => {
    if (!moduleConfig || !record || !draftRecord || !canEditModule) return;
    const patch: Record<string, any> = {};
    editableFields.forEach((field: any) => {
      const fieldKey = String(field?.key || '').trim();
      if (!fieldKey || !canEditField(field) || field.type === FieldType.TAGS) return;
      if (!isEqualFieldValue(record?.[fieldKey], draftRecord?.[fieldKey])) {
        const nextValue = field.type === FieldType.MULTI_RELATION
          ? (
              Array.isArray(draftRecord?.[fieldKey])
                ? draftRecord[fieldKey].map((item: any) => String(item ?? '').trim()).filter(Boolean)
                : []
            )
          : draftRecord?.[fieldKey];
        patch[fieldKey] = field.type === FieldType.MULTI_RELATION
          ? (nextValue.length > 0 ? nextValue : null)
          : (nextValue ?? null);
      }
    });

    if (Object.keys(patch).length === 0) {
      message.info('تغییری برای ذخیره وجود ندارد.');
      return;
    }

    setSavingQuickPreview(true);
    try {
      const { error } = await supabase
        .from(resolveUpdateTable(moduleId, moduleConfig))
        .update(patch)
        .eq('id', recordId);
      if (error) throw error;
      const nextRecord = { ...(record || {}), ...patch };
      setRecord(nextRecord);
      setDraftRecord(nextRecord);
      message.success('تغییرات ذخیره شد.');
    } catch (err: any) {
      console.error(err);
      message.error(toFaErrorMessage(err, 'ذخیره تغییرات ناموفق بود.'));
    } finally {
      setSavingQuickPreview(false);
    }
  };

  const renderFieldValue = (field: any) => {
    const normalizedField = normalizeEditableField(field);
    const isEditable = canEditField(field);
    const sourceRecord = isEditable ? (draftRecord || record || {}) : (record || {});
    const value = sourceRecord?.[field.key];
    if (isEmptyValue(value)) {
      if (!isEditable) {
        return <span className="text-gray-400">-</span>;
      }
    }

    if (!isEditable && (
      field.type === FieldType.NUMBER
      || field.type === FieldType.STOCK
      || field.type === FieldType.PRICE
      || field.type === FieldType.PERCENTAGE
      || field.type === FieldType.PERCENTAGE_OR_AMOUNT
    )) {
      const formatted = formatNumericText(value);
      if (field.type === FieldType.PERCENTAGE) {
        return <span className="font-semibold persian-number">{formatted}%</span>;
      }
      return <span className="font-semibold persian-number">{formatted}</span>;
    }

    if (!isEditable && field.type === FieldType.PHONE) {
      return <PhoneActionsPopover value={value} moduleId={moduleId} record={record} className="font-medium break-words" />;
    }

    if (!isEditable && (field.type === FieldType.TEXT || field.type === FieldType.LONG_TEXT || field.type === FieldType.SUPER_LONG_TEXT)) {
      return <span className="font-medium break-words">{toPersianNumber(String(value))}</span>;
    }

    if (
      !isEditable
      &&
      typeof value === 'object'
      && !Array.isArray(value)
      && field.type !== FieldType.DATE
      && field.type !== FieldType.DATETIME
      && field.type !== FieldType.TIME
    ) {
      return <span className="font-medium">{JSON.stringify(value)}</span>;
    }

    const fieldOptions = normalizedField.dynamicOptionsCategory
      ? (dynamicOptions[normalizedField.dynamicOptionsCategory] || [])
      : ((normalizedField.type === FieldType.RELATION || normalizedField.type === FieldType.MULTI_RELATION)
        ? (relationOptions[normalizedField.key] || [])
        : (normalizedField.options || []));

    return (
      <SmartFieldRenderer
        field={normalizedField}
        value={value}
        onChange={(nextValue: any) => handleDraftChange(field, nextValue)}
        onOptionsUpdate={((nextValue: any) => handleDraftChange(field, nextValue)) as any}
        forceEditMode={isEditable}
        compactMode
        options={fieldOptions}
        allValues={sourceRecord}
        recordId={recordId}
        moduleId={moduleId}
        overlayZIndexBase={overlayZIndex + 100}
      />
    );
  };

  const content = (
    <div
      className={`max-w-full bg-white p-3 dark:bg-[#1d1d1d] ${
        mode === 'modal'
          ? 'h-full rounded-none border-0'
          : 'rounded-2xl border border-gray-200 dark:border-gray-700'
      }`}
      style={{
        width: isMobileViewport ? 'calc(100vw - 1rem)' : 'min(92vw, 480px)',
        maxWidth: 'calc(100vw - 1rem)',
        maxHeight: mode === 'modal'
          ? (isMobileViewport ? '100dvh' : 'min(calc(100vh - 4rem), 42rem)')
          : (isMobileViewport ? 'calc(100dvh - 1rem)' : 'calc(100vh - 4rem)'),
        overflow: 'hidden',
      }}
    >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-gray-800 dark:text-gray-100 truncate">{previewTitle}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-300 mt-0.5">{moduleConfig?.titles?.fa || moduleId}</div>
          </div>
          {statusMeta && (
            <Tag
              className="!m-0 !rounded-full !px-2 !py-0.5 !text-[11px] !font-semibold !border-0"
              style={{
                backgroundColor: `${statusMeta.color}22`,
                color: statusMeta.color,
              }}
            >
              {statusMeta.label}
            </Tag>
          )}
        </div>

        {!loading && record && hasQuickMessageActions && (
          <div className="mb-3 flex items-center justify-end">
            <RecordMessageActions moduleId={moduleId} record={record} compact />
          </div>
        )}

        {previewImageUrl && (
          <div className="mb-3 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-black/20">
            <ResilientImage src={previewImageUrl} preset="card" alt={previewTitle} className="w-full h-36 object-cover" />
          </div>
        )}

        {!loading && record && audioUrl && (
          <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-white/5">
            <div className="mb-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300">فایل صوتی تماس</div>
            <audio controls src={audioUrl} className="w-full" />
          </div>
        )}

        {loading ? (
          <div className="py-8 flex items-center justify-center"><Spin size="small" /></div>
        ) : (
          <div
            className="space-y-2 text-xs text-gray-700 dark:text-gray-200 overflow-auto pr-1"
            style={{ maxHeight: previewImageUrl ? 'min(calc(100vh - 20rem), 30rem)' : 'min(calc(100vh - 16rem), 34rem)' }}
          >
            {fields.map((field) => (
              <div key={field.key} className="grid grid-cols-[110px_1fr] gap-2 items-start border-b border-gray-100 dark:border-gray-800 pb-1.5">
                <span className="text-gray-500 dark:text-gray-400">{getFieldLabelFa(field, { moduleId, fallback: field.key })}</span>
                <div className="text-right min-w-0 break-words">{renderFieldValue(field)}</div>
              </div>
            ))}
            {smsProviderDetails.length > 0 && (
              <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/60 p-2 dark:border-cyan-900/50 dark:bg-cyan-950/20">
                <div className="mb-2 text-[11px] font-bold text-cyan-800 dark:text-cyan-200">جزئیات ملی‌پیامک</div>
                <div className="space-y-1.5">
                  {smsProviderDetails.map((item) => (
                    <div key={item.key} className="grid grid-cols-[120px_1fr] gap-2 items-start">
                      <span className="text-gray-500 dark:text-gray-400">{item.label}</span>
                      <span className="min-w-0 break-words font-medium persian-number text-gray-800 dark:text-gray-100">
                        {toPersianNumber(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && record && editableFields.length > 0 && (
          <div className="pt-2 mt-2 flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800">
            {hasDirtyQuickPreview ? (
              <span className="text-[11px] text-gray-500 dark:text-gray-400">تغییرات ذخیره نشده</span>
            ) : null}
            <Button
              size="small"
              type="primary"
              loading={savingQuickPreview}
              disabled={!canEditModule || !hasDirtyQuickPreview}
              onClick={handleSaveQuickPreview}
            >
              ذخیره
            </Button>
          </div>
        )}

        {!hideFullRecordAction ? (
          <div className="pt-2 mt-2 flex justify-end border-t border-gray-100 dark:border-gray-800">
            <Button size="small" type="link" onClick={openFullRecord}>
              {'\u0646\u0645\u0627\u06CC\u0634 \u06A9\u0627\u0645\u0644'}
            </Button>
          </div>
        ) : null}
    </div>
  );

  if (mode === 'modal') {
    return (
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        title={null}
        centered
        destroyOnHidden
        width={isMobileViewport ? 'calc(100vw - 1rem)' : 500}
        zIndex={overlayZIndex}
        className="quick-preview-modal"
        wrapClassName="quick-preview-modal-root"
        style={{ maxWidth: 'calc(100vw - 1rem)' }}
        styles={{
          body: { padding: 0, overflow: 'hidden' },
          content: { overflow: 'hidden', padding: 0, borderRadius: isMobileViewport ? 0 : 24 },
        }}
      >
        {content}
      </Modal>
    );
  }

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement={isMobileViewport ? 'bottom' : 'leftTop'}
      getPopupContainer={() => document.body}
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
      overlayStyle={{ zIndex: overlayZIndex, maxWidth: 'calc(100vw - 1rem)', maxHeight: 'calc(100vh - 1rem)' }}
    >
      {children || (
        <span className="text-leather-600 cursor-pointer hover:underline">
          {label || recordId}
        </span>
      )}
    </Popover>
  );
};

export default RelatedRecordPopover;

