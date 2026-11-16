import React,{useCallback,useEffect,useState} from 'react';
import {Alert,Avatar,Button,Empty,Modal,Spin,Tag} from 'antd';
import {CustomerServiceOutlined,PhoneOutlined,PlusOutlined,ReloadOutlined,SettingOutlined,EditOutlined,TeamOutlined,CheckCircleOutlined,AudioOutlined} from '@ant-design/icons';
import {supabase} from '../supabaseClient';
import {fetchSessionBootstrap} from '../utils/sessionCache';
import {getSelectedOrganizationId} from '../utils/organizationContext';
import {useVoipConnectionPolicy} from '../hooks/useVoipConnectionPolicy';
import {useContactCenterOperators,type ContactCenterOperator} from '../hooks/useContactCenterOperators';
import {useOrgPlanFeature} from '../hooks/useOrgPlanFeature';
import {setVoipDockTarget} from '../utils/voipDock';
import {useVoipState} from '../utils/voipStore';
import {normalizePublicAssetUrl} from '../utils/assetUrl';
import {getAgentDefinition} from '../utils/aiAgentCatalog';
import {AiAgentAvatar} from '../components/ai/AiAgentIcon';
import ContactCenterOperatorModal from '../components/voip/ContactCenterOperatorModal';
import ContactCenterConnectionModal from '../components/voip/ContactCenterConnectionModal';
import CustomerVoiceConsole from '../components/voip/CustomerVoiceConsole';
const MessagingSurface=React.lazy(()=>import('../components/notifications/messaging/MessagingSurfacePrototype'));
const AiAgentConfigPanel=React.lazy(()=>import('../components/ai/AiAgentConfigPanel'));
const panel='rounded-3xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#17212b]';
export default function ContactCenterPage(){
 const selectedOrg=getSelectedOrganizationId();const [session,setSession]=useState<any>(null);const [sessionError,setSessionError]=useState(false);
 const [offset,setOffset]=useState(0);const [editing,setEditing]=useState<ContactCenterOperator|null|undefined>(undefined);const [settingsOpen,setSettingsOpen]=useState(false);const [agentOpen,setAgentOpen]=useState(false);const [voiceOpen,setVoiceOpen]=useState(false);
 const [summary,setSummary]=useState({loaded:0,answered:0,missed:0});
 useEffect(()=>{let current=true;setSession(null);setSessionError(false);setOffset(0);void fetchSessionBootstrap(supabase).then(data=>{if(current){setSession(data);setSessionError(!!data.bootstrapError);}}).catch(()=>{if(current)setSessionError(true);});return()=>{current=false;};},[selectedOrg]);
 const orgId=String(session?.orgId||'')||null;const permissions=session?.permissions;
 const canManage=!!permissions&&(permissions.__settings_tabs?.edit===true||permissions.profiles?.edit===true);
 const canSettings=permissions?.__settings_tabs?.edit===true&&permissions?.__settings_tabs?.fields?.connections!==false;
 const canView=!!permissions&&permissions.voip_call_reports?.view!==false&&permissions.__communications?.fields?.voip_calls!==false;
 const plan=useOrgPlanFeature('voip_webphone',orgId||'',false);
 const policy=useVoipConnectionPolicy(orgId,!!session?.user?.id,session?.user?.id);
 const operators=useContactCenterOperators(orgId,offset,canManage&&plan===true);
 const phone=useVoipState();const agent=getAgentDefinition('customer_response');
 const dockRef=useCallback((element:HTMLDivElement|null)=>{setVoipDockTarget(element);},[]);
 useEffect(()=>()=>setVoipDockTarget(null),[]);
 const refresh=()=>{void operators.refetch();void policy.refetch();};
 if(sessionError)return <Alert type="error" showIcon message="دریافت دسترسی مرکز تماس انجام نشد." />;
 if(!session)return <div className="p-8 text-center"><Spin /></div>;
 if(!canView)return <Alert type="warning" showIcon message="دسترسی مشاهدهٔ تماس‌ها برای شما فعال نیست." />;
 const settings={provider:policy.data?.provider||'telefonchy',usage_mode:policy.data?.usageMode||'reports',browser_source:policy.data?.browserSource||'external'};
 return <div dir="rtl" className="mx-auto max-w-[1800px] p-3 md:p-6 space-y-5">
  <header className={`${panel} p-5 md:p-6 flex flex-wrap items-center justify-between gap-4`}>
   <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 text-2xl"><CustomerServiceOutlined /></span><div><h1 className="text-xl font-extrabold">مرکز تماس</h1><p className="mt-1 text-xs text-slate-500">تماس‌ها، همکاران و پاسخ‌گویی هوشمند سازمان</p></div></div>
   <div className="flex flex-wrap gap-2">{canSettings&&<Button icon={<SettingOutlined />} onClick={()=>setSettingsOpen(true)}>تنظیمات اتصال</Button>}<Button icon={<ReloadOutlined />} onClick={refresh}>به‌روزرسانی</Button></div>
  </header>
  <div className="grid grid-cols-1 xl:grid-cols-[350px_minmax(0,1fr)] gap-5 items-start">
   <aside className="space-y-4 xl:sticky xl:top-4">
    {policy.data?.enabled&&plan===true?<div ref={dockRef} aria-label="شماره‌گیر مرکز تماس" />:<div className={`${panel} p-5 space-y-3`}><PhoneOutlined className="text-2xl text-sky-500" /><h2 className="font-bold">شماره‌گیر</h2><p className="text-sm text-slate-500">{policy.data?.message||'دریافت وضعیت اتصال تلفن…'}</p>{!!policy.error&&<Alert type="warning" message="دریافت وضعیت اتصال ناموفق بود." />}{canSettings&&<Button onClick={()=>setSettingsOpen(true)}>تنظیم اتصال تلفن</Button>}</div>}
    <button type="button" className={`${panel} w-full p-4 flex items-center gap-3 text-start hover:border-sky-400`} onClick={()=>setAgentOpen(true)}><AiAgentAvatar agentKey="customer_response" size={44} /><div className="min-w-0 flex-1"><strong className="block text-sm">{agent?.titleFa||'ایجنت پاسخ‌گویی مشتری'}</strong><span className="text-xs text-slate-500">مدل‌ها، دستورالعمل‌ها و تنظیمات تماس صوتی</span></div><SettingOutlined /></button>
    <Button block size="large" type="primary" icon={<AudioOutlined />} onClick={()=>setVoiceOpen(true)}>تماس با هوش مصنوعی</Button>
   </aside>
   <main className="min-w-0 space-y-5">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
     {[
      {title:'وضعیت تلفن شما',value:phone.activeCall?'در حال مکالمه':phone.status==='registered'?'متصل':'قطع',icon:<PhoneOutlined />,color:phone.status==='registered'?'text-emerald-600':'text-slate-500'},
      {title:'تماس‌های بارگیری‌شده',value:summary.loaded.toLocaleString('fa-IR'),icon:<CustomerServiceOutlined />,color:'text-sky-600'},
      {title:'پاسخ‌داده‌شده در این فهرست',value:summary.answered.toLocaleString('fa-IR'),icon:<CheckCircleOutlined />,color:'text-emerald-600'},
      {title:'اپراتورهای این صفحه',value:(operators.data?.items.length||0).toLocaleString('fa-IR'),icon:<TeamOutlined />,color:'text-violet-600'},
     ].map(card=><div key={card.title} className={`${panel} p-4`}><span className={`text-xl ${card.color}`}>{card.icon}</span><p className="mt-3 text-xs text-slate-500">{card.title}</p><strong className="mt-1 block text-xl">{card.value}</strong></div>)}
    </div>
    <section className={`${panel} p-4 md:p-5 space-y-4`} aria-label="اپراتورهای مرکز تماس">
     <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">اپراتورها</h2><p className="mt-1 text-xs text-slate-500">وضعیت اتصال معتبر؛ به‌روزرسانی هر ۱۵ ثانیه</p></div>{canManage&&plan===true&&<Button icon={<PlusOutlined />} onClick={()=>setEditing(null)}>اتصال کاربر به اپراتور</Button>}</div>
     {!canManage?<p className="text-sm text-slate-500">مدیریت اپراتورها نیازمند دسترسی مدیریت کاربران یا تنظیمات سازمان است.</p>:plan!==true?<p className="text-sm text-slate-500">مکالمهٔ داخل سامانه در پلن سازمان فعال نیست.</p>:operators.isLoading?<Spin />:operators.error?<Alert type="error" message="دریافت اپراتورها انجام نشد." action={<Button onClick={()=>void operators.refetch()}>تلاش دوباره</Button>} />:!operators.data?.items.length?<Empty description="هنوز حساب اپراتوری متصل نشده است" />:<div className="grid grid-cols-1 md:grid-cols-2 gap-3">{operators.data.items.map(operator=>{
      const isSelf=operator.profileId===session.user?.id;const busy=isSelf?!!phone.activeCall:operator.status==='busy';const online=isSelf?phone.status==='registered':operator.status==='online';
      return <div key={operator.id} className="rounded-2xl border border-slate-200 dark:border-white/10 p-3 flex items-center gap-3">
       <div className="relative"><Avatar size={44} src={normalizePublicAssetUrl(operator.avatarUrl)||undefined}>{operator.title.slice(0,1)}</Avatar><span aria-label={busy?'در حال مکالمه':online?'متصل':'قطع'} className={`absolute bottom-0 left-0 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${busy?'bg-amber-500':online?'bg-emerald-500':'bg-slate-400'}`} /></div>
       <div className="min-w-0 flex-1"><h3 className="font-semibold text-sm truncate">{operator.title}</h3><p className="mt-1 text-xs text-slate-500">داخلی تماس: <bdi dir="ltr">{operator.metadata.dial_extension||'ثبت نشده'}</bdi></p><Tag className="mt-1" color={busy?'gold':online?'success':'default'}>{busy?'در حال مکالمه':online?'متصل':operator.isActive?'قطع':'غیرفعال'}</Tag></div>
       <Button type="text" icon={<EditOutlined />} aria-label={`ویرایش ${operator.title}`} onClick={()=>setEditing(operator)} />
      </div>;
     })}</div>}
     {(offset>0||operators.data?.hasMore)&&<div className="flex gap-2"><Button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-20))}>صفحهٔ قبل</Button><Button disabled={!operators.data?.hasMore} onClick={()=>setOffset(operators.data!.nextOffset)}>صفحهٔ بعد</Button></div>}
    </section>
    <section className={`${panel} overflow-hidden`} aria-label="فهرست تماس‌ها"><div className="p-4 border-b border-slate-200 dark:border-white/10"><h2 className="font-bold">تماس‌ها و پروندهٔ مکالمات</h2></div><div className="h-[720px] max-h-[90dvh]"><React.Suspense fallback={<div className="p-6"><Spin /></div>}><MessagingSurface callsOnly initialFilter="call" onCallSummary={setSummary} /></React.Suspense></div></section>
   </main>
  </div>
  {orgId&&editing!==undefined&&<ContactCenterOperatorModal open operator={editing} orgId={orgId} settings={settings} onClose={()=>setEditing(undefined)} onSaved={refresh} />}
  {orgId&&settingsOpen&&<ContactCenterConnectionModal open orgId={orgId} onClose={()=>setSettingsOpen(false)} onSaved={refresh} />}
  <Modal open={agentOpen} onCancel={()=>setAgentOpen(false)} footer={null} width={1100} title={agent?.titleFa||'تنظیمات ایجنت پاسخ‌گویی'} destroyOnHidden><React.Suspense fallback={<Spin />}><AiAgentConfigPanel compact initialAgentKey="customer_response" /></React.Suspense></Modal>
  <CustomerVoiceConsole open={voiceOpen} onClose={()=>setVoiceOpen(false)} />
 </div>;
}
