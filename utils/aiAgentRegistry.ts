import { MODULES } from '../moduleRegistry';
import type { ModuleDefinition, ModuleField } from '../types';
import { getFieldLabelFa } from './fieldLabel';

export type AiAgentModuleCatalogEntry = {
  id: string;
  title: string;
  table: string;
  fields: Array<{
    key: string;
    label: string;
    type: string;
    readonly: boolean;
    required: boolean;
    relationTargetModule: string | null;
  }>;
  internalTables: Array<{
    id: string;
    title: string;
    columns: Array<{ key: string; title: string; type: string; relationTargetModule: string | null }>;
  }>;
  relatedModules: string[];
};

const toFieldCatalog = (field: ModuleField, moduleId: string) => ({
  key: String(field.key || ''),
  label: getFieldLabelFa(field, { moduleId }),
  type: String(field.type || 'text'),
  readonly: (field as any).readonly === true || (field as any).nature === 'system',
  required: (field as any).validation?.required === true,
  relationTargetModule: String((field as any).relationConfig?.targetModule || '').trim() || null,
});

const toCatalogEntry = (module: ModuleDefinition): AiAgentModuleCatalogEntry => {
  const internalTables: AiAgentModuleCatalogEntry['internalTables'] = (module.blocks || [])
    .filter((block: any) => String(block?.type || '') === 'table')
    .map((block: any) => ({
      id: String(block.id || ''),
      title: String(block?.titles?.fa || block.id || 'جدول داخلی'),
      columns: (block.tableColumns || []).map((column: any) => ({
        key: String(column?.key || ''),
        title: String(column?.title || column?.key || ''),
        type: String(column?.type || 'text'),
        relationTargetModule: String(column?.relationConfig?.targetModule || '').trim() || null,
      })).filter((column: any) => column.key),
    })).filter((block: any) => block.id);
  const relatedModules = Array.from(new Set([
    ...(module.relatedTabs || []).map((tab: any) => String(tab?.targetModule || '').trim()),
    ...(module.fields || []).map((field: any) => String(field?.relationConfig?.targetModule || '').trim()),
    ...internalTables.flatMap((block) => block.columns.map((column) => column.relationTargetModule || '')),
  ].filter(Boolean)));
  return {
    id: module.id,
    title: module.titles?.faSingular || module.titles?.fa || module.id,
    table: module.table,
    fields: (module.fields || []).map((field) => toFieldCatalog(field, module.id)).filter((field) => field.key),
    internalTables,
    relatedModules,
  };
};

export const buildAiAgentModuleCatalog = () => Object.values(MODULES)
  .map(toCatalogEntry)
  .sort((left, right) => left.title.localeCompare(right.title, 'fa'));

export const getAiAgentModuleCatalogEntry = (moduleId: string) => {
  const module = MODULES[String(moduleId || '').trim()];
  return module ? toCatalogEntry(module) : null;
};
