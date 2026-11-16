import {useState} from 'react';
import {Alert,Button,Input,Modal,Segmented} from 'antd';
import {AudioOutlined,PhoneOutlined,StopOutlined,SendOutlined} from '@ant-design/icons';
import AiComposeModelBar from '../ai/AiComposeModelBar';
import AiApprovalReviewModal from '../ai/AiApprovalReviewModal';
import {AiAgentAvatar} from '../ai/AiAgentIcon';
import {useCustomerVoiceConversation} from '../../hooks/useCustomerVoiceConversation';
export default function CustomerVoiceConsole({open,onClose}:{open:boolean;onClose:()=>void}){
 const [mode,setMode]=useState('browser');const [models,setModels]=useState<Record<string,string>>({});const [note,setNote]=useState('');const [sent,setSent]=useState(false);
 const voice=useCustomerVoiceConversation(models);
 const update=(model:string|null,capability?:string|null)=>{if(!capability)return;setModels(previous=>model?{...previous,[capability]:model}:Object.fromEntries(Object.entries(previous).filter(([key])=>key!==capability)));};
 const close=()=>{voice.stop();onClose();};
 return <Modal open={open} onCancel={close} footer={null} width={820} title={<span className="inline-flex items-center gap-2"><AiAgentAvatar agentKey="customer_response" />تماس با ایجنت پاسخ‌گویی مشتری</span>} destroyOnHidden>
  <div className="space-y-4" dir="rtl">
   <Segmented block disabled={voice.state!=='idle'} value={mode} onChange={value=>setMode(String(value))} options={[{value:'browser',label:'آزمایش داخل مرورگر',icon:<AudioOutlined />},{value:'phone',label:'تماس با مخاطب',icon:<PhoneOutlined />}]} />
   <div className="grid gap-2 sm:grid-cols-3">{[{capability:'dashboard_chat',label:'مدل گفتگو'},{capability:'voice_input',label:'فهم صوت'},{capability:'voice_output',label:'تولید صوت'}].map(item=><div key={item.capability} className="space-y-1"><span className="text-xs text-slate-500">{item.label}</span><AiComposeModelBar agents={['customer_response']} selectedCapabilities={item.capability==='dashboard_chat'?[]:[item.capability]} fallbackCapability={item.capability} onModelOverrideChange={update} persistedOverrides={models} /></div>)}</div>
   {mode==='browser'?<>
    <p className="text-xs text-slate-500">با شروع، میکروفون فعال می‌شود. پس از پایان جمله مکث کنید؛ پاسخ را می‌شنوید. مصرف مدل‌ها در هزینه‌های معمول هوش مصنوعی ثبت می‌شود.</p>
    <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 p-4 text-center"><strong>{({idle:'آمادهٔ شروع',listening:'گوش می‌دهم…',thinking:'در حال آماده‌کردن پاسخ…',speaking:'در حال پاسخ‌گویی…'})[voice.state]}</strong></div>
    {voice.error&&<Alert type="error" showIcon message={voice.error} />}
    <div className="flex gap-2">{voice.state==='idle'?<Button type="primary" icon={<AudioOutlined />} onClick={()=>void voice.start()}>شروع گفتگوی صوتی</Button>:<Button danger icon={<StopOutlined />} onClick={voice.stop}>پایان گفتگو</Button>}{voice.threadId&&<a href={`/ai?thread=${encodeURIComponent(voice.threadId)}`} target="_blank" rel="noopener noreferrer">مشاهدهٔ گفتگو و هزینه‌ها</a>}</div>
    <div className="max-h-64 overflow-y-auto space-y-2">{voice.messages.map((message,index)=><div key={index} className={`p-3 rounded-xl ${message.role==='assistant'?'bg-sky-50 dark:bg-sky-950':'bg-slate-100 dark:bg-slate-800'}`}><strong className="text-xs">{message.role==='assistant'?'پاسخ‌گوی مشتری':'اپراتور'}</strong><p className="whitespace-pre-wrap text-sm mt-1">{message.text}</p></div>)}</div>
    {voice.approval&&<Button onClick={()=>voice.setApproval({...voice.approval,reviewOpen:true})}>مشاهدهٔ کارت تأیید اقدام</Button>}
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2"><label htmlFor="customer-voice-note" className="text-sm font-semibold">یادداشت خصوصی اپراتور برای مدل</label><Input.TextArea id="customer-voice-note" value={note} onChange={event=>{setNote(event.target.value);setSent(false);}} maxLength={2000} rows={2} placeholder="راهنمایی‌ای که در پاسخ بعدی به آن توجه شود" /><Button disabled={!note.trim()||voice.state==='idle'} icon={<SendOutlined />} onClick={()=>{voice.addNote(note);setNote('');setSent(true);}}>ارسال یادداشت</Button>{sent&&<p className="text-xs text-emerald-600">برای پاسخ بعدی در صف قرار گرفت.</p>}</div>
   </>:<div className="space-y-3"><Alert type="info" message="اتصال به حساب مستقل پاسخ‌گوی AI" description="مسیر تماس تلفنی، شنیدن هم‌زمان اپراتور و یادداشت زنده در همین کنسول تکمیل می‌شود." /></div>}
  </div>
  {voice.approval?.reviewOpen&&<AiApprovalReviewModal action={voice.approval} onClose={()=>voice.setApproval({...voice.approval,reviewOpen:false})} />}
 </Modal>;
}
