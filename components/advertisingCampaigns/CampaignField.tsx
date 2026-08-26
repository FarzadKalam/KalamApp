import React from 'react';
import SmartFieldRenderer from '../SmartFieldRenderer';
import { FieldNature, FieldType, type ModuleField } from '../../types';
import { MODULES } from '../../moduleRegistry';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';

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
  const field: ModuleField = {
    ...(registeredField || {}),
    key: fieldKey,
    labels: { ...(registeredField?.labels || {}), fa: label || registeredField?.labels?.fa || fieldKey },
    type: type || registeredField?.type || FieldType.TEXT,
    nature: registeredField?.nature || FieldNature.STANDARD,
    options: options as any || registeredField?.options,
    validation: required ? { ...(registeredField?.validation || {}), required: true } : registeredField?.validation,
    readonly: Boolean(readonly || registeredField?.readonly),
    dynamicOptionsCategory: dynamicOptionsCategory || registeredField?.dynamicOptionsCategory,
  };
  const isTemporalField = field.type === FieldType.DATE || field.type === FieldType.TIME || field.type === FieldType.DATETIME;
  return (
    <SmartFieldRenderer
      field={field}
      // تاریخ‌ها فقط از وضعیت واحد wizard خوانده می‌شوند. نگه‌داشتن یک
      // state محلی باعث می‌شد بعد از ذخیره یا همگام‌سازی realtime، متن بعضی
      // pickerهای کمپین با مقدار واقعی رکورد از هم جدا شود.
      value={isTemporalField && value != null ? String(value) : value}
      onChange={onChange}
      forceEditMode={!readonly}
      compactMode={compact}
      options={options}
      moduleId={moduleId}
      recordId={recordId || undefined}
      allValues={allValues || { [fieldKey]: value }}
      overlayZIndexBase={13200}
      popupContainer={resolveOverlayPopupContainer}
      preferLocalPopupContainer
    />
  );
};

export default CampaignField;
