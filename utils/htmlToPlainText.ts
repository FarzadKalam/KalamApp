/**
 * تبدیل HTML به plain text برای AI chunking
 * HTML خروجی TipTap را به متن ساده تبدیل می‌کند
 */
export const htmlToPlainText = (html: string): string => {
  if (!html || !html.trim()) return '';

  // اگر محتوا HTML نداشت، همان را برگردان
  if (!/<[a-z]/i.test(html)) return html.trim();

  const div = document.createElement('div');
  div.innerHTML = html;

  // قبل از هر block element یک newline اضافه کن تا پاراگراف‌ها جدا شوند
  div.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, tr').forEach((el) => {
    el.insertAdjacentText('beforebegin', '\n');
  });

  // برای br هم newline اضافه کن
  div.querySelectorAll('br').forEach((el) => {
    el.replaceWith('\n');
  });

  const text = div.textContent || '';
  // فشرده‌سازی newline های اضافه
  return text.replace(/\n{3,}/g, '\n\n').trim();
};
