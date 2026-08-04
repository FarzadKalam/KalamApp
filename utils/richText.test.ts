import { describe, expect, it } from 'vitest';
import { appendReadyTextToRichText, hasMeaningfulRichTextContent, normalizeRichTextHtml, richTextToPlainText } from './richText';

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

  it('keeps paragraphs as new lines when converting rich text to plain text', () => {
    expect(richTextToPlainText('<p>سطر اول</p><p>سطر دوم<br>سطر سوم</p>'))
      .toBe('سطر اول\nسطر دوم\nسطر سوم\n');
  });

  it('leaves a new paragraph after every inserted ready text', () => {
    expect(appendReadyTextToRichText('<p>متن اول</p>', '<p>متن دوم</p>'))
      .toBe('<p>متن اول</p><p><br></p><p>متن دوم</p><p><br></p>');
  });
});
