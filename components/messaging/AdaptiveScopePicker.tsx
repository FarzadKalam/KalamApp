import React from 'react';
import AdaptiveSelectField from '../AdaptiveSelectField';
import QrScanPopover from '../QrScanPopover';

type Option = {
  label: React.ReactNode;
  value: string;
  [key: string]: any;
};

interface AdaptiveScopePickerProps {
  moduleId: string | null;
  recordId: string | null;
  moduleOptions: Option[];
  recordOptions: Option[];
  onModuleChange: (value: string | null) => void;
  onRecordChange: (value: string | null) => void;
  modulePlaceholder?: string;
  recordPlaceholder?: string;
  compact?: boolean;
  disabled?: boolean;
}

const AdaptiveScopePicker: React.FC<AdaptiveScopePickerProps> = ({
  moduleId,
  recordId,
  moduleOptions,
  recordOptions,
  onModuleChange,
  onRecordChange,
  modulePlaceholder = 'ماژول',
  recordPlaceholder = 'رکورد',
  compact = false,
  disabled = false,
}) => (
  <div
    dir="rtl"
    className={compact ? 'flex min-w-0 w-full items-center gap-2 overflow-hidden' : 'flex min-w-0 w-full items-center flex-wrap gap-2 overflow-hidden'}
  >
    <AdaptiveSelectField
      placeholder={modulePlaceholder}
      value={moduleId || undefined}
      onChange={(value) => onModuleChange(String(value || '').trim() || null)}
      options={moduleOptions}
      size="small"
      disabled={disabled}
      className={compact ? 'min-w-[112px] max-w-[112px] shrink-0' : 'min-w-[120px] max-w-full'}
      styles={{ popup: { root: { minWidth: 220 } } }}
    />
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      <AdaptiveSelectField
        placeholder={recordPlaceholder}
        value={recordId || undefined}
        onChange={(value) => onRecordChange(String(value || '').trim() || null)}
        options={recordOptions}
        size="small"
        showSearch
        optionFilterProp="label"
        disabled={disabled || !moduleId}
        className="min-w-0 flex-1 max-w-full"
        style={{ width: '100%' }}
        styles={{ popup: { root: { minWidth: 280 } } }}
      />
      <div className="shrink-0">
        <QrScanPopover
          label=""
          buttonProps={{ type: 'default', shape: 'circle', size: 'small' }}
          buttonClassName="text-[rgba(var(--brand-700-rgb),0.85)] dark:text-[rgba(var(--brand-300-rgb),0.9)] hover:text-leather-500"
          onScan={({ moduleId: scannedModuleId, recordId: scannedRecordId }) => {
            if (!scannedModuleId || !scannedRecordId) return;
            onModuleChange(scannedModuleId);
            onRecordChange(scannedRecordId);
          }}
        />
      </div>
    </div>
  </div>
);

export default AdaptiveScopePicker;
