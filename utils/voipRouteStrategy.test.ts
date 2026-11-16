import {expect,it} from 'vitest';
import {selectVoipRoute,mayFallbackToVoipGateway,normalizeProviderSipServer} from '../supabase/functions/_shared/voip-route-strategy';
it('native SIP uses the gateway without inventing a WSS address',()=>{
 expect(selectVoipRoute({strategy:'auto',wssUrl:'192.0.2.10:5060'})).toBe('gateway');
 expect(selectVoipRoute({strategy:'auto',wssUrl:'wss://pbx.example.test/socket'})).toBe('direct');
 expect(selectVoipRoute({strategy:'auto',wssUrl:'wss://pbx.example.test/socket',gatewayLeaseActive:true})).toBe('gateway');
 expect(selectVoipRoute({strategy:'direct',requestGateway:true})).toBe('direct');
});
it('only network registration failure can fall back, before a call starts',()=>{
 expect(mayFallbackToVoipGateway('direct','auto','transport',false)).toBe(true);
 expect(mayFallbackToVoipGateway('direct','auto','registration_timeout',false)).toBe(true);
 for(const failure of ['registration_rejected','authentication','transport']){
  expect(mayFallbackToVoipGateway('direct','auto',failure,true)).toBe(false);
 }
 expect(mayFallbackToVoipGateway('direct','auto','registration_rejected',false)).toBe(false);
 expect(mayFallbackToVoipGateway('gateway','auto','transport',false)).toBe(false);
 expect(mayFallbackToVoipGateway('direct','direct','transport',false)).toBe(false);
});
it('validates native SIP server and port without accepting credentials or commands',()=>{
 expect(normalizeProviderSipServer('sip:pbx.example.test:5060')).toEqual({host:'pbx.example.test',port:5060});
 for(const value of ['pbx.test;touch x','user:pass@pbx.test','https://pbx.test/ws','pbx.test:65536','pbx.test/route'])expect(normalizeProviderSipServer(value)).toBeNull();
});
