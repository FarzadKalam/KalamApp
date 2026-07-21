import { describe, expect, it } from 'vitest';
import {
  isLegalCounterparty,
  resolveCounterpartyNationalCode,
  resolveCounterpartyNationalId,
  resolveCounterpartyNationalIdentifier,
} from './counterpartyIdentity';

describe('counterparty print identity', () => {
  it('recognizes the canonical legal person value', () => {
    expect(isLegalCounterparty({ person_type: 'legal' })).toBe(true);
    expect(isLegalCounterparty({ person_type: 'حقوقی' })).toBe(true);
  });

  it('keeps the two source fields available independently', () => {
    const source = { national_code: '0012345678', national_id: '14001234567' };

    expect(resolveCounterpartyNationalCode(source)).toBe('0012345678');
    expect(resolveCounterpartyNationalId(source)).toBe('14001234567');
  });

  it('uses the national id for legal counterparties in the combined variable', () => {
    expect(resolveCounterpartyNationalIdentifier({ person_type: 'legal', national_id: '14001234567' }))
      .toBe('14001234567');
    expect(resolveCounterpartyNationalIdentifier({ person_type: 'real', national_code: '0012345678' }))
      .toBe('0012345678');
  });
});
