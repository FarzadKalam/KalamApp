import {normalizeWssUrl} from './voip-connection-policy.ts';
export type VoipRouteStrategy='auto'|'direct'|'gateway';
export const resolveVoipRouteStrategy=(value:unknown):VoipRouteStrategy=>value==='direct'||value==='gateway'?value:'auto';
export const selectVoipRoute=({strategy,wssUrl,requestGateway=false,gatewayLeaseActive=false}:{strategy:VoipRouteStrategy;wssUrl?:unknown;requestGateway?:boolean;gatewayLeaseActive?:boolean})=>{
 if(strategy==='gateway')return 'gateway';
 if(strategy==='direct')return 'direct';
 return requestGateway||gatewayLeaseActive||!normalizeWssUrl(wssUrl)?'gateway':'direct';
};
/** An auth rejection must not cause a second registration or hide incorrect credentials. */
export const mayFallbackToVoipGateway=(route:unknown,strategy:unknown,failure:unknown,hasActiveCall:boolean)=>
 route==='direct'&&strategy==='auto'&&!hasActiveCall&&['transport','registration_timeout'].includes(String(failure));

export const normalizeProviderSipServer=(value:unknown)=>{
 const input=String(value||'').trim().replace(/^sips?:/i,'');
 // No URL credentials, paths, shell characters, query or SIP parameters are allowed here.
 const match=/^([a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?)(?::([0-9]{1,5}))?$/.exec(input);
 if(!match)return null;
 const port=match[2]?Number(match[2]):5060;
 return port>0&&port<=65535?{host:match[1].toLowerCase(),port}:null;
};
