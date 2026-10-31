import { describe, expect, it } from 'vitest';
import { buildLetterheadSignatureFlow } from './letterheadSignatureFlow';

describe('letterhead signature flow', () => {
  const layout = { widthMm: 210, heightMm: 297, body: { x: 10, y: 20, width: 80, height: 60 } };
  it('preserves the original body margins when there is no selected signature', () => {
    const result = buildLetterheadSignatureFlow(layout);
    expect(result.signatureHtml).toBe('');
    expect(result.pageMargins).toEqual({ top: 59.4, right: 21, bottom: 59.4, left: 21 });
  });
  it('includes the configured signature lane and retains its horizontal alignment', () => {
    const result = buildLetterheadSignatureFlow({ ...layout, signatures: { x: 10, y: 82, width: 80, height: 10 }, signatureHtml: '<p>امضا</p>' });
    expect(result.pageMargins.bottom).toBeCloseTo(23.76);
    expect(result.pageMargins.top).toBe(59.4);
    expect(result.artworkHeightMm).toBe(178.2);
    expect(result.signatureHtml).toContain('flex:0 0 100%');
    expect(result.signatureHtml).toContain('margin-left:0%');
    expect(result.signatureHtml).toContain('<p>امضا</p>');
  });
});
