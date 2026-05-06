import { extractStoragePathFromPublicUrl } from './recordFilesAvailability';

export type CanonicalFileSourceKind = 'entry' | 'legacy' | 'synthetic' | 'note_attachment';

export type CanonicalFileLike = {
  id: string;
  asset_id?: string | null;
  file_url: string;
  is_shortcut?: boolean;
  source_kind?: CanonicalFileSourceKind | null;
};

const FILE_STORAGE_BUCKET = 'images';

const normalizeText = (value: unknown) => String(value || '').trim();

const normalizeUrl = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) return '';
  try {
    const url = new URL(text);
    url.hash = '';
    return url.toString();
  } catch {
    return text.split('#')[0];
  }
};

const getSourcePriority = (value: CanonicalFileSourceKind | null | undefined) => {
  if (value === 'entry') return 4;
  if (value === 'legacy') return 3;
  if (value === 'synthetic') return 2;
  if (value === 'note_attachment') return 1;
  return 0;
};

const getCanonicalIdentity = (item: CanonicalFileLike) => {
  const normalizedUrl = normalizeUrl(item.file_url);
  const storagePath = extractStoragePathFromPublicUrl(normalizedUrl, FILE_STORAGE_BUCKET) || normalizedUrl;
  const normalizedStoragePath = normalizeText(storagePath);
  const assetId = normalizeText(item.asset_id);
  const shortcutPrefix = item.is_shortcut ? 'shortcut' : 'origin';

  if (normalizedStoragePath) {
    const storageBucket = `${shortcutPrefix}:storage:${normalizedStoragePath}`;
    if (assetId) {
      return {
        key: `${shortcutPrefix}:asset:${assetId}`,
        bucket: storageBucket,
      };
    }
    return {
      key: storageBucket,
      bucket: storageBucket,
    };
  }

  if (assetId) {
    return {
      key: `${shortcutPrefix}:asset:${assetId}`,
      bucket: `${shortcutPrefix}:asset:${assetId}`,
    };
  }

  return {
    key: `${shortcutPrefix}:url:${normalizedUrl}`,
    bucket: `${shortcutPrefix}:url:${normalizedUrl}`,
  };
};

export const canonicalizeFileManagerItems = <T extends CanonicalFileLike>(
  items: T[],
  options?: {
    dedupeById?: boolean;
  },
): T[] => {
  const byCanonicalKey = new Map<string, T>();
  const bestPriorityByBucket = new Map<string, number>();

  items.forEach((item) => {
    const identity = getCanonicalIdentity(item);
    const priority = getSourcePriority(item.source_kind || null);
    const existing = byCanonicalKey.get(identity.key);
    if (!existing) {
      byCanonicalKey.set(identity.key, item);
      bestPriorityByBucket.set(identity.bucket, Math.max(bestPriorityByBucket.get(identity.bucket) || 0, priority));
      return;
    }

    const existingPriority = getSourcePriority(existing.source_kind || null);
    if (priority > existingPriority) {
      byCanonicalKey.set(identity.key, item);
    }
    bestPriorityByBucket.set(identity.bucket, Math.max(bestPriorityByBucket.get(identity.bucket) || 0, priority, existingPriority));
  });

  const result = Array.from(byCanonicalKey.values()).filter((item) => {
    const identity = getCanonicalIdentity(item);
    const priority = getSourcePriority(item.source_kind || null);
    const bestPriority = bestPriorityByBucket.get(identity.bucket) || priority;
    if (!item.is_shortcut && priority < bestPriority && (item.source_kind === 'legacy' || item.source_kind === 'synthetic')) {
      return false;
    }
    return true;
  });

  if (!options?.dedupeById) return result;

  const seenIds = new Set<string>();
  return result.filter((item) => {
    const id = normalizeText(item.id);
    if (!id || !seenIds.has(id)) {
      if (id) seenIds.add(id);
      return true;
    }
    return false;
  });
};
