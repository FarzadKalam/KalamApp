export const isManualInvoiceAccountingIssueModule = (_moduleId: string | null | undefined) => true;

// All accounting document issuance is manual — never auto-create on save.
export const shouldAutoSyncInvoiceAccounting = (_moduleId: string | null | undefined) => false;

export const hasIssuedInvoiceAccountingEntries = async (args: {
  supabase: any;
  moduleId: string | null | undefined;
  recordId: string | null | undefined;
}) => {
  const { supabase, moduleId, recordId } = args;
  if (!isManualInvoiceAccountingIssueModule(moduleId)) return true;
  if (!recordId) return false;

  const { data, error } = await supabase
    .from('journal_entry_links')
    .select('journal_entry_id')
    .eq('source_table', moduleId)
    .eq('source_record_id', recordId)
    .limit(1);

  if (error) {
    console.warn('Failed to resolve issued invoice accounting entries', error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
};
