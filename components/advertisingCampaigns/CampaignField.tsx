import React from 'react';
import SmartFieldRenderer from '../SmartFieldRenderer';
import { FieldNature, FieldType, type ModuleField } from '../../types';
import { MODULES } from '../../moduleRegistry';

type CampaignFieldProps = {
  fieldKey: string;
  label: string;
  type?: FieldType;
  value: unknown;
  onChange: (value: any) => void;
  options?: Array<{ label: string; value: string | number; disabled?: boolean; color?: string }>;
  required?: boolean;
  readonly?: boolean;
  moduleId?: string;
  recordId?: string | null;
  allValues?: Record<string, unknown>;
  compact?: boolean;
  dynamicOptionsCategory?: string;
};

const CampaignField: React.FC<CampaignFieldProps> = ({
  fieldKey,
  label,
  type,
  value,
  onChange,
  options,
  required,
  readonly,
  moduleId = 'advertising_campaigns',
  recordId,
  allValues,
  compact,
  dynamicOptionsCategory,
}) => {
  const registeredField = MODULES[moduleId]?.fields?.find((candidate: ModuleField) => candidate.key === fieldKey);
  // برای فیلدهای ثبت‌شدهٔ کمپین، همان تعریف مرکزی ماژول بدون هیچ override
  // محلی استفاده می‌شود؛ درست مانند مسیر ModuleShow و SmartForm. fallback
  // فقط برای کلیدهای پیکربندی داخلیِ ابزارهاست که در schema ماژول ستون ندارند.
  const fallbackField: ModuleField = {
    key: fieldKey,
    labels: { fa: label || fieldKey },
    type: type || FieldType.TEXT,
    nature: FieldNature.STANDARD,
    options: options as any,
    validation: required ? { required: true } : undefined,
    dynamicOptionsCategory,
  };
  const field = registeredField || fallbackField;
  const showMobileLabel = field.type !== FieldType.CHECKBOX;
  return (
    <div className="min-w-0">
      {showMobileLabel ? (
        <div className="mb-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 sm:hidden">
          {label || field.labels.fa}{required ? <span className="mr-1 text-red-500">*</span> : null}
        </div>
      ) : null}
      <SmartFieldRenderer
        field={field}
        value={value}
        onChange={onChange}
        forceEditMode={!readonly}
        standalone
        compactMode={compact}
        options={options || registeredField?.options}
        moduleId={moduleId}
        recordId={recordId || undefined}
        allValues={allValues || { [fieldKey]: value }}
      />
    </div>
  );
};

export default CampaignField;
