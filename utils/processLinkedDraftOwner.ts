const normalizeText = (value: unknown) => String(value || '').trim();

const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeDbUuid = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  const stripped = raw.replace(/^(process_run_stage|process_run|process_template_stage|process_template|task)[_:]/i, '');
  return UUID_LIKE_RE.test(stripped) ? stripped : '';
};

const getStageSource = (stage: Record<string, any> | null | undefined) => (
  stage?.source && typeof stage.source === 'object' ? stage.source : (stage || {})
);

export type ProcessDraftExecutionOwner = {
  moduleId: string;
  recordId: string;
  isLinkedOwner: boolean;
};

/**
 * Linked-process drafts can be displayed on a related record, but their draft
 * payload still belongs to the record that stores it. Runtime creation must
 * use that owner; otherwise a second process run is created for the viewer.
 */
export const resolveProcessDraftExecutionOwner = ({
  stage,
  currentModuleId,
  currentRecordId,
  runtimeRun,
}: {
  stage: Record<string, any> | null | undefined;
  currentModuleId: string;
  currentRecordId: string;
  runtimeRun?: Record<string, any> | null;
}): ProcessDraftExecutionOwner => {
  const source = getStageSource(stage);
  const ownerModuleId = normalizeText(source?.__process_v2_linked_owner_module_id);
  const ownerRecordId = normalizeDbUuid(source?.__process_v2_linked_owner_record_id);
  const runtimeOwnerModuleId = normalizeText(runtimeRun?.module_id);
  const runtimeOwnerRecordId = normalizeDbUuid(runtimeRun?.record_id);
  const normalizedCurrentModuleId = normalizeText(currentModuleId);
  const normalizedCurrentRecordId = normalizeDbUuid(currentRecordId);

  if (ownerModuleId && ownerRecordId) {
    return {
      moduleId: ownerModuleId,
      recordId: ownerRecordId,
      isLinkedOwner: ownerModuleId !== normalizedCurrentModuleId || ownerRecordId !== normalizedCurrentRecordId,
    };
  }

  // A process run can be rendered on one of its related records. Unlike legacy
  // draft fields, run-stage rows do not carry the linked-owner marker, so the
  // run itself is the authoritative owner for creation and conversion.
  if (runtimeOwnerModuleId && runtimeOwnerRecordId) {
    return {
      moduleId: runtimeOwnerModuleId,
      recordId: runtimeOwnerRecordId,
      isLinkedOwner: runtimeOwnerModuleId !== normalizedCurrentModuleId || runtimeOwnerRecordId !== normalizedCurrentRecordId,
    };
  }

  return {
    moduleId: normalizedCurrentModuleId,
    recordId: normalizedCurrentRecordId,
    isLinkedOwner: false,
  };
};
