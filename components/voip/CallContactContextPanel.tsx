import React,{useEffect,useState} from 'react';
import {Alert,Button,Collapse,Empty,Input,Spin,Tag} from 'antd';
import {MODULES} from '../../moduleRegistry';
import {getRecordTitle} from '../../utils/recordTitle';
import {getFieldLabelFa} from '../../utils/fieldLabel';
import {safeJalaliFormat,toPersianNumber} from '../../utils/persianNumberFormatter';
import {readVoipContactContext,CALL_CONTACT_SECTION_KEYS,CALL_CONTACT_SECTION_LABELS,type CallContactIdentity,type CallContactSection} from '../../utils/voipContactContext';
import {getSelectedOrganizationId} from '../../utils/organizationContext';
const OperationalFinancialOverviewPanel=React.lazy(()=>import('../accounting/OperationalFinancialOverviewPanel'));
const roleLabels={customers:'مشتری',suppliers:'تأمین‌کننده',employees:'کارمند'};
const activityDate=(row:any)=>new Date(Math.max(Date.parse(row.updated_at||'')||0,Date.parse(row.created_at||'')||0)).toISOString();

function GroupMessages({identity,groupId,offset}:{identity:CallContactIdentity;groupId:string;offset:number}){
 const [items,setItems]=useState<any[]|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const load=async()=>{if(items){setItems(null);return;}setBusy(true);setError('');try{const data=await readVoipContactContext({action:'group_messages',moduleId:identity.moduleId,recordId:identity.recordId,groupId,groupOffset:offset});setItems(data.items||[]);}catch{setError('دسترسی به پیام‌های این گروه ممکن نشد.');}finally{setBusy(false);}};
 return <div><Button size="small" loading={busy} onClick={()=>void load()}>{items?'بستن پیام‌ها':'مشاهدهٔ ۱۰ پیام اخیر'}</Button>{error&&<p role="alert">{error}</p>}{items&&<div className="max-h-48 overflow-auto space-y-2 mt-2">{items.length?items.map(item=><div key={item.id} className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2"><time>{safeJalaliFormat(item.createdAt,'YYYY/MM/DD HH:mm')}</time><p className="whitespace-pre-wrap break-words">{item.text||'پیام بدون متن'}</p></div>):<p>پیامی در محدودهٔ دسترسی یافت نشد.</p>}</div>}</div>;
}

function ContactSection({identity,section}:{identity:CallContactIdentity;section:string}){
 const [data,setData]=useState<CallContactSection|null>(null);const [busy,setBusy]=useState(true);const [error,setError]=useState('');
 const load=async(offset=0)=>{setBusy(true);setError('');try{const response=await readVoipContactContext({action:'section',moduleId:identity.moduleId,recordId:identity.recordId,section,offset});setData(previous=>offset&&previous?{...response.result,rows:[...previous.rows,...response.result.rows]}:response.result);}catch{setError('این بخش بارگیری نشد؛ سابقهٔ خالی محسوب نمی‌شود.');}finally{setBusy(false);}};
 useEffect(()=>{void load();},[identity.moduleId,identity.recordId,section]);
 const config=data?MODULES[data.moduleId]:undefined;
 return <div className="space-y-2">
  {error&&<Alert type="warning" message={error} action={<Button size="small" onClick={()=>void load()}>تلاش دوباره</Button>} />}
  {data?.state==='restricted'?<p>نمایش این بخش در دسترسی یا پلن شما مجاز نیست.</p>:data?.state==='not_applicable'?<p>این بخش برای نوع این مخاطب کاربرد ندارد.</p>:<>
   {(data as any)?.summary&&<div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 p-2">{Object.entries({total:'همهٔ فاکتورها',proforma:'پیش‌فاکتور',settled:'تسویه‌شده',completedAndSettled:'تکمیل و تسویه‌شده',outstanding:'مانده‌دار'}).map(([key,label])=><p key={key}>{label}: {toPersianNumber((data as any).summary[key]||0)}</p>)}</div>}
   {data?.count!=null&&<p>تعداد کل در محدودهٔ دسترسی: {toPersianNumber(data.count)}</p>}
   {data&&!data.rows.length&&!busy&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="سابقه‌ای در محدودهٔ دسترسی یافت نشد" />}
   {data?.rows.map((row,index)=>{
    const statusField=config?.fields?.find(field=>field.key==='status');
    const status=statusField?.options?.find(option=>String(option.value)===String(row.status))?.label;
    return <div key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2 space-y-1">
     <a href={row.href} target="_blank" rel="noopener noreferrer" className="font-semibold">{getRecordTitle(row,config)}</a>
     <div className="flex flex-wrap gap-2">{status&&<Tag>{status}</Tag>}<time>{row.updated_at||row.created_at?safeJalaliFormat(activityDate(row),'YYYY/MM/DD HH:mm'):''}</time></div>
     {['invoice_date','total_invoice_amount','total_received_amount','remaining_balance','due_date','started_at'].filter(key=>row[key]!=null).map(key=>{
      const field=config?.fields?.find(field=>field.key===key);if(!field)return null;
      return <p key={key}>{getFieldLabelFa(field,{moduleId:data.moduleId})}: {key.endsWith('date')||key.endsWith('_at')?safeJalaliFormat(row[key],'YYYY/MM/DD'):toPersianNumber(Number(row[key]).toLocaleString('en-US'))}</p>;
     })}
     {Array.isArray(row.payments)&&row.payments.length>0&&<Collapse size="small" items={[{key:'payments',label:`پرداخت‌های فاکتور (${toPersianNumber(row.payments.length)})`,children:row.payments.map((payment:any,index:number)=><p key={index}>{toPersianNumber(Number(payment.amount||0).toLocaleString('en-US'))} · {safeJalaliFormat(payment.date||payment.payment_date,'YYYY/MM/DD')}</p>)}]} />}
     {row.message_text&&<p className="whitespace-pre-wrap break-words">{String(row.message_text).slice(0,500)}</p>}
     {section==='groups'&&<GroupMessages identity={identity} groupId={row.id} offset={Math.floor(index/20)*20} />}
    </div>;
   })}
   {data?.hasMore&&<Button loading={busy} onClick={()=>void load(data.rows.length)}>نمایش موارد قدیمی‌تر</Button>}
  </>}
  {busy&&<Spin size="small" />}
 </div>;
}

export default function CallContactContextPanel({phone,onChoosePhone}:{phone:string;onChoosePhone?:(phone:string)=>void}){
 const [query,setQuery]=useState('');const [candidates,setCandidates]=useState<CallContactIdentity[]>([]);const [selected,setSelected]=useState<CallContactIdentity|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const orgId=getSelectedOrganizationId();const lookup=query.trim()||phone;
 useEffect(()=>{
  let current=true;const controller=new AbortController();setCandidates([]);setSelected(null);setError('');
  if(lookup.trim().length<2)return;
  setBusy(true);
  const timer=setTimeout(()=>{void readVoipContactContext({action:'search',query:lookup},controller.signal).then(data=>{if(!current)return;const rows=data.candidates||[];setCandidates(rows);if(rows.length===1)setSelected(rows[0]);}).catch(()=>{if(current)setError('شناسایی مخاطب انجام نشد.');}).finally(()=>{if(current)setBusy(false);});},350);
  return ()=>{current=false;clearTimeout(timer);controller.abort();};
 },[lookup,orgId]);
 return <section aria-label="پروندهٔ مخاطب تماس" className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-3">
  <h3 className="font-bold">پرونده و تاریخچهٔ مخاطب</h3>
  <Input aria-label="جست‌وجوی مخاطب با نام یا شماره" placeholder="نام مشتری، تأمین‌کننده، کارمند یا شماره" value={query} onChange={event=>setQuery(event.target.value)} allowClear />
  {busy&&<Spin size="small" />}{error&&<p role="alert">{error}</p>}
  {!busy&&!error&&lookup.length>=2&&!candidates.length&&<p>مخاطبی با دسترسی مجاز پیدا نشد.</p>}
  {candidates.length>1&&<p>چند مخاطب پیدا شد؛ پرونده را انتخاب کنید.</p>}
  {candidates.length>1&&candidates.map(item=><Button key={item.moduleId+item.recordId} block onClick={()=>setSelected(item)}>{item.title} · {roleLabels[item.moduleId]}</Button>)}
  {selected&&<div key={selected.moduleId+selected.recordId} className="space-y-2">
   <a href={`/${selected.moduleId}/${selected.recordId}`} target="_blank" rel="noopener noreferrer" className="font-semibold">{selected.title}</a><Tag>{roleLabels[selected.moduleId]}</Tag>
   {selected.rank&&<p>سطح مخاطب: {selected.rank}</p>}
   {onChoosePhone&&selected.phone&&<Button size="small" onClick={()=>{onChoosePhone(selected.phone);setQuery('');}}>انتخاب شمارهٔ این مخاطب</Button>}
   <p className="text-slate-500">سوابق بر اساس آخرین تغییر نمایش داده می‌شوند؛ شناسایی شماره به معنی تأیید هویت نیست.</p>
   <Collapse size="small" defaultActiveKey={['invoices','projects']} items={[
    ...CALL_CONTACT_SECTION_KEYS.map(section=>({key:section,label:CALL_CONTACT_SECTION_LABELS[section],children:<ContactSection identity={selected} section={section} />})),
    {key:'financial',label:'گردش و ماندهٔ مالی مخاطب',children:<React.Suspense fallback={<Spin size="small" />}><OperationalFinancialOverviewPanel entityType={selected.moduleId==='customers'?'customer':selected.moduleId==='suppliers'?'supplier':'employee'} entityId={selected.recordId} /></React.Suspense>},
   ]} />
  </div>}
 </section>;
}
