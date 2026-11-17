import React,{useState} from 'react';
import {Alert,Button,Input,Modal,Segmented} from 'antd';
import {AudioOutlined,PhoneOutlined,StopOutlined,SendOutlined,SoundOutlined} from '@ant-design/icons';
import AiComposeModelBar from '../ai/AiComposeModelBar';
import AiApprovalReviewModal from '../ai/AiApprovalReviewModal';
import {AiAgentAvatar} from '../ai/AiAgentIcon';
import {useCustomerVoiceConversation} from '../../hooks/useCustomerVoiceConversation';
import {useCustomerPhoneAi} from '../../hooks/useCustomerPhoneAi';
const AssistantPanel=React.lazy(()=>import('../ai/AssistantPanel'));
export default function CustomerVoiceConsole({open,onClose}:{open:boolean;onClose:()=>void}){
 const [mode,setMode]=useState('browser');const [models,setModels]=useState<Record<string,string>>({});const [note,setNote]=useState('');const [sent,setSent]=useState(false);
 const voice=useCustomerVoiceConversation(models);
 const telephone=useCustomerPhoneAi();const [number,setNumber]=useState('');const [purpose,setPurpose]=useState('');const [noteError,setNoteError]=useState('');const [sendingNote,setSendingNote]=useState(false);
 const [reviewThread,setReviewThread]=useState(false);
 const telephoneActive=!!telephone.session&&['queued','preparing','dialing','active'].includes(telephone.session.status);
 const sendNote=async()=>{setSendingNote(true);setNoteError('');try{if(mode==='phone')await telephone.note(note);else voice.addNote(note);setNote('');setSent(true);}catch{setNoteError('یادداشت ارسال نشد؛ دوباره تلاش کنید.');}finally{setSendingNote(false);}};
 const update=(model:string|null,capability?:string|null)=>{if(!capability)return;setModels(previous=>model?{...previous,[capability]:model}:Object.fromEntries(Object.entries(previous).filter(([key])=>key!==capability)));};
 const close=()=>{voice.stop();onClose();};
 return <Modal open={open} onCancel={close} footer={null} width={820} title={<span className="inline-flex items-center gap-2"><AiAgentAvatar agentKey="customer_response" />تماس با ایجنت پاسخ‌گویی مشتری</span>} destroyOnHidden>
  <div className="space-y-4" dir="rtl">
   <Segmented block disabled={voice.state!=='idle'||telephoneActive} value={mode} onChange={value=>setMode(String(value))} options={[{value:'browser',label:'آزمایش داخل مرورگر',icon:<AudioOutlined />},{value:'phone',label:'تماس با مخاطب',icon:<PhoneOutlined />}]} />
   <fieldset disabled={voice.state!=='idle'||telephoneActive} className="grid gap-2 sm:grid-cols-3 disabled:opacity-70">{[{capability:'dashboard_chat',label:'مدل گفتگو'},{capability:'voice_input',label:'فهم صوت'},{capability:'voice_output',label:'تولید صوت'}].map(item=><div key={item.capability} className="space-y-1 min-w-0"><span className="text-xs text-slate-500 dark:text-slate-400">{item.label}</span><AiComposeModelBar disabled={voice.state!=='idle'||telephoneActive} agents={['customer_response']} selectedCapabilities={item.capability==='dashboard_chat'?[]:[item.capability]} fallbackCapability={item.capability} onModelOverrideChange={update} persistedOverrides={models} /></div>)}</fieldset>
   {mode==='browser'?<>
    <p className="text-xs text-slate-500 dark:text-slate-400">با شروع، میکروفون فعال می‌شود. پس از پایان جمله مکث کنید؛ پاسخ را می‌شنوید. مصرف مدل‌ها در هزینه‌های معمول هوش مصنوعی ثبت می‌شود.</p>
    <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 p-4 text-center"><strong>{({idle:'آمادهٔ شروع',listening:'گوش می‌دهم…',thinking:'در حال آماده‌کردن پاسخ…',speaking:'در حال پاسخ‌گویی…'})[voice.state]}</strong></div>
    {voice.error&&<Alert type="error" showIcon message={voice.error} />}
    <div className="flex gap-2">{voice.state==='idle'?<Button type="primary" icon={<AudioOutlined />} onClick={()=>void voice.start()}>شروع گفتگوی صوتی</Button>:<Button danger icon={<StopOutlined />} onClick={voice.stop}>پایان گفتگو</Button>}{voice.threadId&&<Button type="link" onClick={()=>setReviewThread(true)}>مشاهدهٔ گفتگو و هزینه‌ها</Button>}</div>
    <div className="max-h-64 overflow-y-auto space-y-2">{voice.messages.map((message,index)=><div key={index} className={`p-3 rounded-xl ${message.role==='assistant'?'bg-sky-50 dark:bg-sky-950':'bg-slate-100 dark:bg-slate-800'}`}><strong className="text-xs">{message.role==='assistant'?'پاسخ‌گوی مشتری':'اپراتور'}</strong><p className="whitespace-pre-wrap text-sm mt-1">{message.text}</p></div>)}</div>
    {voice.approval&&<Button onClick={()=>voice.setApproval({...voice.approval,reviewOpen:true})}>مشاهدهٔ کارت تأیید اقدام</Button>}
   </>:<div className="space-y-3">
    <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">تماس از حساب مستقل AI گرفته می‌شود. شما می‌توانید به تماس فعال متصل شوید و گفتگو را بشنوید؛ یادداشت شما فقط به مدل می‌رسد.</p>
    <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="ai-call-number" className="block text-sm mb-1">شمارهٔ مخاطب</label><Input id="ai-call-number" inputMode="tel" dir="ltr" value={number} disabled={telephoneActive} onChange={event=>setNumber(event.target.value)} placeholder="۰۹…" /></div><div><label htmlFor="ai-call-purpose" className="block text-sm mb-1">هدف تماس</label><Input id="ai-call-purpose" value={purpose} disabled={telephoneActive} maxLength={2000} onChange={event=>setPurpose(event.target.value)} placeholder="مثلاً هماهنگی زمان پیگیری" /></div></div>
    {telephone.error&&<Alert type="error" showIcon message={telephone.error} />}
    {telephone.session&&<div role="status" className="rounded-2xl bg-slate-100 dark:bg-slate-800 px-4 py-3 font-semibold text-sm">{({queued:'تماس در صف آماده‌سازی است',preparing:'پاسخ‌گو در حال آماده‌شدن است',dialing:'در حال تماس با مخاطب',active:'مکالمه برقرار است',completed:'تماس پایان یافت',failed:'تماس انجام نشد؛ تنظیمات و گزارش را بررسی کنید',cancelled:'تماس متوقف شد'} as Record<string,string>)[telephone.session.status]||'دریافت وضعیت تماس'}</div>}
    <div className="flex flex-wrap gap-2">{!telephoneActive?<Button type="primary" loading={telephone.busy} disabled={!number.trim()||!purpose.trim()} icon={<PhoneOutlined />} onClick={()=>void telephone.start(number,purpose,models)}>برقراری تماس AI</Button>:<Button danger icon={<StopOutlined />} onClick={()=>void telephone.cancel()}>پایان تماس AI</Button>}<Button icon={<SoundOutlined />} loading={telephone.busy} disabled={!telephone.canListen} onClick={()=>void telephone.listen()}>شنیدن گفتگو</Button></div>
    <div className="max-h-64 overflow-y-auto space-y-2">{telephone.events.map(event=><div key={event.id} className={`rounded-xl p-3 text-sm ${event.kind==='assistant'?'bg-sky-50 dark:bg-sky-950':event.kind==='operator_note'?'bg-amber-50 dark:bg-amber-950':'bg-slate-100 dark:bg-slate-800'}`}><strong className="text-xs">{event.kind==='assistant'?'ایجنت پاسخ‌گویی':event.kind==='operator_note'?'یادداشت خصوصی اپراتور':'مخاطب'}</strong><p className="mt-1 whitespace-pre-wrap">{event.content}</p></div>)}</div>
   </div>}
   <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2"><label htmlFor="customer-voice-note" className="text-sm font-semibold">یادداشت خصوصی اپراتور برای مدل</label><Input.TextArea id="customer-voice-note" value={note} onChange={event=>{setNote(event.target.value);setSent(false);}} maxLength={2000} rows={2} placeholder="راهنمایی‌ای که در پاسخ بعدی به آن توجه شود" /><Button disabled={!note.trim()||(mode==='phone'?!telephoneActive:voice.state==='idle')} loading={sendingNote} icon={<SendOutlined />} onClick={()=>void sendNote()}>ارسال یادداشت</Button>{sent&&<p role="status" className="text-xs text-emerald-600">برای پاسخ بعدی در صف قرار گرفت.</p>}{noteError&&<p role="alert" className="text-xs text-red-600">{noteError}</p>}</div>
  </div>
  {voice.approval?.reviewOpen&&<AiApprovalReviewModal action={voice.approval} onClose={()=>voice.setApproval({...voice.approval,reviewOpen:false})} />}
  <Modal open={reviewThread} onCancel={()=>setReviewThread(false)} footer={null} title="گفتگو و هزینه‌های صوتی" width={950} destroyOnHidden><div className="h-[75dvh] min-h-0">{voice.threadId&&<React.Suspense fallback={null}><AssistantPanel active initialThreadId={voice.threadId} /></React.Suspense>}</div></Modal>
 </Modal>;
}
