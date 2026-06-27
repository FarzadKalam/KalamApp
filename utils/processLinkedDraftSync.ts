import { MODULES } from '../moduleRegistry';

const PROCESS_DRAFT_FIELD_KEYS = [
  'execution_process_draft',
  'marketing_process_draft',
  'production_stages_draft',
];

const normalizeText = (value: unknown) => String(value || '').trim();

const getProcessDraftFieldKey = (moduleId: string) => {
  const moduleConfig = MODULES[moduleId];
  if (!moduleConfig) return '';
  const field = (moduleConfig.fields || []).find((item: any) =>
    PROCESS_DRAFT_FIELD_KEYS.includes(String(item?.key || '').trim())
  );
  return String(field?.key || '').trim();
};

const getProcessGroupKey = (stage: any) => {
  const metadata = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {};
  const group = metadata?.process_group && typeof metadata.process_group === 'object' ? metadata.process_group : {};
  return normalizeText(
    stage?.process_group_id
    || metadata?.process_group_id
    || group?.id
    || stage?.source_template_id
    || metadata?.source_template_id
    || stage?.template_id
  );
};

const mergeProcessDraftStages = (current: unknown, incoming: any[]) => {
  const existing = Array.isArray(current) ? current : [];
  const incomingGroups = new Set(incoming.map(getProcessGroupKey).filter(Boolean));
  if (incomingGroups.size === 0) return [...existing, ...incoming];
  return [
    ...existing.filter((stage) => {
      const groupKey = getProcessGroupKey(stage);
      return !groupKey || !incomingGroups.has(groupKey);
    }),
    ...incoming,
  ];
};

export const syncProcessDraftToLinkedRecords = async (
  supabaseClient: any,
  draftStages: any[],
  links: Record<string, unknown>,
) => {
  const stages = Array.isArray(draftStages) ? draftStages : [];
  if (!supabaseClient || stages.length === 0) return;

  const entries = Object.entries(links || {})
    .map(([moduleId, recordId]) => ({
      moduleId: normalizeText(moduleId),
      recordId: normalizeText(recordId),
    }))
    .filter((entry, index, array) => (
      entry.moduleId
      && entry.recordId
      && array.findIndex((item) => item.moduleId === entry.moduleId && item.recordId === entry.recordId) === index
    ));

  await Promise.all(entries.map(async ({ moduleId, recordId }) => {
    const moduleConfig = MODULES[moduleId];
    const fieldKey = getProcessDraftFieldKey(moduleId);
    if (!moduleConfig || !fieldKey) return;
    const tableName = moduleConfig.table || moduleId;
    const { data, error } = await supabaseClient
      .from(tableName)
      .select(`id, ${fieldKey}`)
      .eq('id', recordId)
      .maybeSingle();
    if (error || !data) return;
    const nextDraft = mergeProcessDraftStages((data as any)?.[fieldKey], stages);
    await supabaseClient
      .from(tableName)
      .update({ [fieldKey]: nextDraft })
      .eq('id', recordId);
  }));
};
