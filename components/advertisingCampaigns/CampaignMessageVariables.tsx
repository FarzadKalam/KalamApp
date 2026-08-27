import React, { useMemo } from 'react';
import { Typography } from 'antd';
import AdaptiveSelectField from '../AdaptiveSelectField';
import type { CampaignAudienceRule } from './types';
import { useCampaignFieldSurface } from './CampaignField';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import {
  buildCampaignMessageVariableOptions,
  type CampaignMessageVariableOption,
} from './campaignMessageVariableCatalog';

export { appendCampaignMessageVariable } from './campaignMessageVariableCatalog';

const CampaignMessageVariableContext = React.createContext<CampaignMessageVariableOption[]>([]);

export const CampaignMessageVariableProvider: React.FC<React.PropsWithChildren<{
  rules?: CampaignAudienceRule[];
  options?: CampaignMessageVariableOption[];
}>> = ({ rules = [], options: providedOptions, children }) => {
  const builtOptions = useMemo(() => buildCampaignMessageVariableOptions(rules), [rules]);
  const options = providedOptions || builtOptions;
  return (
    <CampaignMessageVariableContext.Provider value={options}>
      {children}
    </CampaignMessageVariableContext.Provider>
  );
};

export const useCampaignMessageVariableOptions = () => React.useContext(CampaignMessageVariableContext);

type PickerProps = {
  disabled?: boolean;
  targetLabel: string;
  onInsert: (token: string) => void;
};

export const CampaignMessageVariablePicker: React.FC<PickerProps> = ({
  disabled,
  targetLabel,
  onInsert,
}) => {
  const options = React.useContext(CampaignMessageVariableContext);
  const fieldSurface = useCampaignFieldSurface();
  const popupContainer = fieldSurface.popupContainer || resolveOverlayPopupContainer;
  const overlayZIndexBase = fieldSurface.overlayZIndexBase || 13200;

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-2 dark:border-gray-700">
      <div className="mb-2 text-xs text-gray-500">انتخاب فیلد برای متغیر</div>
      <AdaptiveSelectField
        value={undefined}
        options={options.map((option) => ({ label: option.label, value: option.value }))}
        disabled={disabled || options.length === 0}
        onChange={(selectedValue) => {
          const selected = options.find((option) => option.value === String(selectedValue || ''));
          if (selected) onInsert(selected.token);
        }}
        placeholder="درج متغیر"
        pickerTitle={`انتخاب متغیر برای ${targetLabel}`}
        optionFilterProp="label"
        showSearch
        getPopupContainer={popupContainer as any}
        modalContainer={popupContainer}
        preferLocalPopupContainer
        overlayZIndexBase={overlayZIndexBase}
      />
      <Typography.Text type="secondary" className="mt-1.5 block text-[11px]">
        متغیرها بر اساس ماژول‌های فعال در مرحله «مخاطبان و شرط‌ها» نمایش داده می‌شوند.
      </Typography.Text>
    </div>
  );
};

export default CampaignMessageVariablePicker;
