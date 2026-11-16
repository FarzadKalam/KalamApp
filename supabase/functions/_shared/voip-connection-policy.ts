/** Product contract shared by the UI and edge functions. Never infer WSS from a SIP host/port. */
export type VoipUsageMode = 'reports' | 'browser';
export type VoipBrowserSource = 'external' | 'taze_pbx';
export const resolveVoipPolicy = (input: Record<string, any> | null | undefined = {}, provider: string | null | undefined = '') => {
  const settings=input||{};
  const usageMode: VoipUsageMode = settings.usage_mode === 'browser' ? 'browser'
    : settings.usage_mode === 'reports' ? 'reports'
    : settings.default_dial_mode === 'webphone_webrtc' ? 'browser' : 'reports';
  const browserSource: VoipBrowserSource = settings.browser_source === 'external' ? 'external'
    : settings.browser_source === 'taze_pbx' || provider === 'kalamapp_cloud_pbx' ? 'taze_pbx' : 'external';
  return {usageMode, browserSource, reportsEnabled:true, canUseBrowser: usageMode === 'browser' && browserSource === 'external',
    development: usageMode === 'browser' && browserSource === 'taze_pbx'};
};
export const normalizeWssUrl = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'wss:' || url.username || url.password || url.hash) return '';
    return raw;
  } catch { return ''; }
};
export const normalizeSipDomain = (value: unknown) => {
  const raw = String(value || '').trim();
  // Realm/domain is not a websocket URL. Preserve domain ports explicitly supplied by the PBX.
  if (!raw || /[\s/@?#]/.test(raw) || raw.includes('://')) return '';
  return raw;
};
export const resolveExternalWebphone = (settings: Record<string, any>, account: Record<string, any>) => {
  const metadata = account.metadata || {};
  const wssUrl = normalizeWssUrl(metadata.wss_url || settings.wss_url);
  const sipDomain = normalizeSipDomain(metadata.sip_domain || settings.sip_domain);
  const username = String(metadata.auth_username || account.extension || '').trim();
  const sipUser = String(account.extension || '').trim();
  const reason = !wssUrl ? 'missing_verified_wss' : !sipDomain ? 'missing_sip_domain'
    : !username || !sipUser || !account.sip_secret ? 'missing_credentials' : null;
  return {wssUrl,sipDomain,username,sipUser,reason};
};
