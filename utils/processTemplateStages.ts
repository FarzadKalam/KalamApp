import { normalizeInstructionIdList } from './instructionSupport';
import {
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  normalizeProcessTaskCustomFields,
} from './processTaskCustomFields';
import {
  PROCESS_TASK_STATUS_OPTIONS_KEY,
  normalizeProcessTaskStatusOptions,
} from './processTaskStatusOptions';
import { syncProcessTemplateStageInstructionLinks } from './processTemplateStageInstructions';
import {
  PROCESS_GRAPH_METADATA_KEY,
  PROCESS_LANE_KEY,
  PROCESS_NODE_KEY,
  attachProcessGraphToStages,
  materializeLegacyProcessGraph,
} from './processGraph';
import { normalizeProcessDueAnchor } from './processSchedule';
import { findProcessAssigneeFieldReference } from './processAssigneeReference';

const normalizeText = (value: unknown) => String(value || '').trim();

const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(normalizeText(value));

const isMissingColumnLikeError = (error: any) => {
  const code = normalizeText(error?.code).toUpperCase();
  if (['42703', 'PGRST200', 'PGRST204'].includes(code)) return true;
  const text = normalizeText(error?.message || error?.details || error?.hint).toLowerCase();
  return text.includes('column') || text.includes('schema cache') || text.includes('does not exist');
};

const serializeProcessTemplateStages = (rawStages: any[]) => {
  const materialized = materializeLegacyProcessGraph(Array.isArray(rawStages) ? rawStages : []);
  const attached = attachProcessGraphToStages(materialized.stages, materialized.graph);

  return attached.map((stage: any, index: number) => {
    const metadata = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {};
    const anchor = normalizeProcessDueAnchor(stage);
    const processNodeKey = normalizeText(stage?.[PROCESS_NODE_KEY] || metadata?.[PROCESS_NODE_KEY]);
    const processLaneKey = normalizeText(stage?.[PROCESS_LANE_KEY] || metadata?.[PROCESS_LANE_KEY]) || 'lane_1';
    const defaultAssigneeField = findProcessAssigneeFieldReference(
      stage?.default_assignee_field,
      metadata?.default_assignee_field,
      stage?.default_assignee_combo,
      metadata?.default_assignee_combo,
      stage?.default_assignee_id,
      metadata?.default_assignee_id,
      stage?.default_assignee_role_id,
      metadata?.default_assignee_role_id,
    );
    return {
      id: isUuid(stage?.id) ? String(stage.id) : null,
      stage_name: normalizeText(stage?.name || stage?.stage_name) || `مرحله ${index + 1}`,
      sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
      wage: Number(stage?.wage || 0),
      process_node_key: processNodeKey,
      process_lane_key: processLaneKey,
      metadata: {
        ...metadata,
        description: normalizeText(stage?.description || metadata?.description) || null,
        task_type: normalizeText(stage?.task_type || metadata?.task_type) || null,
        automation_rules: Array.isArray(stage?.automation_rules)
          ? stage.automation_rules
          : (Array.isArray(metadata?.automation_rules) ? metadata.automation_rules : []),
        [PROCESS_TASK_CUSTOM_FIELDS_KEY]: normalizeProcessTaskCustomFields(
          stage?.process_task_custom_fields || metadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY],
        ),
        [PROCESS_TASK_STATUS_OPTIONS_KEY]: normalizeProcessTaskStatusOptions(
          stage?.process_task_status_options || metadata?.[PROCESS_TASK_STATUS_OPTIONS_KEY],
        ),
        instruction_ids: normalizeInstructionIdList(stage?.instruction_ids || metadata?.instruction_ids),
        default_assignee_field: defaultAssigneeField || null,
        weight: Number(stage?.weight || metadata?.weight || 0),
        duration_value: Number(stage?.duration_value || metadata?.duration_value || 0),
        duration_unit: String(stage?.duration_unit || metadata?.duration_unit || 'day') === 'hour' ? 'hour' : 'day',
        duration_from: anchor.type === 'process_start'
          ? 'project_start'
          : (anchor.type === 'previous_stage_due' ? 'previous_stage_end' : anchor.type),
        due_anchor_type: anchor.type,
        due_anchor_stage_node_key: anchor.stageNodeKey,
        [PROCESS_NODE_KEY]: processNodeKey,
        [PROCESS_LANE_KEY]: processLaneKey,
        [PROCESS_GRAPH_METADATA_KEY]: materialized.graph,
      },
      default_assignee_id: isUuid(stage?.default_assignee_id) ? String(stage.default_assignee_id) : null,
      default_assignee_role_id: isUuid(stage?.default_assignee_role_id) ? String(stage.default_assignee_role_id) : null,
    };
  });
};

const toWritePayload = (stage: ReturnType<typeof serializeProcessTemplateStages>[number], extended = true) => ({
  stage_name: stage.stage_name,
  sort_order: stage.sort_order,
  wage: stage.wage,
  metadata: stage.metadata,
  default_assignee_id: stage.default_assignee_id,
  default_assignee_role_id: stage.default_assignee_role_id,
  ...(extended ? {
    process_node_key: stage.process_node_key,
    process_lane_key: stage.process_lane_key,
  } : {}),
});

export const loadProcessTemplateStages = async (
  supabaseClient: any,
  templateId: string,
) => {
  const extended = await supabaseClient
    .from('process_template_stages')
    .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, process_node_key, process_lane_key, metadata')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });

  let rows = extended.data;
  if (extended.error) {
    if (!isMissingColumnLikeError(extended.error)) throw extended.error;
    const fallback = await supabaseClient
      .from('process_template_stages')
      .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true });
    if (fallback.error) throw fallback.error;
    rows = fallback.data;
  }

  const materialized = materializeLegacyProcessGraph(rows || []);
  return materialized.stages.map((stage: any, index: number) => ({
    ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
    id: stage.id || `${templateId}_${index + 1}`,
    name: stage.stage_name || `مرحله ${index + 1}`,
    stage_name: stage.stage_name || `مرحله ${index + 1}`,
    sort_order: stage.sort_order || ((index + 1) * 10),
    wage: Number(stage.wage || 0),
    default_assignee_id: stage.default_assignee_id || null,
    default_assignee_role_id: stage.default_assignee_role_id || null,
    template_stage_id: stage.id || null,
    [PROCESS_NODE_KEY]: stage[PROCESS_NODE_KEY],
    [PROCESS_LANE_KEY]: stage[PROCESS_LANE_KEY],
    metadata: stage.metadata,
  }));
};

export const syncProcessTemplateStages = async (
  supabaseClient: any,
  templateId: string,
  rawStages: any[],
) => {
  const nextStages = serializeProcessTemplateStages(rawStages);
  const { data: existingRows, error: existingError } = await supabaseClient
    .from('process_template_stages')
    .select('id')
    .eq('template_id', templateId);
  if (existingError) throw existingError;

  const existingIds = new Set<string>((existingRows || []).map((row: any) => String(row.id)));
  const keptExistingIds = new Set(
    nextStages.map((stage) => stage.id).filter((id): id is string => Boolean(id && existingIds.has(id))),
  );
  const removeIds = Array.from(existingIds).filter((id) => !keptExistingIds.has(id));
  if (removeIds.length > 0) {
    const { error } = await supabaseClient.from('process_template_stages').delete().in('id', removeIds);
    if (error) throw error;
  }

  for (const stage of nextStages) {
    const write = async (extended: boolean) => {
      if (stage.id && existingIds.has(stage.id)) {
        return supabaseClient
          .from('process_template_stages')
          .update(toWritePayload(stage, extended))
          .eq('id', stage.id);
      }
      return supabaseClient.from('process_template_stages').insert({
        template_id: templateId,
        ...toWritePayload(stage, extended),
      });
    };
    let result = await write(true);
    if (result.error && isMissingColumnLikeError(result.error)) result = await write(false);
    if (result.error) throw result.error;
  }

  await syncProcessTemplateStageInstructionLinks(supabaseClient, templateId, nextStages);
  return loadProcessTemplateStages(supabaseClient, templateId);
};
