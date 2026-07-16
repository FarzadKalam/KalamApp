import { supabase } from '../supabaseClient';

const RECORD_SHORT_ROUTE_PREFIX = '/r';
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const getPublicBaseUrl = () => {
  const configured = String(
    import.meta.env.VITE_PUBLIC_SITE_URL
    || import.meta.env.VITE_SITE_URL
    || import.meta.env.VITE_APP_URL
    || '',
  ).trim().replace(/\/+$/, '');
  if (configured) return configured;
  return typeof window !== 'undefined' ? String(window.location.origin || '').replace(/\/+$/, '') : '';
};

const absoluteUrl = (path: string) => {
  const base = getPublicBaseUrl();
  return base ? new URL(path, `${base}/`).toString() : path;
};

const generateCode = (length = 7) => {
  const values = new Uint32Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else values.forEach((_, index) => { values[index] = Math.floor(Math.random() * 0xffffffff); });
  return Array.from(values).map((value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('');
};

export const buildDirectRecordPath = (moduleId: string, recordId: string) =>
  `/${encodeURIComponent(String(moduleId || '').trim())}/${encodeURIComponent(String(recordId || '').trim())}`;

export const buildShortRecordUrl = (code?: string | null) => {
  const normalized = String(code || '').trim();
  return normalized ? absoluteUrl(`${RECORD_SHORT_ROUTE_PREFIX}/${encodeURIComponent(normalized)}`) : '';
};

export const getOrCreateShortRecordUrl = async (moduleId: string, recordId: string): Promise<string> => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  if (!normalizedModuleId || !normalizedRecordId) return '';
  const targetUrl = absoluteUrl(buildDirectRecordPath(normalizedModuleId, normalizedRecordId));

  try {
    const { data: existing, error: existingError } = await supabase
      .from('short_links')
      .select('code')
      .eq('link_type', 'generic')
      .eq('module_id', normalizedModuleId)
      .eq('record_id', normalizedRecordId)
      .contains('metadata', { kind: 'record' })
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.code) return buildShortRecordUrl(existing.code) || targetUrl;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await supabase
        .from('short_links')
        .insert({
          code: generateCode(),
          link_type: 'generic',
          target_url: targetUrl,
          module_id: normalizedModuleId,
          record_id: normalizedRecordId,
          metadata: { kind: 'record', internal_record_link: true },
        })
        .select('code')
        .single();
      if (!error && data?.code) return buildShortRecordUrl(data.code) || targetUrl;
      if (String(error?.code || '') === '23505') continue;
      throw error;
    }
  } catch (error) {
    console.warn('Could not create short record link', error);
  }
  return targetUrl;
};

