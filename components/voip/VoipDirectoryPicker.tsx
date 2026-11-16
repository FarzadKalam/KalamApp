import {useEffect,useRef,useState} from 'react';
import {Avatar,Button,Input,Spin} from 'antd';
import {SearchOutlined,UserOutlined} from '@ant-design/icons';
import AdaptivePickerSurface from '../AdaptivePickerSurface';
import {searchVoipOperatorDirectory,type VoipOperatorDirectoryItem} from '../../utils/voipDirectory';
import {readVoipContactContext,type CallContactIdentity} from '../../utils/voipContactContext';
import {getSelectedOrganizationId} from '../../utils/organizationContext';
import {normalizePublicAssetUrl} from '../../utils/assetUrl';

const roleLabels={customers:'مشتری',suppliers:'تأمین‌کننده',employees:'کارمند'};
export default function VoipDirectoryPicker({open,onClose,onChoose}:{open:boolean;onClose:()=>void;onChoose:(phone:string,contact?:{title:string;avatarUrl?:string|null;moduleId?:string;recordId?:string})=>void}){
 const orgId=getSelectedOrganizationId();
 const [query,setQuery]=useState('');const [operators,setOperators]=useState<VoipOperatorDirectoryItem[]>([]);
 const currentLookup=useRef('');currentLookup.current=JSON.stringify([open,orgId,query]);
 const [contacts,setContacts]=useState<CallContactIdentity[]>([]);const [busy,setBusy]=useState(false);
 const [operatorError,setOperatorError]=useState('');const [contactError,setContactError]=useState('');
 const [nextOffset,setNextOffset]=useState(0);const [hasMore,setHasMore]=useState(false);
 useEffect(()=>{
  if(!open)return;
  let current=true;const controller=new AbortController();
  setBusy(true);setOperators([]);setContacts([]);setHasMore(false);setOperatorError('');setContactError('');
  const timer=setTimeout(()=>{void Promise.allSettled([
   searchVoipOperatorDirectory(query,0,controller.signal).then(data=>{
    if(current){setOperators(data.items);setHasMore(data.hasMore);setNextOffset(data.nextOffset);}
   }).catch(()=>{if(current)setOperatorError('داخلی‌ها بارگیری نشدند.');}),
   query.trim().length>=2?readVoipContactContext({action:'search',query},controller.signal).then(data=>{
    if(current)setContacts(data.candidates||[]);
   }).catch(()=>{if(current)setContactError('جست‌وجوی مخاطبان انجام نشد.');}):Promise.resolve(),
  ]).finally(()=>{if(current)setBusy(false);});},250);
  return ()=>{current=false;clearTimeout(timer);controller.abort();};
 },[open,query,orgId]);
 useEffect(()=>{if(!open)setQuery('');},[open]);
 const more=async()=>{
  const startedLookup=currentLookup.current;setBusy(true);setOperatorError('');
  try{const data=await searchVoipOperatorDirectory(query,nextOffset);
   if(startedLookup===currentLookup.current){
    setOperators(previous=>[...previous,...data.items]);setHasMore(data.hasMore);setNextOffset(data.nextOffset);
   }
  }catch{if(startedLookup===currentLookup.current)setOperatorError('صفحهٔ بعدی داخلی‌ها دریافت نشد.');}finally{if(startedLookup===currentLookup.current)setBusy(false);}
 };
 const choose=(phone:string,contact:{title:string;avatarUrl?:string|null;moduleId?:string;recordId?:string})=>{if(!phone)return;onChoose(phone,contact);onClose();};
 return <AdaptivePickerSurface open={open} onClose={onClose} title="جست‌وجوی داخلی و مخاطب" subtitle="انتخاب شماره، تماس را شروع نمی‌کند" closeLabel="بستن">
  <Input autoFocus aria-label="جست‌وجوی داخلی و مخاطب" prefix={<SearchOutlined />} placeholder="نام یا شمارهٔ داخلی و مخاطب" value={query} onChange={event=>setQuery(event.target.value)} allowClear />
  <div className="h-[min(55dvh,400px)] overflow-y-auto mt-3 space-y-3" aria-busy={busy}>
   <div className="h-5">{busy&&<Spin size="small" />}</div>
   <section aria-label="داخلی‌های سازمان" className="space-y-2">
    <h3 className="font-semibold text-sm">داخلی‌های سازمان</h3>
    {operatorError&&<p role="alert" className="text-xs text-red-600 dark:text-red-400">{operatorError}</p>}
    {operators.map(item=><button type="button" key={item.id} disabled={!item.phone} onClick={()=>choose(item.phone,item)} className="w-full min-h-14 rounded-xl border border-slate-200 dark:border-slate-700 p-2 flex items-center gap-3 text-start hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60">
     <Avatar src={normalizePublicAssetUrl(item.avatarUrl)||undefined} icon={<UserOutlined />} />
     <span className="min-w-0 flex-1"><span className="block font-medium">{item.title}</span><span className="block text-xs text-slate-500">{item.phone?'داخلی تماس':'داخلی تماس ثبت نشده؛ مدیر در تنظیمات کاربر وارد کند'}</span></span>
     {item.phone&&<bdi className="font-mono" dir="ltr">{item.phone}</bdi>}
    </button>)}
    {!busy&&!operatorError&&!operators.length&&<p className="text-xs text-slate-500">داخلی‌ای یافت نشد.</p>}
    {hasMore&&<Button loading={busy} onClick={()=>void more()}>داخلی‌های بیشتر</Button>}
   </section>
   <section aria-label="مخاطبان مجاز" className="space-y-2">
    <h3 className="font-semibold text-sm">مخاطبان</h3>
    {contactError&&<p role="alert" className="text-xs text-red-600 dark:text-red-400">{contactError}</p>}
    {contacts.map(item=><button type="button" key={item.moduleId+item.recordId} disabled={!item.phone} onClick={()=>choose(item.phone,item)} className="w-full min-h-14 rounded-xl border border-slate-200 dark:border-slate-700 p-2 flex items-center gap-3 text-start hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60">
     <Avatar src={normalizePublicAssetUrl(item.avatarUrl)||undefined} icon={<UserOutlined />} /><span className="min-w-0 flex-1"><span className="block font-medium">{item.title}</span><span className="block text-xs text-slate-500">{roleLabels[item.moduleId]}</span></span>
     <bdi className="font-mono" dir="ltr">{item.phone||'بدون شماره'}</bdi>
    </button>)}
    {!busy&&!contactError&&!contacts.length&&<p className="text-xs text-slate-500">{query.trim().length<2?'برای جست‌وجوی مخاطب دست‌کم دو نویسه بنویسید.':'مخاطبی در محدودهٔ دسترسی شما یافت نشد.'}</p>}
   </section>
  </div>
 </AdaptivePickerSurface>;
}
