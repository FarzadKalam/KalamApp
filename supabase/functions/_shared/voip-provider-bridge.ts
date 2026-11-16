import {normalizeSipDomain,normalizeWssUrl} from './voip-connection-policy.ts';
import {buildCoturnIceServers} from './voip-providers.ts';

/** Only the browser identity is returned; the provider password remains server-side. */
export async function prepareProviderBridge({url,key,orgId,userId,account,displayName,env}:{url:string;key:string;orgId:string;userId:string;account:any;displayName:string;env:(name:string)=>string|undefined}){
 const wssUrl=normalizeWssUrl(env('VOIP_GATEWAY_WSS_URL'));
 const sipDomain=normalizeSipDomain(env('VOIP_GATEWAY_SIP_DOMAIN'));
 const turnHost=env('VOIP_TURN_HOST');const turnSecret=env('VOIP_TURN_SECRET');
 if(!wssUrl||!sipDomain||!turnHost||!turnSecret)return {success:true,enabled:false,route:'gateway',reason:'gateway_unavailable',message:'درگاه مکالمهٔ SIP هنوز توسط مدیر سامانه آماده نشده است.'};
 const response=await fetch(`${url.replace(/\/+$/,'')}/rest/v1/rpc/prepare_voip_provider_bridge`,{
  method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
  body:JSON.stringify({p_org_id:orgId,p_user_id:userId}),
 });
 if(!response.ok)throw new Error('bridge_prepare_failed');
 const bridge=await response.json();
 const state=bridge?.registration_status;
 if(state!=='registered')return {success:true,enabled:false,route:'gateway',reason:state==='rejected'?'provider_rejected':state==='invalid_configuration'?'invalid_sip_configuration':'gateway_provisioning',
  retryAfterMs:state==='pending'?2000:undefined,
  message:state==='rejected'?'سرویس‌دهنده ورود SIP را نپذیرفت؛ اطلاعات حساب را بررسی کنید.':state==='invalid_configuration'?'سرور، پورت یا نوع اتصال SIP معتبر نیست.':'در حال برقراری ارتباط درگاه با حساب SIP…'};
 if(!bridge.browser_username||!bridge.browser_secret)throw new Error('bridge_identity_missing');
 const iceServers=await buildCoturnIceServers({turnHost,turnSecret,userId:`${orgId}_${userId}`,ttlSeconds:3600});
 return {success:true,enabled:true,route:'gateway',dialMode:'webphone_webrtc',wssUrl,sipDomain,iceServers,
  endpoint:{extension:account.extension,displayName,authUsername:bridge.browser_username,pjsipId:bridge.browser_username,
   sipUri:`sip:${bridge.browser_username}@${sipDomain}`,sipSecret:bridge.browser_secret,transport:'wss'}};
}
