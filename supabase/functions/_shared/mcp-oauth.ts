// Shared OAuth 2.0 + PKCE + Dynamic Client Registration helpers for Remote MCP.
// Pure Web Crypto / standard TypeScript so both Deno Edge Runtime and Node Vitest can run it.

export const MCP_SCOPES = ['mcp:read', 'mcp:write'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export const MCP_TOKEN_TTL_SECONDS = 3600 * 12; // 12 hours
export const MCP_REFRESH_TTL_SECONDS = 3600 * 24 * 30; // 30 days
export const MCP_AUTH_CODE_TTL_SECONDS = 300; // 5 minutes

const ALLOWED_HTTPS_REDIRECT_HOSTS = new Set([
  'chatgpt.com',
  'chat.openai.com',
  'platform.openai.com',
  'openai.com',
  'oauth-redirect.googleusercontent.com',
  'vertexaisearch.cloud.google.com',
  'gemini.google.com',
  'claude.ai',
  'claude.com',
  'cursor.sh',
  'vscode.dev',
  'insiders.vscode.dev',
]);

const ALLOWED_HTTPS_HOST_SUFFIXES = [
  '.openai.com',
  '.chatgpt.com',
  '.googleusercontent.com',
  '.anthropic.com',
  '.claude.ai',
  '.claude.com',
];

export const normalizeScopes = (rawScope: unknown, fallback: McpScope[] = ['mcp:read', 'mcp:write']): McpScope[] => {
  const parts = Array.isArray(rawScope)
    ? rawScope.map((item) => String(item || '').trim())
    : String(rawScope || '').split(/[\s,]+/).map((item) => item.trim());
  const valid = parts.filter((scope): scope is McpScope => (MCP_SCOPES as readonly string[]).includes(scope));
  return valid.length ? Array.from(new Set(valid)) : [...fallback];
};

export const isAllowedMcpRedirectUri = (rawUri: unknown, extraAllowedOrigins: string[] = []): boolean => {
  const text = String(rawUri || '').trim();
  if (!text || text.length > 2048) return false;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.hash) return false;
  const host = parsed.hostname.toLowerCase();

  // RFC 8252 loopback redirect URIs for Codex CLI, Gemini CLI, and Claude Code.
  if (parsed.protocol === 'http:') {
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
  }
  if (parsed.protocol !== 'https:') return false;

  if (extraAllowedOrigins.some((origin) => {
    try {
      return new URL(origin).origin === parsed.origin;
    } catch {
      return false;
    }
  })) {
    return true;
  }

  if (ALLOWED_HTTPS_REDIRECT_HOSTS.has(host)) return true;
  return ALLOWED_HTTPS_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
};

export const detectMcpClientKind = (
  clientName: unknown,
  redirectUris: string[] = [],
): 'codex' | 'chatgpt' | 'gemini' | 'claude' | 'custom' => {
  const combined = `${String(clientName || '')} ${redirectUris.join(' ')}`.toLowerCase();
  if (combined.includes('codex')) return 'codex';
  if (combined.includes('chatgpt') || combined.includes('openai')) return 'chatgpt';
  if (combined.includes('gemini') || combined.includes('googleusercontent') || combined.includes('vertexaisearch') || combined.includes('google')) return 'gemini';
  if (combined.includes('claude') || combined.includes('anthropic')) return 'claude';
  return 'custom';
};

export const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy.buffer;
};

export const generateRandomToken = (prefix: string, byteLength = 32): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(byteLength)));
  return `${prefix}${base64UrlEncode(bytes)}`;
};

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(new TextEncoder().encode(value)));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const computePkceS256Challenge = async (codeVerifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(new TextEncoder().encode(codeVerifier)));
  return base64UrlEncode(new Uint8Array(digest));
};

export const verifyPkceS256 = async (codeVerifier: unknown, expectedChallenge: string): Promise<boolean> => {
  const verifier = String(codeVerifier || '').trim();
  if (verifier.length < 43 || verifier.length > 128 || !/^[A-Za-z0-9\-._~]+$/.test(verifier)) {
    return false;
  }
  const computed = await computePkceS256Challenge(verifier);
  return computed === String(expectedChallenge || '').trim();
};

export const buildProtectedResourceMetadata = (mcpBaseUrl: string) => ({
  resource: mcpBaseUrl,
  authorization_servers: [mcpBaseUrl],
  bearer_methods_supported: ['header'],
  scopes_supported: [...MCP_SCOPES],
  resource_name: 'TazeSystem Remote MCP Server',
});

export const buildAuthorizationServerMetadata = (mcpBaseUrl: string) => ({
  issuer: mcpBaseUrl,
  authorization_endpoint: `${mcpBaseUrl}/oauth/authorize`,
  token_endpoint: `${mcpBaseUrl}/oauth/token`,
  registration_endpoint: `${mcpBaseUrl}/oauth/register`,
  revocation_endpoint: `${mcpBaseUrl}/oauth/revoke`,
  response_types_supported: ['code'],
  response_modes_supported: ['query'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  code_challenge_methods_supported: ['S256'],
  scopes_supported: [...MCP_SCOPES],
});
