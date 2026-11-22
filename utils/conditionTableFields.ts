import { MODULES } from '../moduleRegistry';
import { BlockType, type BlockDefinition, type ModuleField } from '../types';
import { createProcessLinkedFieldKey } from './processTargets';
import { isTableConditionOperator } from '../shared/recordRuntime';
import { workflowOperatorNeedsValue } from './filterUtils';
import { createWorkflowRelatedFieldKey } from './workflowTypes';
import { getFieldLabelFa } from './fieldLabel';

export const getModuleTableBlocks = (moduleId?: string | null): BlockDefinition[] =>
  (MODULES[String(moduleId || '').trim()]?.blocks || [])
    .filter((block) => block.type === BlockType.TABLE && !!block.tableColumns?.length)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

export interface ConditionTableSource {
  moduleId: string;
  key: string;
  label: string;
  fields: ModuleField[];
  getOperatorOptions?: (field?: ModuleField | null) => Array<{ label: string; value: string }>;
}

const getRelationFields = (column: NonNullable<BlockDefinition['tableColumns']>[number]): ModuleField[] => {
  const relation = column.relationConfig;
  if (!relation) return [];
  const targets = relation.sourceModules?.length ? relation.sourceModules : [relation];
  return Array.from(new Set(targets.map(({ targetModule }) => targetModule))).flatMap((targetModule) => {
    const target = MODULES[targetModule];
    if (!target) return [];
    return target.fields
      .filter((field) => field.isActive !== false && !field.virtualBotField && !field.botSettingsOnly)
      .map((field) => ({
        ...field,
        key: createWorkflowRelatedFieldKey(column.key, targetModule, field.key),
        labels: { fa: `${column.title} / ${target.titles.fa} / ${getFieldLabelFa(field, { moduleId: targetModule })}` },
      }));
  });
};

export const getConditionTableSources = (moduleId?: string | null): ConditionTableSource[] =>
  getModuleTableBlocks(moduleId).filter((block) => block.isActive !== false).map((block) => ({
    moduleId: String(moduleId || '').trim(),
    key: block.id,
    label: block.titles.fa,
    fields: (block.tableColumns || []).flatMap((column) => [
      {
        key: column.key,
        labels: column.labels || { fa: column.title },
        type: column.type,
        options: column.options,
        relationConfig: column.relationConfig,
      },
      ...getRelationFields(column),
    ]),
  }));

export const getLinkedConditionTableSources = (moduleIds: string[]): ConditionTableSource[] =>
  moduleIds.flatMap((moduleId) => getConditionTableSources(moduleId).map((source) => ({
    ...source,
    key: createProcessLinkedFieldKey(moduleId, source.key),
    label: `${MODULES[moduleId].titles.fa} / ${source.label}`,
  })));

export const hasIncompleteTableCondition = (
  conditions: readonly { field?: string; operator?: string; value?: unknown }[],
  sources: ConditionTableSource[],
) => conditions.some((condition) => {
  if (!isTableConditionOperator(condition.operator)) return false;
  const source = sources.find(({ key }) => key === condition.field);
  if (!source || !Array.isArray(condition.value) || condition.value.length === 0) return true;
  return condition.value.some((rowCondition) => {
    if (!source.fields.some(({ key }) => key === rowCondition?.field) || !rowCondition?.operator) return true;
    if (!workflowOperatorNeedsValue(rowCondition.operator)) return false;
    const value = rowCondition.value;
    return value === undefined || value === null || value === ''
      || (Array.isArray(value) && value.length === 0);
  });
});
