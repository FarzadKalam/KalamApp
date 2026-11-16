import {Alert,Button,Collapse,Form,Input,Space,Switch} from 'antd';
import type {FormInstance} from 'antd';
import AdaptiveSelectField from '../AdaptiveSelectField';
import {FRONTEND_VOIP_PROVIDERS} from '../../utils/voipProvidersCatalog';
import {normalizeSipDomain,normalizeWssUrl,resolveVoipPolicy} from '../../utils/voipConnectionPolicy';

export type VoipConnectionsSectionProps={
 form:FormInstance;currentOrgId?:string|null;voipWebhookUrl:string;copyValue:(value:string,label:string)=>void;
 testing:boolean;syncing:boolean;syncInfo:any;onTest:()=>void;onSync:()=>void;
};
export default function VoipConnectionSettings({form,voipWebhookUrl,copyValue,testing,syncing,syncInfo,onTest,onSync}:VoipConnectionsSectionProps){
 const fields=Form.useWatch('voip',form)||form.getFieldValue('voip')||{};
 const policy=resolveVoipPolicy(fields,fields.provider);
 return <div className="space-y-4">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
   <Form.Item label="نوع استفاده از تلفن اینترنتی" name={['voip','usage_mode']} initialValue={policy.usageMode}>
    <AdaptiveSelectField value={policy.usageMode} options={[{value:'reports',label:'فقط گزارشات تماس'},{value:'browser',label:'مکالمه داخل تازه‌سیستم'}]} onChange={value=>form.setFieldValue(['voip','usage_mode'],value)} />
   </Form.Item>
   <Form.Item label="فعال برای سازمان" name={['voip','is_active']} valuePropName="checked"><Switch /></Form.Item>
   {policy.usageMode==='browser'&&<Form.Item label="مسیر مکالمه" name={['voip','browser_source']} initialValue={policy.browserSource}>
    <AdaptiveSelectField value={policy.browserSource} options={[{value:'external',label:'سرویس‌دهنده‌های دیگر'},{value:'taze_pbx',label:'مرکز تلفن ابری تازه‌سیستم — در حال توسعه'}]} onChange={value=>form.setFieldValue(['voip','browser_source'],value)} />
   </Form.Item>}
   {<Form.Item label="سرویس‌دهندهٔ گزارش‌ها / تماس" name={['voip','provider']}><AdaptiveSelectField options={FRONTEND_VOIP_PROVIDERS.filter(item=>item.value!=='kalamapp_cloud_pbx').map(item=>({value:item.value,label:item.label}))} /></Form.Item>}
  </div>
  {policy.development && <Alert showIcon type="info" message="مرکز تلفن ابری تازه‌سیستم در حال توسعه است" description="این مسیر هنوز برای مکالمه فعال نیست. تازه‌سیستم شماره تلفن یا مجوز مخابراتی ارائه نمی‌کند؛ اتصال آینده بر پایهٔ خط یا ترانک موجود سازمان خواهد بود. برای مکالمهٔ فعلی از سرویس‌دهندهٔ دیگر استفاده کنید." />}
  {!policy.development&&<>
   <Alert showIcon type="info" message={policy.usageMode==='reports'?'دریافت گزارش و رویداد تماس':'ورود با حساب موجود سرویس‌دهنده'} description={policy.usageMode==='reports'?'صوت مکالمه در PortSIP یا تلفن اپراتور انجام می‌شود. این حالت وب‌فون و شماره‌گیری داخل تازه‌سیستم را فعال نمی‌کند.':'نام کاربری، رمز و سرور SIP هر اپراتور را در ویرایش کاربر وارد کنید. اتصال خودکار از WebRTC مستقیم یا درگاه SIP آماده‌شدهٔ سامانه استفاده می‌کند. این مسیر نیز گزارش‌ها و رویدادهای تماس را دارد.'} />
   {policy.canUseBrowser&&<Collapse items={[{key:'direct',label:'تنظیمات اختیاری WebRTC مستقیم سرویس‌دهنده',children:<div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
    <Form.Item label="آدرس کامل وب‌سوکت امن سرویس‌دهنده (WSS)" name={['voip','wss_url']} rules={[{validator:async(_,value)=>{if(value&&!normalizeWssUrl(value))throw new Error('آدرس کامل با wss:// وارد کنید؛ آدرس SIP یا پورت UDP قابل جایگزینی نیست.');}}]} extra="از سرویس‌دهنده یا QR دریافت کنید؛ پورت و مسیر نباید حدس زده شوند. می‌توان آن را در حساب اپراتور هم وارد کرد.">
     <Input dir="ltr" placeholder="wss://pbx.example.com:port/path" />
    </Form.Item>
    <Form.Item label="دامنه SIP اعلام‌شده توسط سرویس‌دهنده" name={['voip','sip_domain']} rules={[{validator:async(_,value)=>{if(value&&!normalizeSipDomain(value))throw new Error('دامنه SIP را بدون آدرس وب‌سوکت و مسیر وارد کنید.');}}]} extra="ممکن است با میزبان WSS فرق داشته باشد؛ اطلاعات حساب اپراتور اولویت دارد."><Input dir="ltr" placeholder="pbx.example.com" /></Form.Item>
    <div className="md:col-span-2"><Alert showIcon type="info" message="برای SIP معمولی، WSS سرویس‌دهنده لازم نیست" description="درگاه سامانه ارتباط مرورگر را به SIP تبدیل می‌کند. این فیلدها فقط برای اتصال مستقیم مرورگر به سرویس‌دهنده هستند؛ آدرس یا پورت را حدس نزنید." /></div>
    <div className="md:col-span-2"><Collapse items={[{key:'ice',label:'تنظیمات پیشرفتهٔ شبکهٔ صوت',children:<>
      <Form.Item label="سرورهای ICE اعلام‌شده توسط سرویس‌دهنده (JSON)" name={['voip','ice_servers_json']} extra={'نمونه: [{"urls":"stun:stun.example.com:3478"}]. مشخصات TURN ثابت سازمان در اختیار کاربران مجاز وب‌فون قرار می‌گیرد.'} rules={[{validator:async(_,value)=>{if(!value)return;try{const servers=JSON.parse(value);if(!Array.isArray(servers)||servers.some(item=>!item?.urls))throw new Error();}catch{throw new Error('فهرست JSON سرورهای ICE معتبر نیست.');}}}]}><Input.TextArea dir="ltr" rows={3} /></Form.Item>
    </>}]} /></div>
   </div>}]} />}
  </>}
   <Collapse defaultActiveKey={['reports']} items={[{key:'reports',label:'اتصال گزارش‌ها، رویدادها و فایل ضبط مکالمات',children:<>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
     <Form.Item label="آدرس API سرویس‌دهنده" name={['voip','base_url']}><Input dir="ltr" placeholder="https://panel.telefonchy.com" /></Form.Item>
     <Form.Item label="توکن وب‌سرویس" name={['voip','webservice_token']}><Input.Password autoComplete="new-password" dir="ltr" /></Form.Item>
     <Form.Item label="شناسه سرویس" name={['voip','service_id']}><Input dir="ltr" /></Form.Item>
     <Form.Item label="رمز دریافت رویدادها" name={['voip','webhook_secret']}><Input.Password autoComplete="new-password" dir="ltr" /></Form.Item>
    </div>
    <Space wrap><Button loading={testing} onClick={onTest}>بررسی اتصال گزارش‌ها (API)</Button>{fields.provider==='telefonchy'&&<Button loading={syncing} onClick={onSync}>همگام‌سازی تماس‌ها</Button>}{voipWebhookUrl&&<Button onClick={()=>copyValue(voipWebhookUrl,'آدرس دریافت رویداد')}>کپی آدرس دریافت رویداد</Button>}</Space>
    <p className="text-xs text-gray-500 mt-2">موفقیت این بررسی، اتصال صوت یا ثبت داخلی را تأیید نمی‌کند.</p>
    {syncInfo&&<Alert className="mt-3" type="success" message={`دریافت‌شده: ${Number(syncInfo.fetched||0).toLocaleString('fa-IR')}، ذخیره‌شده: ${Number(syncInfo.saved||0).toLocaleString('fa-IR')}`} />}
   </>}]} />
 </div>;
}
