// @vitest-environment node
import { describe,it,expect } from 'vitest';
import { summarizeMutationCandidates } from './ai-mutation-context';
describe('bounded mutation candidate context',() => {
  it('keeps references without injecting invoice lines, private fields or process snapshots',() => {
    const rows = Array.from({ length: 20 },(_,i) => ({ id: String(i),name: 'اسنوا',description: 'x'.repeat(100000),
      invoiceItems: Array(500).fill({ detail: 'x'.repeat(1000) }),secret: 'private',execution_process_draft: { huge: 'x'.repeat(100000) } }));
    const original = rows[0].invoiceItems;
    const result = summarizeMutationCandidates(rows);
    expect(result).toHaveLength(20); expect(result[0]).toMatchObject({ id: '0',name: 'اسنوا' });
    expect(JSON.stringify(result).length).toBeLessThan(6000);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(rows[0].invoiceItems).toBe(original);
  });
  it('bounds even human title fields and candidate count',() => {
    expect(summarizeMutationCandidates(Array(100).fill({ id: 'ref',name: 'x'.repeat(10000) }))).toHaveLength(20);
    expect(summarizeMutationCandidates([{ name: 'x'.repeat(10000) }])[0].name).toHaveLength(160);
  });
});

