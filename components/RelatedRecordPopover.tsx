import React, { useEffect, useMemo, useState } from 'react';
import { Popover, Spin, Button, Modal, Tag } from 'antd';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import SmartFieldRenderer from './SmartFieldRenderer';
import PhoneActionsPopover from './PhoneActionsPopover';
import RecordMessageActions from './RecordMessageActions';
import { getRecordTitle } from '../utils/recordTitle';
import { formatPersianPrice, toPersianNumber } from '../utils/persianNumberFormatter';
import { getPrimaryRecordPhone, hasAnyRecordBotTarget } from '../utils/recordMessaging';
import { supportsSystemCode } from '../utils/systemCode';
import { getPreferredRelationTargetField } from '../utils/relationTargetField';

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

const resolveStatusColor = (rawColor: any) => {
  const color = String(rawColor || '').trim().toLowerCase();
  if (!color) return '#475569';
  if (color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl')) return color;
  return COLOR_MAP[color] || '#475569';
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
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, { label: string; value: string }[]>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, { label: string; value: string }[]>>({});

  const moduleConfig = MODULES[moduleId];
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? !!controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const fields = useMemo(
    () => (moduleConfig?.fields || []).filter((f) => f.isTableColumn && f.type !== FieldType.IMAGE),
    [moduleConfig]
  );

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

  const previewTitle = useMemo(() => {
    if (!moduleConfig) return label || recordId || '-';
    return getRecordTitle(record || {}, moduleConfig, { fallback: label || recordId || '-' });
  }, [label, moduleConfig, record, recordId]);

  const hasQuickMessageActions = useMemo(() => {
    if (!record) return false;
    return Boolean(getPrimaryRecordPhone(moduleId, record) || hasAnyRecordBotTarget(record));
  }, [moduleId, record]);

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
        setRecord(data || null);

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
            .filter((field: any) => field.type === FieldType.RELATION || field.type === FieldType.USER)
            .map(async (field: any) => {
              const rawValue = data?.[field.key];
              if (isEmptyValue(rawValue)) return [field.key, []] as const;

              const normalizedValues = Array.isArray(rawValue)
                ? rawValue.map((item) => String(item))
                : [String(rawValue)];

              const targetModule = field.type === FieldType.USER
                ? 'profiles'
                : String(field?.relationConfig?.targetModule || '');
              if (!targetModule) return [field.key, []] as const;

              const targetField = field.type === FieldType.USER
                ? 'full_name'
                : getPreferredRelationTargetField(targetModule, String(field?.relationConfig?.targetField || ''));

              const targetModuleConfig = MODULES[targetModule];
              const targetTable = targetModuleConfig?.table || targetModule;
              const includeSystemCode = targetModule !== 'cheques' && supportsSystemCode(targetModule);
              const selectFields = Array.from(new Set(['id', targetField, ...(includeSystemCode ? ['system_code'] : [])])).join(', ');

              let relatedRows: any[] = [];
              const primary = await supabase
                .from(targetTable)
                .select(selectFields)
                .in('id', normalizedValues);
              if (primary.error) {
                const errorCode = String((primary.error as any)?.code || '').toUpperCase();
                const errorText = String((primary.error as any)?.message || (primary.error as any)?.details || '').toLowerCase();
                const isMissingColumn = errorCode === '42703' || errorCode === 'PGRST204' || errorText.includes('column');
                if (includeSystemCode && isMissingColumn) {
                  const fallback = await supabase
                    .from(targetTable)
                    .select(Array.from(new Set(['id', targetField])).join(', '))
                    .in('id', normalizedValues);
                  relatedRows = (fallback.data || []) as any[];
                } else {
                  throw primary.error;
                }
              } else {
                relatedRows = (primary.data || []) as any[];
              }

              const byId = new Map<string, { label: string; value: string }>();
              (relatedRows || []).forEach((row: any) => {
                const id = String(row?.id || '');
                if (!id) return;
                const baseLabel = String(
                  row?.[targetField]
                  || row?.name
                  || row?.title
                  || row?.business_name
                  || row?.full_name
                  || row?.system_code
                  || id
                );
                const systemCode = row?.system_code ? String(row.system_code) : '';
                const finalLabel = systemCode && !baseLabel.includes(systemCode)
                  ? `${baseLabel} (${systemCode})`
                  : baseLabel;
                byId.set(id, { label: finalLabel, value: id });
              });

              const options = normalizedValues.map((id) => byId.get(id) || { label: id, value: id });
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

  const renderFieldValue = (field: any) => {
    const value = record?.[field.key];
    if (isEmptyValue(value)) {
      return <span className="text-gray-400">-</span>;
    }

    if (
      field.type === FieldType.NUMBER
      || field.type === FieldType.STOCK
      || field.type === FieldType.PRICE
      || field.type === FieldType.PERCENTAGE
      || field.type === FieldType.PERCENTAGE_OR_AMOUNT
    ) {
      const formatted = formatNumericText(value);
      if (field.type === FieldType.PERCENTAGE) {
        return <span className="font-semibold persian-number">{formatted}%</span>;
      }
      return <span className="font-semibold persian-number">{formatted}</span>;
    }

    if (field.type === FieldType.PHONE) {
      return <PhoneActionsPopover value={value} moduleId={moduleId} record={record} className="font-medium break-words" />;
    }

    if (field.type === FieldType.TEXT || field.type === FieldType.LONG_TEXT || field.type === FieldType.SUPER_LONG_TEXT) {
      return <span className="font-medium break-words">{toPersianNumber(String(value))}</span>;
    }

    if (
      typeof value === 'object'
      && !Array.isArray(value)
      && field.type !== FieldType.DATE
      && field.type !== FieldType.DATETIME
      && field.type !== FieldType.TIME
    ) {
      return <span className="font-medium">{JSON.stringify(value)}</span>;
    }

    const normalizedField = field.type === FieldType.USER
      ? {
          ...field,
          type: FieldType.RELATION,
          relationConfig: { targetModule: 'profiles', targetField: 'full_name' },
        }
      : field;

    const fieldOptions = normalizedField.dynamicOptionsCategory
      ? (dynamicOptions[normalizedField.dynamicOptionsCategory] || [])
      : (normalizedField.type === FieldType.RELATION
        ? (relationOptions[normalizedField.key] || [])
        : (normalizedField.options || []));

    return (
      <SmartFieldRenderer
        field={normalizedField}
        value={value}
        onChange={() => undefined}
        forceEditMode={false}
        compactMode
        options={fieldOptions}
        allValues={record || {}}
        recordId={recordId}
        moduleId={moduleId}
      />
    );
  };

  const content = (
    <div className="min-w-[300px] max-w-[420px]">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gradient-to-b from-white to-gray-50 dark:from-[#1d1d1d] dark:to-[#171717] p-3">
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
            <img src={previewImageUrl} alt={previewTitle} className="w-full h-36 object-cover" />
          </div>
        )}

        {loading ? (
          <div className="py-8 flex items-center justify-center"><Spin size="small" /></div>
        ) : (
          <div className="space-y-2 text-xs text-gray-700 dark:text-gray-200 max-h-[52vh] overflow-auto pr-1">
            {fields.map((field) => (
              <div key={field.key} className="grid grid-cols-[110px_1fr] gap-2 items-start border-b border-gray-100 dark:border-gray-800 pb-1.5">
                <span className="text-gray-500 dark:text-gray-400">{field.labels?.fa || field.key}</span>
                <div className="text-right min-w-0 break-words">{renderFieldValue(field)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 mt-2 flex justify-end border-t border-gray-100 dark:border-gray-800">
          <Button size="small" type="link" onClick={openFullRecord}>
            {'\u0646\u0645\u0627\u06CC\u0634 \u06A9\u0627\u0645\u0644'}
          </Button>
        </div>
      </div>
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
        width={460}
        zIndex={overlayZIndex}
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
      getPopupContainer={(node) => node?.parentElement || document.body}
      overlayStyle={{ zIndex: overlayZIndex }}
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

