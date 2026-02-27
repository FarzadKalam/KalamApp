import { BlockDefinition, FieldType, ModuleField } from '../../types';

export type SystemCodeNamingSettings = {
  prefixLetter: string;
  startNumber: number;
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

export type ModuleSettingsConfig = {
  general: ModuleGeneralSettings;
  specific: ModuleSpecificSettings;
  schema: EditableModuleSchema;
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
