import type { ModuleField } from '../types';
import { BOT_VIRTUAL_FIELD_KEYS } from './botPlatform';

const WEB_FORM_TEMPLATE_INTERNAL_FIELD_KEYS = new Set([
  'template_field_values',
  'template_schema_snapshot',
]);

export const isBotSettingsOnlyField = (field?: ModuleField | null) =>
  Boolean(field && (field as any).botSettingsOnly);

export const isWorkflowVirtualField = (field?: ModuleField | null) =>
  Boolean(
    field
    && (
      (field as any).virtualBotField
      || BOT_VIRTUAL_FIELD_KEYS.has(String(field.key || '').trim())
    )
  );

export const isWebFormTemplateInternalField = (field?: Pick<ModuleField, 'key'> | null) =>
  WEB_FORM_TEMPLATE_INTERNAL_FIELD_KEYS.has(String(field?.key || '').trim());

export const shouldRenderInGeneralModuleUi = (field?: ModuleField | null) =>
  !isBotSettingsOnlyField(field) && !isWebFormTemplateInternalField(field);
