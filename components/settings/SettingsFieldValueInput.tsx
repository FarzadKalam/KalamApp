import React from 'react';
import { Input } from 'antd';
import { ModuleField } from '../../types';
import SmartFieldRenderer from '../SmartFieldRenderer';

interface SettingsFieldValueInputProps {
  field?: ModuleField;
  value: any;
  onChange: (nextValue: any) => void;
  moduleId?: string;
  disabled?: boolean;
  popupContainer?: (trigger?: HTMLElement | null) => HTMLElement;
}

const SettingsFieldValueInput: React.FC<SettingsFieldValueInputProps> = ({
  field,
  value,
  onChange,
  moduleId,
  disabled = false,
  popupContainer,
}) => {
  if (!field) {
    return <Input value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
  }

  return (
    <div className={disabled ? 'pointer-events-none opacity-70' : ''}>
      <SmartFieldRenderer
        field={field}
        value={value}
        onChange={onChange}
        moduleId={moduleId}
        compactMode
        forceEditMode
        disableRequired
        popupContainer={popupContainer}
      />
    </div>
  );
};

export default SettingsFieldValueInput;
