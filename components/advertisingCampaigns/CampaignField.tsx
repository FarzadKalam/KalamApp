import React from 'react';
import SmartFieldRenderer from '../SmartFieldRenderer';
import { FieldNature, FieldType, type ModuleField } from '../../types';
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
  type = FieldType.TEXT,
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
  const field: ModuleField = {
    key: fieldKey,
    labels: { fa: label },
    type,
    nature: FieldNature.STANDARD,
    options: options as any,
    validation: required ? { required: true } : undefined,
    readonly,
    dynamicOptionsCategory,
  };
  return (
    <SmartFieldRenderer
      field={field}
      value={value}
      onChange={onChange}
      forceEditMode={!readonly}
      compactMode={compact}
      options={options}
      moduleId={moduleId}
      recordId={recordId || undefined}
      allValues={allValues}
      overlayZIndexBase={13200}
      popupContainer={resolveOverlayPopupContainer}
      preferLocalPopupContainer
    />
  );
};

export default CampaignField;
