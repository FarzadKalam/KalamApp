import { describe, expect, it } from 'vitest';
import { appendReadyTextToRichText, hasMeaningfulRichTextContent, normalizeRichTextHtml, normalizeRichTextHtmlForPrint, richTextToPlainText } from './richText';

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

  it('inherits print typography while retaining semantic marks and selected colour', () => {
    const printed = normalizeRichTextHtmlForPrint('<p style="font-size:22px; text-align:center"><strong>متن مهم</strong> <span style="color:#dc2626; font-family:serif">متن قرمز</span></p>');

    expect(printed).toContain('style="font-family:inherit; font-size:inherit; line-height:inherit; direction:inherit; text-align:inherit;"');
    expect(printed).toContain('color:#dc2626');
    expect(printed).toContain('<strong>متن مهم</strong>');
    expect(printed).not.toMatch(/font-size:22px|text-align:center|font-family:serif/);
  });

  it('leaves a new paragraph after every inserted ready text', () => {
    expect(appendReadyTextToRichText('<p>متن اول</p>', '<p>متن دوم</p>'))
      .toBe('<p>متن اول</p><p><br></p><p>متن دوم</p><p><br></p>');
  });
});
