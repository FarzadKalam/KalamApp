import { describe, expect, it } from 'vitest';
import { hasMeaningfulRichTextContent, normalizeRichTextHtml } from './richText';

describe('rich text print normalization', () => {
  it('keeps supported formatting and converts legacy line breaks safely', () => {
    expect(normalizeRichTextHtml('<p><strong>متن مهم</strong><br>سطر دوم</p>'))
      .toContain('<strong>متن مهم</strong><br>سطر دوم');
    expect(normalizeRichTextHtml('سطر اول\nسطر دوم')).toBe('سطر اول<br>سطر دوم');
  });

  it('does not consider the editor placeholder markup a printable value', () => {
    expect(hasMeaningfulRichTextContent('<p><br></p>')).toBe(false);
    expect(hasMeaningfulRichTextContent('<p>توضیحات فاکتور</p>')).toBe(true);
  });
});
