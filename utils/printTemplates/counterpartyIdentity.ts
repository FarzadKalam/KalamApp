type CounterpartyIdentitySource = {
  person_type?: unknown;
  national_code?: unknown;
  national_id?: unknown;
  company_national_id?: unknown;
};

const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
};

export const isLegalCounterparty = (source: CounterpartyIdentitySource | null | undefined) => {
  const personType = String(source?.person_type ?? '').trim().toLowerCase();
  return personType === 'legal' || personType === 'حقوقی';
};

export const resolveCounterpartyNationalCode = (source: CounterpartyIdentitySource | null | undefined) =>
  firstNonEmpty(source?.national_code);

export const resolveCounterpartyNationalId = (source: CounterpartyIdentitySource | null | undefined) =>
  firstNonEmpty(source?.national_id, source?.company_national_id);

/** شناسه رسمی طرف‌حساب را بر اساس نوع شخص برمی‌گرداند. */
export const resolveCounterpartyNationalIdentifier = (
  source: CounterpartyIdentitySource | null | undefined,
) => (
  isLegalCounterparty(source)
    ? firstNonEmpty(resolveCounterpartyNationalId(source), resolveCounterpartyNationalCode(source))
    : firstNonEmpty(resolveCounterpartyNationalCode(source), resolveCounterpartyNationalId(source))
);
