/** Web Locks are shared by tabs. A newly opened center must not unregister the tab carrying a call. */
export async function acquireVoipTabOwnership(key:string):Promise<(()=>void)|null>{
 if(typeof navigator==='undefined'||!navigator.locks)return ()=>{};
 return new Promise(resolve=>{
  void navigator.locks.request('taze-voip:'+key,{ifAvailable:true},async lock=>{
   if(!lock){resolve(null);return;}
   await new Promise<void>(release=>resolve(release));
  }).catch(()=>resolve(null));
 });
}
