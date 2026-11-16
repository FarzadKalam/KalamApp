/** Resolve the caller's active tenant through the same membership/host contract as the app. */
export async function loadVoipOrganizationContext(req: Request,url: string,key: string,token: string) {
 const headers:Record<string,string>={apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 for(const name of ['origin','x-organization-id','x-client-info']){
  const value=req.headers.get(name);if(value)headers[name]=value;
 }
 const response=await fetch(`${url.replace(/\/+$/,'')}/rest/v1/rpc/get_current_organization_context`,{method:'POST',headers,body:'{}'});
 const context=await response.json().catch(()=>null);
 if(!response.ok||!context?.org_id)throw new Error('عضویت فعال سازمان برای اتصال تلفن مشخص نیست.');
 return context;
}
