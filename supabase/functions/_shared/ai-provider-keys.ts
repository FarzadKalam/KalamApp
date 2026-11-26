const DEFAULT_CACHE_TTL_MS = 15_000;
const ENCRYPTED_PREFIX = 'enc:v1:';
const KEY_CACHE = new Map<string, { apiKey: string; source: 'db' | 'env' | 'none'; keyId: string | null; expiresAt: number }>();

const readEnvVar = (name: string): string => {
  const denoEnv = (globalThis as any)?.Deno?.env;
  if (denoEnv && typeof denoEnv.get === 'function') {
    return String(denoEnv.get(name) || '').trim();
  }
  const nodeEnv = (globalThis as any)?.process?.env;
  if (nodeEnv && typeof nodeEnv === 'object') {
    return String(nodeEnv[name] || '').trim();
  }
  return '';
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(String(value || '').trim());
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const toBufferSource = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
};

const deriveAesGcmKey = async (secretSeed: string): Promise<CryptoKey> => {
  const material = toBufferSource(new TextEncoder().encode(`${String(secretSeed || '')}:kalamapp:ai-provider-keys:v1`));
  const digest = await crypto.subtle.digest('SHA-256', material);
  return await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

/** Returns the central env fallback API key configured in Edge Function secrets. */
export const getCentralEnvApiKey = (): string =>
  readEnvVar('AI_API_KEY') || readEnvVar('AVALAI_API_KEY') || readEnvVar('OPENAI_API_KEY') || '';

/** Returns the server-side seed used for AES-256-GCM encryption at rest. */
export const getProviderKeyEncryptionSeed = (serviceRoleKey: string): string =>
  readEnvVar('AI_KEY_ENCRYPTION_SECRET') || String(serviceRoleKey || '').trim();

/** Masks a provider API key for safe display in SaaS Admin listings. */
export const maskProviderApiKey = (rawKey: string): string => {
  const clean = String(rawKey || '').trim();
  if (!clean) return '';
  if (clean.length <= 8) {
    return `${clean.slice(0, 2)}${'•'.repeat(Math.max(4, clean.length - 2))}`;
  }
  if (clean.length <= 14) {
    return `${clean.slice(0, 3)}••••••${clean.slice(-3)}`;
  }
  return `${clean.slice(0, 6)}••••••${clean.slice(-4)}`;
};

/** Computes a deterministic SHA-256 hex digest to detect duplicate keys without plaintext indexing. */
export const hashProviderApiKeySha256 = async (rawKey: string): Promise<string> => {
  const encoded = toBufferSource(new TextEncoder().encode(String(rawKey || '').trim()));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Encrypts a raw API key using AES-256-GCM before persisting to Postgres. */
export const encryptProviderApiKey = async (rawKey: string, secretSeed: string): Promise<string> => {
  const clean = String(rawKey || '').trim();
  if (!clean) throw new Error('کلید API نمی‌تواند خالی باشد.');
  const seed = String(secretSeed || '').trim();
  if (!seed) throw new Error('کلید رمزنگاری سرور در دسترس نیست.');
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const cryptoKey = await deriveAesGcmKey(seed);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    toBufferSource(new TextEncoder().encode(clean)),
  );
  return `${ENCRYPTED_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(cipherBuffer))}`;
};

/** Decrypts an AES-256-GCM encrypted API key stored by `encryptProviderApiKey`. */
export const decryptProviderApiKey = async (storedValue: string, secretSeed: string): Promise<string> => {
  const raw = String(storedValue || '').trim();
  if (!raw) return '';
  if (!raw.startsWith(ENCRYPTED_PREFIX)) return raw;
  const payload = raw.slice(ENCRYPTED_PREFIX.length);
  const parts = payload.split(':');
  if (parts.length !== 2) throw new Error('قالب کلید رمزنگاری‌شده نامعتبر است.');
  const iv = fromBase64(parts[0]);
  const cipherBytes = fromBase64(parts[1]);
  const cryptoKey = await deriveAesGcmKey(String(secretSeed || '').trim());
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    toBufferSource(cipherBytes),
  );
  return new TextDecoder().decode(plainBuffer).trim();
};

/** Clears cached active central provider keys (called after any admin mutation). */
export const clearCentralAiProviderKeyCache = (provider?: string): void => {
  const normalized = String(provider || '').trim().toLowerCase();
  if (!normalized) {
    KEY_CACHE.clear();
    return;
  }
  for (const cacheKey of Array.from(KEY_CACHE.keys())) {
    if (cacheKey.endsWith(`::${normalized}`)) {
      KEY_CACHE.delete(cacheKey);
    }
  }
};

/**
 * Resolves the active central API key for the provider, preferring the active
 * key managed in `saas_ai_provider_keys` and falling back cleanly to Edge Function env secrets.
 */
export const resolveCentralAiApiKey = async ({
  supabaseUrl,
  serviceRoleKey,
  provider = 'avalai',
  envFallbackKey,
  fetcher = fetch,
  ttlMs = DEFAULT_CACHE_TTL_MS,
}: {
  supabaseUrl?: string | null;
  serviceRoleKey?: string | null;
  provider?: string;
  envFallbackKey?: string | null;
  fetcher?: typeof fetch;
  ttlMs?: number;
}): Promise<{ apiKey: string; source: 'db' | 'env' | 'none'; keyId: string | null }> => {
  const normalizedProvider = String(provider || 'avalai').trim().toLowerCase() || 'avalai';
  const baseUrl = String(supabaseUrl || '').trim().replace(/\/+$/, '');
  const roleKey = String(serviceRoleKey || '').trim();
  const fallback = String(envFallbackKey ?? getCentralEnvApiKey()).trim();
  const cacheKey = `${baseUrl || 'env'}::${normalizedProvider}`;
  const cached = KEY_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { apiKey: cached.apiKey, source: cached.source, keyId: cached.keyId };
  }

  if (baseUrl && roleKey) {
    try {
      const url = new URL(`${baseUrl}/rest/v1/saas_ai_provider_keys`);
      url.searchParams.set('provider', `eq.${normalizedProvider}`);
      url.searchParams.set('is_active', 'eq.true');
      url.searchParams.set('select', 'id,api_key_ciphertext');
      url.searchParams.set('order', 'updated_at.desc');
      url.searchParams.set('limit', '1');
      const response = await fetcher(url.toString(), {
        headers: {
          apikey: roleKey,
          Authorization: `Bearer ${roleKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const rows = await response.json().catch(() => []);
        const activeRow = Array.isArray(rows) ? rows[0] : null;
        if (activeRow?.api_key_ciphertext) {
          const decrypted = await decryptProviderApiKey(
            String(activeRow.api_key_ciphertext),
            getProviderKeyEncryptionSeed(roleKey),
          );
          if (decrypted) {
            const result = {
              apiKey: decrypted,
              source: 'db' as const,
              keyId: activeRow?.id ? String(activeRow.id) : null,
            };
            KEY_CACHE.set(cacheKey, { ...result, expiresAt: Date.now() + ttlMs });
            return result;
          }
        }
      }
    } catch {
      // Fall back to environment secret cleanly if DB lookup/table is unavailable.
    }
  }

  const fallbackResult = {
    apiKey: fallback,
    source: fallback ? ('env' as const) : ('none' as const),
    keyId: null,
  };
  KEY_CACHE.set(cacheKey, { ...fallbackResult, expiresAt: Date.now() + Math.min(ttlMs, 5_000) });
  return fallbackResult;
};
