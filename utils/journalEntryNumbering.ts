type SupabaseLike = {
  from: (table: string) => any;
};

type GenerateNextJournalEntryNoParams = {
  supabase: SupabaseLike;
  fiscalYearId?: string | null;
  padLength?: number;
};

const normalizeDigitsToEnglish = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
};

const extractTrailingNumber = (raw: string): number | null => {
  const normalized = normalizeDigitsToEnglish(raw).trim();
  if (!normalized) return null;
  const match = normalized.match(/(\d+)$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
};

export const generateNextJournalEntryNo = async ({
  supabase,
  fiscalYearId = null,
  padLength = 6,
}: GenerateNextJournalEntryNoParams): Promise<string> => {
  let query = supabase.from('journal_entries').select('entry_no').not('entry_no', 'is', null);

  if (fiscalYearId) {
    query = query.eq('fiscal_year_id', fiscalYearId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const maxNo = (data || []).reduce((max: number, row: any) => {
    const next = extractTrailingNumber(String(row?.entry_no || ''));
    if (next === null) return max;
    return Math.max(max, next);
  }, 0);

  return String(maxNo + 1).padStart(Math.max(1, padLength), '0');
};
