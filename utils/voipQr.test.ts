import { describe, expect, it } from 'vitest';
import { parseVoipQrConfig } from './voipQr';

describe('VoIP QR Config Parser', () => {
  it('parses standard JSON with PortSIP fields', () => {
    const json = JSON.stringify({
      username: '102',
      password: 'fixture-password-only',
      domain: 'sip.telefonchy.com',
      port: 5060,
    });
    const parsed = parseVoipQrConfig(json);
    expect(parsed.extension).toBe('102');
    expect(parsed.password).toBe('fixture-password-only');
    expect(parsed.sipDomain).toBe('sip.telefonchy.com');
    expect(parsed.wssUrl).toBeUndefined();
  });

  it('parses nested PortSIP object', () => {
    const json = JSON.stringify({
      PortSIP: {
        userName: '205',
        password: 'fixture-password-only',
        userDomain: 'panel.telefonchy.com',
        sipServerPort: 8089,
      },
    });
    const parsed = parseVoipQrConfig(json);
    expect(parsed.extension).toBe('205');
    expect(parsed.password).toBe('fixture-password-only');
    expect(parsed.sipDomain).toBe('panel.telefonchy.com');
    expect(parsed.port).toBe(8089);
  });

  it('parses Base64 encoded JSON', () => {
    const rawObj = {
      user: '108',
      secret: 'fixture-password-only',
      server: 'edge.telefonchy.com',
    };
    const b64 = btoa(JSON.stringify(rawObj));
    const parsed = parseVoipQrConfig(b64);
    expect(parsed.extension).toBe('108');
    expect(parsed.password).toBe('fixture-password-only');
    expect(parsed.sipDomain).toBe('edge.telefonchy.com');
  });

  it('parses SIP URI with embedded credentials', () => {
    const uri = 'sip:301:fixture-password-only@pbx.kalamapp.ir:5060';
    const parsed = parseVoipQrConfig(uri);
    expect(parsed.extension).toBe('301');
    expect(parsed.password).toBe('fixture-password-only');
    expect(parsed.sipDomain).toBe('pbx.kalamapp.ir');
    expect(parsed.port).toBe(5060);
  });

  it('parses query string format', () => {
    const query = 'username=404&password=fixture-password-only&server=sip.telefonchy.com&operator_code=OP99';
    const parsed = parseVoipQrConfig(query);
    expect(parsed.extension).toBe('404');
    expect(parsed.password).toBe('fixture-password-only');
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

  it('preserves a provider transport declaration without inventing the WSS path', () => {
    const raw = JSON.stringify({
      name: 'test-operator',
      dn: '192.0.2.10',
      wdn: '192.0.2.10',
      protocols: [
        { pn: 'UDP', port: '5060' },
        { pn: 'WSS', port: '5065' },
      ],
      ip: '192.0.2.10',
      private: '192.0.2.10',
      ext: 'test-operator',
      pwd: 'fixture-password-only',
      v: 1,
    });
    const parsed = parseVoipQrConfig(raw);
    expect(parsed.extension).toBe('test-operator');
    expect(parsed.password).toBe('fixture-password-only');
    expect(parsed.sipDomain).toBe('192.0.2.10');
    expect(parsed.wssUrl).toBeUndefined();
    expect(parsed.wssPort).toBe(5065);
    expect(parsed.port).toBe(5060);
  });
});
