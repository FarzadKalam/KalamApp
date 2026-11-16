import {useEffect,useState} from 'react';
import {App,Form,Input,Modal} from 'antd';
import AdaptiveIdentityPicker from '../AdaptiveIdentityPicker';
import VoipUserFields from './VoipUserFields';
import {VoipQrScannerModal} from './VoipQrScannerModal';
import {supabase} from '../../supabaseClient';
import {toFaErrorMessage} from '../../utils/errorMessageFa';
import {normalizeDialExtension} from '../../supabase/functions/_shared/voip-directory';
type Props={open:boolean;operator:any;orgId:string;settings:Record<string,any>;onClose:()=>void;onSaved:()=>void};
export default function ContactCenterOperatorModal({open,operator,orgId,settings,onClose,onSaved}:Props){
 const [form]=Form.useForm();const {message}=App.useApp();const [busy,setBusy]=useState(false);const [scanner,setScanner]=useState(false);
 useEffect(()=>{
  if(!open)return;form.resetFields();const meta=operator?.metadata||{};
  form.setFieldsValue({profileId:operator?.profileId,full_name:operator?.title||'',voip_enabled:operator?operator.isActive:true,voip_ai_dedicated:meta.ai_dedicated===true,
   voip_extension:operator?.loginUsername||'',voip_dial_extension:meta.dial_extension||'',voip_server_url:meta.server_url||'',voip_sip_domain:meta.sip_domain||'',
   voip_auth_username:meta.auth_username||'',voip_wss_url:meta.wss_url||'',voip_connection_strategy:meta.connection_strategy||'auto',voip_sip_transport:meta.sip_transport||'udp',voip_sip_port:meta.sip_port||null});
 },[open,operator,orgId,form]);
 const save=async()=>{
  try{
   const values=await form.validateFields();setBusy(true);
   const metadata={dial_extension:normalizeDialExtension(values.voip_dial_extension),provider:settings.provider,ai_dedicated:values.voip_ai_dedicated===true,
    server_url:values.voip_server_url||'',sip_domain:values.voip_sip_domain||'',auth_username:values.voip_auth_username||'',wss_url:values.voip_wss_url||'',
    connection_strategy:values.voip_connection_strategy||'auto',sip_transport:values.voip_sip_transport||'udp',sip_port:values.voip_sip_port||null};
   const result=await supabase.functions.invoke('voip-session',{headers:{'x-organization-id':orgId},body:{action:'upsert_endpoint',endpoint:{id:operator?.id,assignee_profile_id:values.profileId,display_name:values.full_name,extension:values.voip_extension,sip_secret:values.voip_sip_password||undefined,is_active:values.voip_enabled===true,metadata}}});
   if(result.error||!result.data?.success)throw new Error(result.data?.message||'حساب تلفن ذخیره نشد.');
   const member=await supabase.rpc('manage_organization_member',{p_user_id:values.profileId,p_patch:{settings:{voip_enabled:values.voip_enabled===true,voip_extension:values.voip_extension,voip_dial_mode:'webphone_webrtc'}}});
   if(member.error)throw new Error('حساب تلفن ذخیره شد، اما فعال‌سازی تلفن در عضویت کاربر انجام نشد. مجوز مدیریت کاربران را بررسی و دوباره ذخیره کنید.');
   message.success('تنظیمات اپراتور ذخیره شد.');onSaved();onClose();
  }catch(error:any){if(!error?.errorFields)message.error(toFaErrorMessage(error,'ذخیرهٔ اپراتور انجام نشد.'));}finally{setBusy(false);}
 };
 return <><Modal open={open} title={operator?'ویرایش اپراتور':'اتصال کاربر به حساب تلفن'} width={760} onCancel={onClose} onOk={()=>void save()} confirmLoading={busy} okText="ذخیرهٔ اپراتور" cancelText="انصراف" destroyOnHidden>
  <Form form={form} layout="vertical" preserve={false}>
   <Form.Item name="profileId" label="کاربر سازمان" rules={[{required:true,message:'کاربر را انتخاب کنید.'}]}><AdaptiveIdentityPicker scopes={['user']} valueMode="raw" disabled={!!operator} /></Form.Item>
   <Form.Item name="full_name" label="نام نمایشی اپراتور" rules={[{required:true,message:'نام نمایشی را بنویسید.'}]}><Input /></Form.Item>
   <VoipUserFields settings={settings} form={form} hasAccount={!!operator} onScan={()=>setScanner(true)} />
  </Form>
 </Modal><VoipQrScannerModal open={scanner} onClose={()=>setScanner(false)} onSuccess={config=>{form.setFieldsValue({voip_extension:config.extension,voip_sip_password:config.password,voip_server_url:config.serverUrl||config.sipDomain,voip_sip_domain:config.sipDomain,voip_wss_url:config.wssUrl||''});setScanner(false);}} /></>;
}
