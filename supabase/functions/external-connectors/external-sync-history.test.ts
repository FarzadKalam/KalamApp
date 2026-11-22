import { describe, expect, it } from 'vitest';
import { getSyncRowCounts } from './external-sync-history';

describe('WooCommerce sync history row counts', () => {
  it('counts only actually-created or updated records', () => {
    expect(getSyncRowCounts('created')).toEqual({ outcome: 'created', rowsCreated: 1, rowsUpdated: 0, changed: true });
    expect(getSyncRowCounts('updated')).toEqual({ outcome: 'updated', rowsCreated: 0, rowsUpdated: 1, changed: true });
  });

  it('does not misreport linking, skipped, or unknown outcomes as updates', () => {
    for (const outcome of ['linked', 'skipped', 'unexpected', null]) {
      expect(getSyncRowCounts(outcome)).toMatchObject({ rowsCreated: 0, rowsUpdated: 0, changed: false });
    }
  });
});
