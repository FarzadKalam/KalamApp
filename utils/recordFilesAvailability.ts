const AVAILABILITY_KEY = 'erp_record_files_available';

let recordFilesTableExistsCache: boolean | null = (() => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(AVAILABILITY_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    // ignore
  }
  return null;
})();

export const getRecordFilesTableAvailabilityCache = (): boolean | null => recordFilesTableExistsCache;

export const setRecordFilesTableAvailability = (exists: boolean): void => {
  recordFilesTableExistsCache = exists;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AVAILABILITY_KEY, exists ? '1' : '0');
    }
  } catch {
    // ignore
  }
};

export const isMissingRecordFilesError = (error: any): boolean => {
  const msg = String(error?.message || '').toLowerCase();
  return String(error?.code || '') === '42P01' || (msg.includes('record_files') && msg.includes('does not exist'));
};

export const detectRecordFilesTable = async (client: any, force = false): Promise<boolean> => {
  if (!force && recordFilesTableExistsCache !== null) {
    return recordFilesTableExistsCache;
  }

  try {
    const { error } = await client
      .from('record_files')
      .select('id')
      .limit(1);

    if (!error) {
      setRecordFilesTableAvailability(true);
      return true;
    }

    if (isMissingRecordFilesError(error)) {
      setRecordFilesTableAvailability(false);
      return false;
    }

    // If we cannot verify due to RLS/network/transient errors, assume table exists and let real queries decide.
    setRecordFilesTableAvailability(true);
    return true;
  } catch {
    // ignore and fallback to OpenAPI check
  }

  try {
    const url = String(client?.supabaseUrl || '').trim();
    const key = String(client?.supabaseKey || '').trim();
    if (!url || !key) {
      return recordFilesTableExistsCache ?? true;
    }

    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (!response.ok) {
      throw new Error(`OpenAPI request failed with status ${response.status}`);
    }

    const text = await response.text();
    const exists = text.includes('"/record_files"');
    setRecordFilesTableAvailability(exists);
    return exists;
  } catch {
    return recordFilesTableExistsCache ?? true;
  }
};

export const extractStoragePathFromPublicUrl = (url: string, bucket = 'images'): string | null => {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const encoded = url.slice(idx + marker.length).split('?')[0];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
};
