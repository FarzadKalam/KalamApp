import {useEffect,useState} from 'react';
import {App,Form,Modal,Spin} from 'antd';
import {useQueryClient} from '@tanstack/react-query';
import VoipConnectionSettings from '../settings/VoipConnectionSettings';
import {supabase,SUPABASE_URL} from '../../supabaseClient';
import {loadScopedIntegrationSettings} from '../../utils/integrationSettings';
import {toFaErrorMessage} from '../../utils/errorMessageFa';
export default function ContactCenterConnectionModal({open,onClose,orgId,onSaved}:{open:boolean;onClose:()=>void;orgId:string;onSaved:()=>void}){
 const [form]=Form.useForm();const {message}=App.useApp();const cache=useQueryClient();
 const [loading,setLoading]=useState(false);const [saving,setSaving]=useState(false);const [testing,setTesting]=useState(false);const [syncing,setSyncing]=useState(false);const [syncInfo,setSyncInfo]=useState<any>(null);const [row,setRow]=useState<any>(null);const [ready,setReady]=useState(false);
 useEffect(()=>{
  if(!open)return;let current=true;setLoading(true);setReady(false);form.resetFields();
  void loadScopedIntegrationSettings(supabase,{connectionType:'voip',columns:'id,org_id,provider,settings,is_active'}).then(result=>{
   if(!current)return;if(result.error||result.orgId!==orgId)throw new Error('دسترسی به اتصال تلفن این سازمان ممکن نشد.');
   const stored=result.data as any;setRow(stored);form.setFieldsValue({voip:{usage_mode:'reports',...(stored?.settings||{}),provider:stored?.provider||'telefonchy',is_active:stored?.is_active===true}});setReady(true);
  }).catch(error=>{if(current)message.error(toFaErrorMessage(error,'تنظیمات دریافت نشد.'));}).finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;};
 },[open,orgId,form,message]);
 const save=async()=>{
  try{await form.validateFields();setSaving(true);const values=form.getFieldValue('voip')||{};const {provider,is_active,...settings}=values;
   const payload={org_id:orgId,connection_type:'voip',provider:provider||'telefonchy',is_active:is_active===true,settings:{...(row?.settings||{}),...settings},...(row?.id?{id:row.id}:{})};
   const result=await supabase.from('integration_settings').upsert(payload,{onConflict:'org_id,connection_type'}).select('id').single();
   if(result.error)throw result.error;
   await cache.invalidateQueries({queryKey:['voip-connection-policy',orgId]});message.success('تنظیمات اتصال تلفن ذخیره شد.');onSaved();onClose();
  }catch(error:any){if(!error?.errorFields)message.error(toFaErrorMessage(error,'ذخیرهٔ تنظیمات انجام نشد.'));}finally{setSaving(false);}
 };
 const request=async(action:string)=>{
  const values=form.getFieldValue('voip')||{};const sync=action==='sync_recent_calls';sync?setSyncing(true):setTesting(true);
  try{const result=await supabase.functions.invoke(values.provider==='telefonchy'?'telefonchy_smartcall':'voip-dial',{headers:{'x-organization-id':orgId},body:{action,overrideSettings:values,...(sync?{days:7,perPage:50}:{})}});
   if(result.error||!result.data?.success)throw new Error(result.data?.message||'عملیات اتصال انجام نشد.');
   if(sync)setSyncInfo(result.data);message.success(result.data?.message||'عملیات انجام شد.');
  }catch(error){message.error(toFaErrorMessage(error,'بررسی اتصال انجام نشد.'));}finally{setTesting(false);setSyncing(false);}
 };
 const secret=Form.useWatch(['voip','webhook_secret'],form);
 const webhook=secret?`${SUPABASE_URL.replace(/\/$/,'')}/functions/v1/voip-call-webhook?org_id=${encodeURIComponent(orgId)}&secret=${encodeURIComponent(secret)}`:'';
 return <Modal open={open} width={900} title="تنظیمات اتصال تلفن سازمان" onCancel={onClose} onOk={()=>void save()} okText="ذخیرهٔ تنظیمات" cancelText="انصراف" confirmLoading={saving} okButtonProps={{disabled:!ready}} destroyOnHidden>
  {loading?<Spin />:<Form form={form} layout="vertical"><VoipConnectionSettings form={form} currentOrgId={orgId} voipWebhookUrl={webhook} testing={testing} syncing={syncing} syncInfo={syncInfo} onTest={()=>void request('test_connection')} onSync={()=>void request('sync_recent_calls')} copyValue={(value,label)=>{void navigator.clipboard.writeText(value).then(()=>message.success(`${label} کپی شد.`));}} /></Form>}
 </Modal>;
}
