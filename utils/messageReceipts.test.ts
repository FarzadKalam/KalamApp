import { describe, expect, it } from 'vitest';
import {
  likeReceiptMapFromBox,
  readReceiptMapFromBox,
  selectBotReceiptCursorRows,
  selectInternalReceiptCursorRows,
} from './messageReceipts';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';

describe('messageReceipts', () => {
  it('normalizes current and legacy receipt formats', () => {
    expect(readReceiptMapFromBox({
      read_receipts: [userA],
    })[userA]).toEqual({ user_id: userA });

    expect(readReceiptMapFromBox(JSON.stringify({
      read_by: { [userB]: '2026-06-06T10:00:00.000Z' },
    }))[userB]).toMatchObject({
      user_id: userB,
      read_at: '2026-06-06T10:00:00.000Z',
    });
  });

  it('normalizes likes nested in metadata', () => {
    expect(likeReceiptMapFromBox({
      metadata: { liked_by: [userA] },
    })[userA]).toEqual({ user_id: userA });
  });

  it('selects displayed incoming rows for cursor backfill even when already locally seen', () => {
    const rows = [
      { id: 'message-1', author_id: userA, created_at: '2026-06-06T10:00:00.000Z', system: false },
      { id: 'message-2', author_id: userB, created_at: '2026-06-06T10:01:00.000Z', system: false },
      { id: 'message-3', author_id: userB, created_at: '2026-06-06T10:02:00.000Z', system: true },
    ];

    expect(selectInternalReceiptCursorRows(rows, userA, (row) => row.system).map((row) => row.id))
      .toEqual(['message-2']);
    expect(selectBotReceiptCursorRows([
      { id: userA, direction: 'inbound', created_at: '2026-06-06T10:00:00.000Z' },
      { id: userB, direction: 'outbound', created_at: '2026-06-06T10:01:00.000Z' },
    ]).map((row) => row.id)).toEqual([userA, userB]);
  });
});
