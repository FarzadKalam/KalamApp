import { describe, expect, it } from 'vitest';
import { createPrintPreviewFingerprint } from './previewFingerprint';

describe('createPrintPreviewFingerprint', () => {
  it('is stable for equivalent source objects and changes when print content changes', () => {
    const first = createPrintPreviewFingerprint({ template: { contentHtml: '<p>الف</p>', title: 'فاکتور' } });
    const equivalent = createPrintPreviewFingerprint({ template: { title: 'فاکتور', contentHtml: '<p>الف</p>' } });
    const changed = createPrintPreviewFingerprint({ template: { title: 'فاکتور', contentHtml: '<p>ب</p>' } });

    expect(first).toBe(equivalent);
    expect(changed).not.toBe(first);
  });
});
