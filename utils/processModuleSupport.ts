import {
  BlockType,
  FieldLocation,
  FieldNature,
  FieldType,
  ModuleDefinition,
} from '../types';

export const PROCESS_TEMPLATE_TARGET_MODULE_EXCLUDED_IDS = new Set([
  'process_templates',
  'process_runs',
  'tasks',
  'instructions',
  'saas_user_announcements',
]);

const PROCESS_DRAFT_FIELD_KEYS = new Set([
  'execution_process_draft',
  'marketing_process_draft',
]);

const PROCESS_BLOCK_ID = 'process';

const hasField = (module: ModuleDefinition, fieldKey: string) =>
  (module.fields || []).some((field) => String(field?.key || '') === fieldKey);

const hasProcessDraftField = (module: ModuleDefinition) =>
  (module.fields || []).some((field) => PROCESS_DRAFT_FIELD_KEYS.has(String(field?.key || '')));

export const isProcessTemplateTargetModule = (moduleId?: string | null) => {
  const normalizedModuleId = String(moduleId || '').trim();
  return !!normalizedModuleId && !PROCESS_TEMPLATE_TARGET_MODULE_EXCLUDED_IDS.has(normalizedModuleId);
};

export const withProcessModuleSupport = (module: ModuleDefinition): ModuleDefinition => {
  if (!isProcessTemplateTargetModule(module.id)) return module;

  const fields = [...(module.fields || [])];
  const blocks = [...(module.blocks || [])];
  const nextBlockOrder = blocks.reduce((maxOrder, block) => Math.max(maxOrder, Number(block?.order || 0)), 0) + 1;

  if (!blocks.some((block) => String(block?.id || '') === PROCESS_BLOCK_ID)) {
    blocks.push({
      id: PROCESS_BLOCK_ID,
      titles: { fa: 'فرآیند اجرا', en: 'Execution Process' },
      type: BlockType.FIELD_GROUP,
      order: nextBlockOrder,
      icon: 'DeploymentUnitOutlined',
    });
  }

  if (!hasField(module, 'process_template_id')) {
    fields.push({
      key: 'process_template_id',
      labels: { fa: 'الگوی فرآیند اجرا', en: 'Execution Template' },
      type: FieldType.RELATION,
      location: FieldLocation.BLOCK,
      blockId: PROCESS_BLOCK_ID,
      order: 1,
      relationConfig: { targetModule: 'process_templates', targetField: 'name' },
      nature: FieldNature.STANDARD,
    });
  }

  if (!hasProcessDraftField(module)) {
    fields.push({
      key: 'execution_process_draft',
      labels: { fa: 'فرآیند اجرا', en: 'Execution Process' },
      type: FieldType.JSON,
      location: FieldLocation.BLOCK,
      blockId: PROCESS_BLOCK_ID,
      order: 2,
      nature: FieldNature.STANDARD,
    });
  }

  return {
    ...module,
    fields,
    blocks,
  };
};
