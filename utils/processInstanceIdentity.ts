type ProcessIdentityIndex = {
  groupIds: Set<string>;
  templateIds: Set<string>;
};

const normalizeIdentity = (value: unknown) => String(value ?? '').trim();

const parseObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const uniqueIdentities = (values: unknown[]) => Array.from(
  new Set(values.map(normalizeIdentity).filter(Boolean)),
);

/**
 * شناسه‌های نمونهٔ واقعی فرآیند را برمی‌گرداند. شناسهٔ الگو عمداً در این
 * مجموعه نیست؛ یک الگو می‌تواند چند بار روی یک رکورد اجرا شود.
 */
export const collectProcessInstanceIdentityKeys = (value: any) => {
  const metadata = parseObject(value?.metadata);
  const recurrence = parseObject(value?.recurrence_info || metadata?.recurrence_info);
  const processGroup = parseObject(value?.process_group || metadata?.process_group || recurrence?.process_group);
  return uniqueIdentities([
    value?.process_group_id,
    metadata?.process_group_id,
    recurrence?.process_group_id,
    processGroup?.id,
    value?.process_run_id,
    metadata?.process_run_id,
    recurrence?.process_run_id,
  ]);
};

export const collectExplicitProcessGroupIds = (value: any) => {
  const metadata = parseObject(value?.metadata);
  const recurrence = parseObject(value?.recurrence_info || metadata?.recurrence_info);
  const processGroup = parseObject(value?.process_group || metadata?.process_group || recurrence?.process_group);
  const sourceStage = parseObject(value?.source_stage);
  const sourceMetadata = parseObject(sourceStage?.metadata);
  const sourceRecurrence = parseObject(sourceStage?.recurrence_info || sourceMetadata?.recurrence_info);
  const sourceProcessGroup = parseObject(
    sourceStage?.process_group
    || sourceMetadata?.process_group
    || sourceRecurrence?.process_group,
  );
  return uniqueIdentities([
    value?.process_group_id,
    metadata?.process_group_id,
    recurrence?.process_group_id,
    processGroup?.id,
    sourceStage?.process_group_id,
    sourceMetadata?.process_group_id,
    sourceRecurrence?.process_group_id,
    sourceProcessGroup?.id,
  ]);
};

/**
 * همه mutationهای فرآیند باید در مرز یک نمونه بمانند. اگر یکی از دو طرف
 * هویت گروه مدرن دارد، طرف دیگر نیز باید همان هویت را داشته باشد؛ یکسان
 * بودن template_id هرگز مجوز حذف یا ویرایش نیست.
 */
export const isProcessInstanceMutationScopeCompatible = (candidate: any, target: any) => {
  const candidateGroupIds = collectExplicitProcessGroupIds(candidate);
  const targetGroupIds = collectExplicitProcessGroupIds(target);
  if (candidateGroupIds.length === 0 && targetGroupIds.length === 0) return true;
  if (candidateGroupIds.length === 0 || targetGroupIds.length === 0) return false;
  const targetGroupIdSet = new Set(targetGroupIds);
  return candidateGroupIds.some((id) => targetGroupIdSet.has(id));
};

export const getProcessSourceTemplateId = (value: any) => {
  const metadata = parseObject(value?.metadata);
  const recurrence = parseObject(value?.recurrence_info || metadata?.recurrence_info);
  const processGroup = parseObject(value?.process_group || metadata?.process_group || recurrence?.process_group);
  return normalizeIdentity(
    value?.template_id
    || value?.source_template_id
    || metadata?.template_id
    || metadata?.source_template_id
    || recurrence?.template_id
    || recurrence?.source_template_id
    || processGroup?.template_id,
  );
};

export const buildMaterializedProcessIdentityIndex = (runtimeItems: any[]): ProcessIdentityIndex => {
  const groupIds = new Set<string>();
  const templateIds = new Set<string>();
  (Array.isArray(runtimeItems) ? runtimeItems : []).forEach((item) => {
    collectExplicitProcessGroupIds(item).forEach((id) => groupIds.add(id));
    const templateId = getProcessSourceTemplateId(item);
    if (templateId) templateIds.add(templateId);
  });
  return { groupIds, templateIds };
};

/**
 * پیش‌نویس مدرن فقط با process_group_id خودش materialized محسوب می‌شود.
 * تطبیق با template_id صرفاً fallback داده‌های قدیمیِ فاقد group id است.
 */
export const isDraftProcessInstanceMaterialized = (
  draftStage: any,
  runtimeIndex: ProcessIdentityIndex,
) => {
  const explicitGroupIds = collectExplicitProcessGroupIds(draftStage);
  if (explicitGroupIds.length > 0) {
    return explicitGroupIds.some((id) => runtimeIndex.groupIds.has(id));
  }
  const legacyTemplateId = getProcessSourceTemplateId(draftStage);
  return Boolean(legacyTemplateId && runtimeIndex.templateIds.has(legacyTemplateId));
};
