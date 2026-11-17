import {useEffect,useState} from 'react';

export function useDocumentVisible(){
 const [visible,setVisible]=useState(()=>typeof document==='undefined'||document.visibilityState==='visible');
 useEffect(()=>{
  const changed=()=>setVisible(document.visibilityState==='visible');
  document.addEventListener('visibilitychange',changed);
  return()=>document.removeEventListener('visibilitychange',changed);
 },[]);
 return visible;
}
