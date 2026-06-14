import type { ModuleField } from '../types';

export const isBotSettingsOnlyField = (field?: ModuleField | null) =>
  Boolean(field && (field as any).botSettingsOnly);

export const isWorkflowVirtualField = (field?: ModuleField | null) =>
  Boolean(field && (field as any).virtualBotField);

export const shouldRenderInGeneralModuleUi = (field?: ModuleField | null) =>
  !isBotSettingsOnlyField(field);
