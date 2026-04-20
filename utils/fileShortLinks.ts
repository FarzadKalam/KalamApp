import { supabase } from '../supabaseClient';
import type { NoteAttachment } from './noteContent';
import { FILE_STORAGE_BUCKET, fileStorageClient } from './storageClient';

const SHORT_FILE_ROUTE_PREFIX = '/f';
const SHORT_FILE_CODE_LENGTH = 6;
const SHORT_FILE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

type ShortLinkInsertPayload = {
  moduleId?: string | null;
  recordId?: string | null;
  title?: string | null;
  assetId?: string | null;
  entryId?: string | null;
  metadata?: Record<string, any>;
};

const buildAbsoluteUrl = (pathname: string) => {
  if (typeof window === 'undefined') return pathname;
  return new URL(pathname, window.location.origin).toString();
};

const normalizeTargetUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
};

const STORAGE_URL_MARKERS = [
  '/storage/v1/object/public/',
  '/storage/v1/object/sign/',
  '/storage/v1/object/authenticated/',
  '/storage/v1/render/image/public/',
  '/storage/v1/render/image/sign/',
] as const;

const extractBucketAndPathFromStorageUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  for (const marker of STORAGE_URL_MARKERS) {
    const index = raw.indexOf(marker);
    if (index < 0) continue;
    const suffix = raw.slice(index + marker.length).split('?')[0].split('#')[0];
    const slashIndex = suffix.indexOf('/');
    if (slashIndex <= 0) continue;
    const bucket = suffix.slice(0, slashIndex).trim();
    const encodedPath = suffix.slice(slashIndex + 1).trim();
    if (!bucket || !encodedPath) continue;
    try {
      return {
        bucket: decodeURIComponent(bucket),
        path: decodeURIComponent(encodedPath),
      };
    } catch {
      return { bucket, path: encodedPath };
    }
  }
  return null;
};

const looksLikeStoragePath = (value: string) =>
  /^[\w\-./% ]+\.[a-z0-9]{2,10}$/i.test(String(value || '').trim()) && !String(value || '').includes('://');

const normalizeAttachmentTargetUrl = async (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

  if (raw.startsWith('/')) {
    const storageRef = extractBucketAndPathFromStorageUrl(raw);
    if (storageRef) {
      return String(
        fileStorageClient.storage.from(storageRef.bucket).getPublicUrl(storageRef.path).data.publicUrl || ''
      ).trim() || buildAbsoluteUrl(raw);
    }
    return buildAbsoluteUrl(raw);
  }

  const storageRef = extractBucketAndPathFromStorageUrl(raw);
  if (storageRef) {
    return String(
      fileStorageClient.storage.from(storageRef.bucket).getPublicUrl(storageRef.path).data.publicUrl || ''
    ).trim() || normalizeTargetUrl(raw) || raw;
  }

  if (looksLikeStoragePath(raw)) {
    return String(
      fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(raw).data.publicUrl || ''
    ).trim() || raw;
  }

  return normalizeTargetUrl(raw) || raw;
};

const getRandomValues = (length: number) => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    return cryptoApi.getRandomValues(new Uint32Array(length));
  }
  return Array.from({ length }, () => Math.floor(Math.random() * 0xffffffff));
};

const generateShortCode = (length = SHORT_FILE_CODE_LENGTH) => {
  const randomValues = getRandomValues(length);
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += SHORT_FILE_CODE_ALPHABET[randomValues[index] % SHORT_FILE_CODE_ALPHABET.length];
  }
  return code;
};

const isMissingShortLinksTableError = (error: any) => {
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return String(error?.code || '').trim() === '42P01' || (text.includes('short_links') && text.includes('relation'));
};

export const buildShortFilePath = (code?: string | null) => {
  const normalizedCode = String(code || '').trim();
  return normalizedCode ? `${SHORT_FILE_ROUTE_PREFIX}/${encodeURIComponent(normalizedCode)}` : '';
};

export const buildShortFileUrl = (code?: string | null) => {
  const path = buildShortFilePath(code);
  return path ? buildAbsoluteUrl(path) : '';
};

export const getOrCreateShortFileUrl = async (
  targetUrl: string,
  payload: ShortLinkInsertPayload = {},
): Promise<string> => {
  const normalizedTargetUrl = normalizeTargetUrl(targetUrl);
  const normalizedEntryId = String(payload.entryId || '').trim();
  const normalizedAssetId = String(payload.assetId || '').trim();
  const normalizedVariantKey = String((payload.metadata || {})?.variant_key || '').trim();
  if (!normalizedTargetUrl && !normalizedEntryId && !normalizedAssetId) return String(targetUrl || '').trim();

  try {
    let existingQuery = supabase
      .from('short_links')
      .select('code')
      .eq('link_type', 'file')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (normalizedEntryId) {
      existingQuery = existingQuery.eq('target_entry_id', normalizedEntryId);
    } else if (normalizedAssetId) {
      existingQuery = existingQuery.eq('target_asset_id', normalizedAssetId);
    } else {
      existingQuery = existingQuery.eq('target_url', normalizedTargetUrl);
    }
    if (normalizedVariantKey) {
      existingQuery = existingQuery.contains('metadata', { variant_key: normalizedVariantKey });
    }

    const { data: existing, error: existingError } = await existingQuery.maybeSingle();

    if (existingError && !isMissingShortLinksTableError(existingError)) {
      throw existingError;
    }
    if (existing?.code) {
      return buildShortFileUrl(existing.code) || normalizedTargetUrl || String(targetUrl || '').trim();
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateShortCode();
      const { data, error } = await supabase
        .from('short_links')
        .insert({
          code,
          link_type: 'file',
          target_url: normalizedTargetUrl || null,
          target_asset_id: normalizedAssetId || null,
          target_entry_id: normalizedEntryId || null,
          module_id: payload.moduleId || null,
          record_id: payload.recordId || null,
          title: payload.title || null,
          metadata: payload.metadata || {},
        })
        .select('code')
        .single();

      if (!error && data?.code) {
        return buildShortFileUrl(data.code) || normalizedTargetUrl;
      }
      if (String(error?.code || '').trim() === '23505') {
        continue;
      }
      if (isMissingShortLinksTableError(error)) {
        return normalizedTargetUrl || String(targetUrl || '').trim();
      }
      throw error;
    }
  } catch (error) {
    console.warn('Could not create short file url', error);
  }

  return normalizedTargetUrl || String(targetUrl || '').trim();
};

export const shortenAttachmentsForExternalShare = async (
  attachments: NoteAttachment[],
  payload: ShortLinkInsertPayload = {},
): Promise<NoteAttachment[]> => {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  return Promise.all(
    attachments.map(async (attachment) => {
      const publicTargetUrl = await normalizeAttachmentTargetUrl(String(attachment?.url || '').trim());
      return {
        ...attachment,
        url: await getOrCreateShortFileUrl(publicTargetUrl, {
          ...payload,
          title: String(attachment?.name || payload.title || '').trim() || payload.title || null,
          metadata: {
            ...(payload.metadata || {}),
            mime_type: attachment?.mimeType || null,
          },
        }),
      };
    }),
  );
};
