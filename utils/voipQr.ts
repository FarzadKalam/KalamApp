/**
 * VoIP / SIP / PortSIP QR Code Parser and Formatter
 * Supports parsing credentials from:
 * - JSON (PortSIP, Telefonchy, PBX manifests)
 * - Base64 encoded JSON
 * - SIP URI (sip:user:pass@host:port)
 * - Query strings (user=...&pass=...&server=...)
 * - Key-Value multiline text
 */

export interface ParsedVoipConfig {
  extension?: string;
  authUsername?: string;
  wssPort?: number;
  password?: string;
  serverUrl?: string;
  sipDomain?: string;
  wssUrl?: string;
  port?: number;
  transport?: string;
  operatorCode?: string;
  displayName?: string;
  rawText: string;
}

const safeBase64Decode = (str: string): string | null => {
  try {
    const cleaned = str.replace(/\s+/g, '');
    if (/^[A-Za-z0-9+/=]{16,}$/.test(cleaned)) {
      const decoded = atob(cleaned);
      if (decoded && (decoded.includes('{') || decoded.includes(':') || decoded.includes('='))) {
        return decoded;
      }
    }
  } catch {
    // ignore
  }
  return null;
};

const extractFromRecord = (obj: Record<string, any>): Partial<ParsedVoipConfig> => {
  const target: Record<string, any> = (obj.PortSIP || obj.portsip || obj.account || obj.data || obj);

  const getFirst = (keys: string[]): string | undefined => {
    for (const k of keys) {
      const val = target[k];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val).trim();
      }
    }
    return undefined;
  };

  const extension = getFirst([
    'username', 'userName', 'user', 'ext', 'extension', 'auth_name', 'authName',
    'account', 'id', 'user_id', 'userId', 'operator_code', 'operatorCode', 'number', 'name',
  ]);

  const password = getFirst([
    'password', 'pass', 'secret', 'sip_secret', 'sipSecret', 'sip_password',
    'sipPassword', 'auth_password', 'authPassword', 'pin', 'pwd',
  ]);

  const serverUrl = getFirst([
    'server', 'sip_server', 'sipServer', 'domain', 'userDomain', 'host',
    'sip_domain', 'sipDomain', 'proxy', 'outbound_proxy', 'outboundProxy',
    'wss_url', 'wssUrl', 'server_url', 'serverUrl', 'url',
    'dn', 'wdn', 'domain_name', 'domainName', 'ip', 'private',
  ]);

  let portStr = getFirst(['port', 'sip_port', 'sipPort', 'sipServerPort', 'server_port']);
  let transport = getFirst(['transport', 'protocol', 'media_transport']);
  let explicitWssUrl: string | undefined = getFirst(['wss_url','wssUrl']);
  let wssPort: number | undefined;

  // Telefonchy / PortSIP protocols array support (e.g. [{"pn":"UDP","port":"5060"},{"pn":"WSS","port":"5065"}])
  if (Array.isArray(target.protocols)) {
    const wssProto = target.protocols.find((p: any) => p && String(p?.pn || '').toUpperCase() === 'WSS');
    const udpProto = target.protocols.find((p: any) => p && String(p?.pn || '').toUpperCase() === 'UDP');

    if (wssProto?.port) wssPort=Number(wssProto.port)||undefined;
    if (udpProto?.port&&!portStr)portStr=String(udpProto.port);

  }

  const port = portStr ? parseInt(portStr, 10) : undefined;
  const operatorCode = getFirst(['operator_code', 'operatorCode', 'code', 'op_code']);
  const displayName = getFirst(['display_name', 'displayName', 'name', 'account_name', 'accountName']);

  return {
    extension,
    authUsername:getFirst(['auth_name','authName','auth_username','authorization_username']),
    wssPort,
    sipDomain:getFirst(['sip_domain','sipDomain','domain','userDomain','dn']),
    password,
    serverUrl,
    wssUrl: explicitWssUrl,
    port: isNaN(port as any) ? undefined : port,
    transport,
    operatorCode,
    displayName,
  };
};

export const parseVoipQrConfig = (raw: string): ParsedVoipConfig => {
  const trimmed = String(raw || '').trim();
  const result: ParsedVoipConfig = { rawText: trimmed };
  if (!trimmed) return result;

  // 1. Try decoding Base64 if needed
  let content = trimmed;
  if (content.startsWith('data:') && content.includes('base64,')) {
    content = content.split('base64,')[1]?.trim() || content;
  }
  const decodedB64 = safeBase64Decode(content);
  if (decodedB64) {
    content = decodedB64;
  }

  // 2. Try JSON
  if (content.startsWith('{') || (content.includes('{') && content.includes('}'))) {
    try {
      const jsonStr = content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1);
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object') {
        const extracted = extractFromRecord(parsed);
        Object.assign(result, extracted);
      }
    } catch {
      // ignore json parse error
    }
  }

  // 3. Try SIP URI (sip:user:password@domain:port)
  if (!result.extension && /^sips?:/i.test(content)) {
    try {
      const match = content.match(/^sips?:(?:([^:@]+)(?::([^@]+))?@)?([^:;?]+)(?::(\d+))?(?:[;?](.*))?$/i);
      if (match) {
        result.extension = match[1] ? decodeURIComponent(match[1]) : undefined;
        result.password = match[2] ? decodeURIComponent(match[2]) : undefined;
        result.serverUrl = match[3] ? decodeURIComponent(match[3]) : undefined;
        result.port = match[4] ? parseInt(match[4], 10) : undefined;

        if (match[5]) {
          const params = new URLSearchParams(match[5].replace(/;/g, '&'));
          if (!result.password && params.get('password')) {
            result.password = params.get('password')!;
          }
          if (params.get('transport')) {
            result.transport = params.get('transport')!;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 4. Try Query / Key-Value / Multiline (e.g. user=101&pass=123&domain=sip.telefonchy.com)
  if (!result.extension || !result.password || !result.serverUrl) {
    const lines = content.includes('&')
      ? content.replace(/^[a-z]+:\/\/[^?]*\?/i, '').split('&')
      : content.split(/[\r\n]+/);

    const kv: Record<string, string> = {};
    for (const line of lines) {
      const separatorIdx = line.indexOf('=') !== -1 ? line.indexOf('=') : line.indexOf(':');
      if (separatorIdx > 0) {
        const k = line.substring(0, separatorIdx).trim().toLowerCase();
        const v = line.substring(separatorIdx + 1).trim();
        if (k && v) {
          kv[k] = v;
        }
      }
    }

    if (Object.keys(kv).length > 0) {
      const extracted = extractFromRecord(kv);
      if (!result.wssUrl && extracted.wssUrl) result.wssUrl=extracted.wssUrl;
      if (!result.authUsername && extracted.authUsername) result.authUsername=extracted.authUsername;
      if (!result.sipDomain && extracted.sipDomain) result.sipDomain=extracted.sipDomain;
      if (!result.wssPort && extracted.wssPort) result.wssPort=extracted.wssPort;
      if (!result.extension && extracted.extension) result.extension = extracted.extension;
      if (!result.password && extracted.password) result.password = extracted.password;
      if (!result.serverUrl && extracted.serverUrl) result.serverUrl = extracted.serverUrl;
      if (!result.port && extracted.port) result.port = extracted.port;
      if (!result.transport && extracted.transport) result.transport = extracted.transport;
      if (!result.operatorCode && extracted.operatorCode) result.operatorCode = extracted.operatorCode;
      if (!result.displayName && extracted.displayName) result.displayName = extracted.displayName;
    }
  }

  // 5. Post-process server URL, WSS URL, and SIP Domain
  if (result.serverUrl) {
    const s = result.serverUrl.trim();
    if (/^wss?:\/\//i.test(s)) {
      result.wssUrl = s;
      try {
        if (!result.sipDomain) result.sipDomain = new URL(s).hostname;
      } catch {
        if (!result.sipDomain) result.sipDomain = s.replace(/^wss?:\/\//i, '').split('/')[0].split(':')[0];
      }
    } else {
      const clean = s.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
      const parts = clean.split(':');
      if (!result.sipDomain) result.sipDomain = parts[0];
      // UDP/TCP SIP host and port are not a WebSocket endpoint.

    }
  }

  return result;
};

/** Format a PortSIP / Telefonchy-compatible JSON payload for QR generation. */
export const buildPortSipQrPayload = (config: {
  extension: string;
  password?: string;
  serverUrl?: string;
  displayName?: string;
  port?: number;
}): string => {
  const domain = String(config.serverUrl || '')
    .replace(/^wss?:\/\//i, '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0] || 'phone2.telefonchy.com';
  const extension = String(config.extension || '').trim();
  const password = String(config.password || '').trim();
  const sipPort = String(config.port || 5060);

  return JSON.stringify({
    name: extension,
    dn: domain,
    wdn: domain,
    protocols: [
      { pn: 'UDP', port: sipPort },
      { pn: 'WSS', port: '5065' },
    ],
    ip: domain,
    private: domain,
    ext: extension,
    pwd: password,
    v: 1,
    username: extension,
    auth_name: extension,
    password,
    domain,
    sip_server: domain,
    sip_port: Number.parseInt(sipPort, 10),
    display_name: String(config.displayName || extension).trim(),
    transport: 'udp',
  }, null, 2);
};
