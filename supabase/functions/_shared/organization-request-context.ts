// @ts-nocheck
/** Resolve tenant and role from this request's active membership. */
export const fetchOrganizationRequestContext = async (url: string,key: string,token: string,request: Request) => {
  const headers: Record<string,string> = {apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  for(const name of ['origin','x-client-info']) if(request.headers.get(name)) headers[name]=request.headers.get(name)!;
  const response=await fetch(`${url.replace(/\/+$/,'')}/rest/v1/rpc/get_current_organization_context`,{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(15000)});
  const context=await response.json().catch(()=>null);
  if(!response.ok || !context?.org_id) throw new Error('دسترسی شما به سازمان این محیط تأیید نشد. دوباره وارد شوید.');
  return context;
};
