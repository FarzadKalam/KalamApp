import {
  FieldLocation,
  FieldNature,
  FieldType,
  LogicOperator,
  type ModuleField,
  type SelectOption,
} from '../types';
import {
  ADVERTISING_CAMPAIGNS_MODULE_ID,
  ADVERTISING_CAMPAIGN_SOURCE_VALUE,
  ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID,
} from '../utils/advertisingCampaigns';

export const ADVERTISING_CAMPAIGN_SOURCE_OPTION: SelectOption = {
  label: 'کمپین تبلیغاتی',
  value: ADVERTISING_CAMPAIGN_SOURCE_VALUE,
  color: 'purple',
};

export const protectAdvertisingCampaignSourceField = <T extends ModuleField>(field: T): T => (
  Object.assign({}, field, {
    protectedDynamicValues: [ADVERTISING_CAMPAIGN_SOURCE_OPTION.value],
  }) as T
);

type AttributionFieldsOptions = {
  sourceFieldKey: string;
  location?: FieldLocation;
  blockId?: string;
  order: number;
};

/**
 * تعریف مرکزی فیلدهای attribution تا لید، مشتری و فاکتور دقیقاً از یک
 * قرارداد شرطی استفاده کنند. فیلتر ابزار تا انتخاب کمپین fail-closed است.
 */
export const createAdvertisingCampaignAttributionFields = ({
  sourceFieldKey,
  location = FieldLocation.BLOCK,
  blockId,
  order,
}: AttributionFieldsOptions): ModuleField[] => {
  const visibleIfCampaignSource = {
    visibleIf: {
      field: sourceFieldKey,
      operator: LogicOperator.EQUALS,
      value: ADVERTISING_CAMPAIGN_SOURCE_VALUE,
    },
  };

  return [
    {
      key: 'advertising_campaign_id',
      labels: { fa: 'کمپین تبلیغاتی', en: 'Advertising Campaign' },
      type: FieldType.RELATION,
      location,
      blockId,
      order,
      nature: FieldNature.STANDARD,
      validation: { required: true },
      logic: visibleIfCampaignSource,
      relationConfig: {
        targetModule: ADVERTISING_CAMPAIGNS_MODULE_ID,
        targetField: 'name',
        disableImportAutoCreate: true,
      },
    },
    {
      key: 'advertising_campaign_tool_id',
      labels: { fa: 'ابزار کمپین', en: 'Campaign Tool' },
      type: FieldType.RELATION,
      location,
      blockId,
      order: order + 0.01,
      nature: FieldNature.STANDARD,
      logic: { visibleIf: { field: 'advertising_campaign_id', operator: LogicOperator.IS_NOT_EMPTY } },
      relationConfig: {
        targetModule: ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID,
        targetField: 'title',
        disableImportAutoCreate: true,
        filter: {
          campaign_id: { $field: 'advertising_campaign_id' },
          enabled: true,
        },
      },
    },
  ];
};
