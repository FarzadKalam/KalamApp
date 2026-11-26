export const productContentFields = [
  'title', 'short_description', 'description', 'slug', 'site_image_url', 'site_image_alt',
] as const;

export type ProductContentField = (typeof productContentFields)[number];
export type ProductContentSnapshot = Record<ProductContentField, string>;

export type ProductContentBaseline = {
  localHash: string;
  remoteHash: string;
  syncedAt: string | null;
  partial?: boolean;
  appImageHash?: string;
  siteImageId?: number;
};

export const getProductContentStatus = (
  localHash: string,
  remoteHash: string,
  baseline: ProductContentBaseline | null,
) => {
  if (localHash === remoteHash) return 'synced';
  if (!baseline) return 'unverified';
  const localChanged = localHash !== baseline.localHash;
  const remoteChanged = remoteHash !== baseline.remoteHash;
  if (localChanged && remoteChanged) return 'conflict';
  if (localChanged) return 'app_changed';
  if (remoteChanged) return 'site_changed';
  return baseline.partial ? 'partial' : 'synced';
};

const hashText = async (input: string) => {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const hashProductContent = (content: ProductContentSnapshot) =>
  hashText(JSON.stringify(productContentFields.map((field) => content[field])));

export const hashProductContentImageUrl = (url: string) => hashText(url);
