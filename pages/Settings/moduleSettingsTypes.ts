import { BlockDefinition, FieldType, ModuleField } from '../../types';
import { ConditionalFieldSettings } from '../../utils/conditionalFieldRules';

export type SystemCodeNamingSettings = {
  prefix: string;
  prefixLetter?: string;
  startNumber: number;
  numberWidth?: number | null;
};

export type ModuleGeneralSettings = {
  systemCodeNaming: SystemCodeNamingSettings;
};

export type ProductModuleSpecificSettings = {
  subUnitEnabled: boolean;
  unitConversionEnabled: boolean;
  allowNegativeStock: boolean;
};

export type ModuleSpecificSettings = {
  products?: ProductModuleSpecificSettings;
};

export type EditableModuleSchema = {
  fields: ModuleField[];
  blocks: BlockDefinition[];
};

export type OnlineInvoiceFieldVisibility = {
  key: string;
  visible: boolean;
};

export type OnlineInvoiceSettings = {
  enabled: boolean;
  showItemsTable: boolean;
  showItemNotes: boolean;
  showItemDimensions: boolean;
  showItemDates: boolean;
  showDiscount: boolean;
  showVat: boolean;
  showPaymentsTable: boolean;
  confirmationEnabled: boolean;
  messagingEnabled: boolean;
  visibleFields: OnlineInvoiceFieldVisibility[];
};

export const DEFAULT_ONLINE_INVOICE_SETTINGS: OnlineInvoiceSettings = {
  enabled: true,
  showItemsTable: true,
  showItemNotes: true,
  showItemDimensions: false,
  showItemDates: false,
  showDiscount: true,
  showVat: true,
  showPaymentsTable: true,
  confirmationEnabled: true,
  messagingEnabled: true,
  visibleFields: [],
};

export type ModuleSettingsConfig = {
  general: ModuleGeneralSettings;
  specific: ModuleSpecificSettings;
  schema: EditableModuleSchema;
  conditionalDisplay?: ConditionalFieldSettings;
  onlineInvoice?: OnlineInvoiceSettings;
};

export type ModuleSettingsStore = {
  modules: Record<string, ModuleSettingsConfig>;
};

export type AddFieldFormValues = {
  key: string;
  labelFa: string;
  type: FieldType;
  blockId?: string;
  relationTargetModule?: string;
  relationTargetField?: string;
  dynamicCategory?: string;
};

export const SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE = 'module_settings';
