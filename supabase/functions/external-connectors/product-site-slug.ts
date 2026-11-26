export function normalizeProductSiteSlug(value: unknown): string {
  const slug = String(value ?? '').trim();
  if (!slug) return '';
  let decoded: string;
  try { decoded = decodeURIComponent(slug).normalize('NFC').toLowerCase(); } catch {
    throw new Error('نشانی کوتاه معتبر نیست.');
  }
  if (!/^[\p{L}\p{N}\u200c]+(?:-[\p{L}\p{N}\u200c]+)*$/u.test(decoded) || decoded.length > 180) {
    throw new Error('نشانی کوتاه باید شامل حروف، عدد و خط تیره باشد.');
  }
  return encodeURIComponent(decoded).toLowerCase();
}
