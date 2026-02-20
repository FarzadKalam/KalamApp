import React, { useEffect, useMemo, useState } from 'react';
import { Popover, Spin, Button } from 'antd';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import SmartFieldRenderer from './SmartFieldRenderer';

interface RelatedRecordPopoverProps {
  moduleId: string;
  recordId: string;
  label?: string;
  children?: React.ReactNode;
}

const isEmptyValue = (value: any) => (
  value === null
  || value === undefined
  || value === ''
  || (Array.isArray(value) && value.length === 0)
);

const RelatedRecordPopover: React.FC<RelatedRecordPopoverProps> = ({ moduleId, recordId, label, children }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, { label: string; value: string }[]>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, { label: string; value: string }[]>>({});

  const moduleConfig = MODULES[moduleId];
  const fields = useMemo(() => (moduleConfig?.fields || []).filter((f) => f.isTableColumn), [moduleConfig]);

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
                : String(field?.relationConfig?.targetField || 'name');

              const targetModuleConfig = MODULES[targetModule];
              const targetTable = targetModuleConfig?.table || targetModule;
              const selectFields = Array.from(new Set(['id', targetField, 'system_code'])).join(', ');

              const { data: relatedRows } = await supabase
                .from(targetTable)
                .select(selectFields)
                .in('id', normalizedValues);

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

  const renderFieldValue = (field: any) => {
    const value = record?.[field.key];
    if (isEmptyValue(value)) {
      return <span className="text-gray-400">-</span>;
    }

    if (typeof value === 'object' && !Array.isArray(value) && field.type !== FieldType.DATE && field.type !== FieldType.DATETIME && field.type !== FieldType.TIME) {
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
    <div className="min-w-[260px] max-w-[360px]">
      {loading ? (
        <div className="py-6 flex items-center justify-center"><Spin size="small" /></div>
      ) : (
        <div className="space-y-2 text-xs text-gray-700">
          {fields.map((field) => (
            <div key={field.key} className="flex items-start justify-between gap-3">
              <span className="text-gray-500 shrink-0">{field.labels?.fa || field.key}</span>
              <div className="text-gray-800 font-medium text-right min-w-0 break-words">
                {renderFieldValue(field)}
              </div>
            </div>
          ))}
          <div className="pt-2 flex justify-end">
            <Button size="small" type="link" onClick={() => window.open(`/${moduleId}/${recordId}`, '_blank')}>
              نمایش کامل
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      getPopupContainer={() => document.body}
      overlayStyle={{ zIndex: 5000 }}
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
