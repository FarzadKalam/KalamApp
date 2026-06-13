import { PROCESS_STAGE_INSTRUCTION_IDS_KEY, getInstructionIdsFromStage, normalizeInstructionIdList } from './instructionSupport';
import { PROCESS_NODE_KEY, getProcessStageNodeKey } from './processGraph';

const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

export const normalizeStageInstructionIdsForMetadata = (stage: Record<string, any>): Record<string, any> => {
  const normalizedIds = getInstructionIdsFromStage(stage);
  const metadata = stage?.metadata && typeof stage.metadata === 'object' && !Array.isArray(stage.metadata)
    ? stage.metadata
    : {};
  return {
    ...stage,
    [PROCESS_STAGE_INSTRUCTION_IDS_KEY]: normalizedIds,
    metadata: {
      ...metadata,
      [PROCESS_STAGE_INSTRUCTION_IDS_KEY]: normalizedIds,
    },
  };
};

export const syncProcessTemplateStageInstructionLinks = async (
  supabaseClient: any,
  templateId: string,
  stages: Array<Record<string, any>>,
) => {
  const normalizedTemplateId = String(templateId || '').trim();
  if (!normalizedTemplateId) return;

  const extendedStageRows = await supabaseClient
    .from('process_template_stages')
    .select('id, sort_order, process_node_key, metadata')
    .eq('template_id', normalizedTemplateId);
  let stageRows = extendedStageRows.data;
  if (extendedStageRows.error) {
    const errorText = String(
      extendedStageRows.error?.message
      || extendedStageRows.error?.details
      || extendedStageRows.error?.hint
      || '',
    ).toLowerCase();
    const isMissingProcessNodeColumn = ['42703', 'PGRST200', 'PGRST204'].includes(
      String(extendedStageRows.error?.code || '').toUpperCase(),
    ) || (errorText.includes('process_node_key') && (
      errorText.includes('column')
      || errorText.includes('schema cache')
      || errorText.includes('does not exist')
    ));
    if (!isMissingProcessNodeColumn) throw extendedStageRows.error;
    const fallbackStageRows = await supabaseClient
      .from('process_template_stages')
      .select('id, sort_order, metadata')
      .eq('template_id', normalizedTemplateId);
    if (fallbackStageRows.error) throw fallbackStageRows.error;
    stageRows = fallbackStageRows.data;
  }

  const validStages = Array.isArray(stages) ? stages : [];
  const persistedById = new Map<string, any>();
  const persistedByNodeKey = new Map<string, any>();
  const persistedBySortOrder = new Map<number, any>();
  (stageRows || []).forEach((row: any) => {
    const id = String(row?.id || '').trim();
    const nodeKey = String(row?.process_node_key || row?.metadata?.[PROCESS_NODE_KEY] || '').trim();
    const sortOrder = Number(row?.sort_order || 0);
    if (id) persistedById.set(id, row);
    if (nodeKey) persistedByNodeKey.set(nodeKey, row);
    if (Number.isFinite(sortOrder) && sortOrder > 0 && !persistedBySortOrder.has(sortOrder)) {
      persistedBySortOrder.set(sortOrder, row);
    }
  });

  const linkRows: Array<Record<string, any>> = [];
  validStages.forEach((stage, index) => {
    const stageId = isUuid(stage?.id) ? String(stage.id) : null;
    const stageNodeKey = getProcessStageNodeKey(stage, index);
    const persistedStage = stageId
      ? persistedById.get(stageId)
      : persistedByNodeKey.get(stageNodeKey)
        || persistedBySortOrder.get(Number(stage?.sort_order || 0));
    const persistedStageId = String(persistedStage?.id || '').trim();
    if (!persistedStageId) return;

    const instructionIds = normalizeInstructionIdList(getInstructionIdsFromStage(stage));
    instructionIds.forEach((instructionId, instructionIndex) => {
      if (!isUuid(instructionId)) return;
      linkRows.push({
        template_id: normalizedTemplateId,
        template_stage_id: persistedStageId,
        instruction_id: instructionId,
        sort_order: (index + 1) * 100 + instructionIndex,
      });
    });
  });

  const { error: deleteError } = await supabaseClient
    .from('process_template_stage_instructions')
    .delete()
    .eq('template_id', normalizedTemplateId);
  if (deleteError) throw deleteError;

  if (linkRows.length === 0) return;
  const { error: insertError } = await supabaseClient
    .from('process_template_stage_instructions')
    .insert(linkRows);
  if (insertError) throw insertError;
};
