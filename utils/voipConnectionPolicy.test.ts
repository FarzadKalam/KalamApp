import {describe,it,expect,vi} from 'vitest';
import {resolveVoipPolicy,resolveExternalWebphone,normalizeWssUrl,normalizeSipDomain} from './voipConnectionPolicy';
import {createVoipRegistrationWait} from './voipRegistration';
describe('tenant-wide VoIP product modes',()=>{
 it('keeps reports available in every mode while the development source cannot open audio',()=>{
  for(const usage_mode of ['reports','browser'])for(const browser_source of ['external','taze_pbx']){
   const result=resolveVoipPolicy({usage_mode,browser_source});
   expect(result.reportsEnabled).toBe(true);
   expect(result.canUseBrowser).toBe(usage_mode==='browser'&&browser_source==='external');
  }
 });
 it('never enables browser audio merely because the provider is Telefonchy or an old user selected webphone',()=>{
  expect(resolveVoipPolicy(null,null).canUseBrowser).toBe(false);
  expect(resolveVoipPolicy({},'telefonchy').canUseBrowser).toBe(false);
  expect(resolveVoipPolicy({usage_mode:'reports',default_dial_mode:'webphone_webrtc'}).canUseBrowser).toBe(false);
 });
 it('does not turn native SIP host/UDP port into a WebSocket endpoint',()=>{
  const result=resolveExternalWebphone({}, {extension:'101',sip_secret:'test-only',metadata:{server_url:'pbx.example.test:5060',wss_url:'192.0.2.10',sip_domain:'pbx.example.test'}});
  expect(result.reason).toBe('missing_verified_wss');
 });
 it('keeps the SIP domain, public WSS endpoint and authentication identity independent',()=>{
  expect(resolveExternalWebphone({wss_url:'wss://edge.example.test/socket',sip_domain:'tenant.example.test'}, {extension:'101',sip_secret:'test-only',metadata:{auth_username:'auth-101'}})).toMatchObject({wssUrl:'wss://edge.example.test/socket',sipDomain:'tenant.example.test',username:'auth-101',sipUser:'101',reason:null});
  expect(normalizeSipDomain('wss://edge.example.test/socket')).toBe('');
  expect(normalizeWssUrl('ws://edge.example.test')).toBe('');
 });
 it('waits for a confirmed REGISTER and reports rejection/timeout instead of false success',async()=>{
  vi.useFakeTimers();
  try{
   const success=createVoipRegistrationWait();success.success();expect(await success.promise).toBe(true);
   const rejected=createVoipRegistrationWait();rejected.fail('rejected');expect(await rejected.promise).toBe(false);expect(rejected.getError()).toBe('rejected');
   const timeout=createVoipRegistrationWait();await vi.advanceTimersByTimeAsync(15000);expect(await timeout.promise).toBe(false);
  }finally{vi.useRealTimers();}
 });
});
