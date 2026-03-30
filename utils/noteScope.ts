const normalizeScopePart = (value: string | null | undefined) => String(value ?? '').trim();

export interface NormalizedNoteScope {
  hasLinkedRecord: boolean;
  module_id: string;
  record_id: string;
}

export const normalizeNoteScope = (
  moduleId?: string | null,
  recordId?: string | null,
): NormalizedNoteScope => {
  const normalizedModuleId = normalizeScopePart(moduleId);
  const normalizedRecordId = normalizeScopePart(recordId);
  const hasLinkedRecord = Boolean(normalizedModuleId && normalizedRecordId);

  return {
    hasLinkedRecord,
    module_id: hasLinkedRecord ? normalizedModuleId : '',
    record_id: hasLinkedRecord ? normalizedRecordId : '',
  };
};
