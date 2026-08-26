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
  return (
    <SmartFieldRenderer
      field={field}
      value={value}
      onChange={onChange}
      forceEditMode={!readonly}
      compactMode={compact}
      options={options || registeredField?.options}
      moduleId={moduleId}
      recordId={recordId || undefined}
      allValues={allValues || { [fieldKey]: value }}
    />
  );
};

export default CampaignField;
