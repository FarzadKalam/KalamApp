import {useSyncExternalStore} from 'react';
let dock:HTMLElement|null=null;
const listeners=new Set<()=>void>();
/** One call runtime and one dialer view, moved into the center instead of mounting a second phone. */
export function setVoipDockTarget(target:HTMLElement|null){
 if(dock===target)return;dock=target;for(const notify of listeners)notify();
}
export function useVoipDockTarget(){
 return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>dock,()=>null);
}
