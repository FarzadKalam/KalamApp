import { describe, expect, it } from 'vitest';
import { buildPrintOutputName, getRecordPrintLabel } from './outputName';

describe('print output names', () => {
  it('never falls back to a record UUID when no visible title or code exists', () => {
    const uuid = '6315839f-3366-4eba-8851-7567fa826c3d';

    expect(getRecordPrintLabel({ id: uuid })).toBe('');
    expect(buildPrintOutputName({ record: { id: uuid }, fallbackLabel: 'چاپ فاکتور' })).toContain('چاپ فاکتور');
    expect(buildPrintOutputName({ record: { id: uuid }, fallbackLabel: 'چاپ فاکتور' })).not.toContain(uuid);
  });
});
