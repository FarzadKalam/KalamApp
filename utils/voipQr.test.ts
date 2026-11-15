import { describe, expect, it } from 'vitest';
import { parseVoipQrConfig, buildPortSipQrPayload } from './voipQr';

describe('VoIP QR Config Parser', () => {
  it('parses standard JSON with PortSIP fields', () => {
    const json = JSON.stringify({
      username: '102',
      password: 'SecretPassword123!',
      domain: 'sip.telefonchy.com',
      port: 5060,
    });
    const parsed = parseVoipQrConfig(json);
    expect(parsed.extension).toBe('102');
    expect(parsed.password).toBe('SecretPassword123!');
    expect(parsed.sipDomain).toBe('sip.telefonchy.com');
    expect(parsed.wssUrl).toBe('wss://sip.telefonchy.com:5060/ws');
  });

  it('parses nested PortSIP object', () => {
    const json = JSON.stringify({
      PortSIP: {
        userName: '205',
        password: 'Pass205Secret',
        userDomain: 'panel.telefonchy.com',
        sipServerPort: 8089,
      },
    });
    const parsed = parseVoipQrConfig(json);
    expect(parsed.extension).toBe('205');
    expect(parsed.password).toBe('Pass205Secret');
    expect(parsed.sipDomain).toBe('panel.telefonchy.com');
    expect(parsed.port).toBe(8089);
  });

  it('parses Base64 encoded JSON', () => {
    const rawObj = {
      user: '108',
      secret: 'B64SecretPass',
      server: 'edge.telefonchy.com',
    };
    const b64 = btoa(JSON.stringify(rawObj));
    const parsed = parseVoipQrConfig(b64);
    expect(parsed.extension).toBe('108');
    expect(parsed.password).toBe('B64SecretPass');
    expect(parsed.sipDomain).toBe('edge.telefonchy.com');
  });

  it('parses SIP URI with embedded credentials', () => {
    const uri = 'sip:301:SuperPass@pbx.kalamapp.ir:5060';
    const parsed = parseVoipQrConfig(uri);
    expect(parsed.extension).toBe('301');
    expect(parsed.password).toBe('SuperPass');
    expect(parsed.sipDomain).toBe('pbx.kalamapp.ir');
    expect(parsed.port).toBe(5060);
  });

  it('parses query string format', () => {
    const query = 'username=404&password=MyPassword&server=sip.telefonchy.com&operator_code=OP99';
    const parsed = parseVoipQrConfig(query);
    expect(parsed.extension).toBe('404');
    expect(parsed.password).toBe('MyPassword');
    expect(parsed.sipDomain).toBe('sip.telefonchy.com');
    expect(parsed.operatorCode).toBe('OP99');
  });

  it('preserves WSS URLs as-is', () => {
    const json = JSON.stringify({
      extension: '101',
      password: 'Pass',
      wss_url: 'wss://pbx.telefonchy.com:8089/ws',
    });
    const parsed = parseVoipQrConfig(json);
    expect(parsed.extension).toBe('101');
    expect(parsed.wssUrl).toBe('wss://pbx.telefonchy.com:8089/ws');
    expect(parsed.sipDomain).toBe('pbx.telefonchy.com');
  });

  it('generates PortSIP QR payload correctly', () => {
    const payload = buildPortSipQrPayload({
      extension: '101',
      password: 'Pass',
      serverUrl: 'sip.telefonchy.com',
      displayName: 'اپراتور ۱',
    });
    const obj = JSON.parse(payload);
    expect(obj.username).toBe('101');
    expect(obj.password).toBe('Pass');
    expect(obj.domain).toBe('sip.telefonchy.com');
    expect(obj.display_name).toBe('اپراتور ۱');
  });

  it('parses real Telefonchy / PortSIP QR payload from uploaded barcode', () => {
    const raw = JSON.stringify({
      name: '821063',
      dn: '45.149.79.48',
      wdn: '45.149.79.48',
      protocols: [
        { pn: 'UDP', port: '5060' },
        { pn: 'WSS', port: '5065' },
      ],
      ip: '45.149.79.48',
      private: '45.149.79.48',
      ext: '821063',
      pwd: 'uk928vl44',
      v: 1,
    });
    const parsed = parseVoipQrConfig(raw);
    expect(parsed.extension).toBe('821063');
    expect(parsed.password).toBe('uk928vl44');
    expect(parsed.sipDomain).toBe('45.149.79.48');
    expect(parsed.wssUrl).toBe('wss://45.149.79.48:5065/ws');
    expect(parsed.port).toBe(5065);
  });
});
