import { describe, expect, it } from 'vitest';
import {
  buildCoturnIceServers,
  buildTenantPjsipId,
  normalizeProviderWebhookPayload,
  normalizeVoipProviderKey,
  VOIP_PROVIDER_CATALOG,
} from './voip-providers';

describe('voip-providers shared adaptors', () => {
  it('covers the main Iranian VoIP providers and exposes clear capabilities', () => {
    expect(Object.keys(VOIP_PROVIDER_CATALOG)).toEqual(
      expect.arrayContaining([
        'telefonchy',
        'simotel',
        'novatel',
        'alovoip',
        'issabel',
        'daftareshoma',
        'asiatech',
        'shatel',
        'pishgaman',
        'respina',
        'tci',
        'kalamapp_cloud_pbx',
      ]),
    );
    expect(VOIP_PROVIDER_CATALOG.simotel.supportsRealtimeEvents).toBe(true);
    expect(VOIP_PROVIDER_CATALOG.daftareshoma.supportsWebrtcGateway).toBe(false);
    expect(normalizeVoipProviderKey('asterisk')).toBe('kalamapp_cloud_pbx');
  });

  it('normalizes Simotel CDR and ringing events accurately', () => {
    const ringing = normalizeProviderWebhookPayload('simotel', {
      event_name: 'Newstate_Ringing',
      unique_id: 'sim-12345',
      src: '09123456789',
      dst: '101',
      direction: 'incoming',
      participant: '101',
    });
    expect(ringing.provider).toBe('simotel');
    expect(ringing.callId).toBe('sim-12345');
    expect(ringing.status).toBe('ringing');
    expect(ringing.direction).toBe('incoming');
    expect(ringing.extension).toBe('101');

    const ended = normalizeProviderWebhookPayload('issabel', {
      event: 'cdr',
      uniqueid: 'ast-9988',
      call_type: 'outbound',
      cid_num: '102',
      dst: '02188776655',
      disposition: 'ANSWERED',
      billsec: 42,
      recording_url: 'https://pbx.example.com/rec/9988.wav',
    });
    expect(ended.direction).toBe('outgoing');
    expect(ended.status).toBe('answered');
    expect(ended.talkSeconds).toBe(42);
    expect(ended.extension).toBe('102');
    expect(ended.recordingUrl).toBe('https://pbx.example.com/rec/9988.wav');
  });

  it('builds deterministic cross-tenant isolated PJSIP endpoint IDs', () => {
    const idA = buildTenantPjsipId('62f02c27-ff88-46b1-9fe2-e2d7cbc29a6a', '101');
    const idB = buildTenantPjsipId('aa11bb22-cc33-44dd-88ee-ff9900112233', '101');
    expect(idA).toBe('k_62f02c27ff88_101');
    expect(idB).toBe('k_aa11bb22cc33_101');
    expect(idA).not.toBe(idB);
  });

  it('generates HMAC REST credentials for Coturn when secret is provided', async () => {
    const ice = await buildCoturnIceServers({
      turnHost: '194.5.175.192',
      turnPort: 3478,
      turnSecret: 'test-turn-secret',
      userId: 'user-1',
    });
    expect(ice).toHaveLength(2);
    expect(ice[0].urls).toBe('stun:194.5.175.192:3478');
    expect(ice[1].username).toMatch(/^\d+:user-1$/);
    expect(ice[1].credential).toBeTruthy();
  });
});
