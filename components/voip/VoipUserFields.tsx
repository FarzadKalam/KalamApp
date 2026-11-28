import {Alert,Button,Collapse,Form,Input,InputNumber,Switch} from 'antd';
import type {FormInstance} from 'antd';
import AdaptiveSelectField from '../AdaptiveSelectField';
import {normalizeSipDomain,normalizeWssUrl,resolveVoipPolicy} from '../../utils/voipConnectionPolicy';
export default function VoipUserFields({settings,form,onScan,hasAccount,optionalAccount=false}:{settings:Record<string,any>;form:FormInstance;onScan:()=>void;hasAccount:boolean;optionalAccount?:boolean}){
 const enabled=Form.useWatch('voip_enabled',form);
 const strategy=Form.useWatch('voip_connection_strategy',form)||'auto';
 const policy=resolveVoipPolicy(settings,settings.provider);
 return <div className="space-y-3">
  <Alert type="info" showIcon message={policy.usageMode==='reports'?'حالت سازمان: فقط گزارشات تماس':policy.development?'مرکز تلفن ابری تازه‌سیستم — در حال توسعه':'حالت سازمان: مکالمه با سرویس‌دهندهٔ دیگر'} description="مسیر اصلی تماس در تنظیمات VoIP سازمان تعیین می‌شود؛ همهٔ کاربران از همان مسیر پیروی می‌کنند." />
  <Form.Item label={policy.usageMode==='reports'?'فعال برای تطبیق گزارش تماس‌ها':'فعال برای این کاربر'} name="voip_enabled" valuePropName="checked"><Switch disabled={policy.development} /></Form.Item>
  {enabled&&!policy.development&&<>
   {policy.canUseBrowser&&<Form.Item label="حساب مستقل مخصوص پاسخ‌گوی هوشمند" name="voip_ai_dedicated" valuePropName="checked" extra="این حساب برای تماس‌های AI رزرو می‌شود؛ آن را هم‌زمان برای ورود اپراتور انسانی استفاده نکنید."><Switch /></Form.Item>}
   {policy.canUseBrowser&&<Button onClick={onScan}>ورود اطلاعات از QR سرویس‌دهنده / PortSIP</Button>}
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <Form.Item label="نام کاربری ورود SIP" name="voip_extension" extra="همان نام کاربری ورود به PortSIP؛ ممکن است با داخلی کوتاه تماس متفاوت باشد." rules={[{required:!optionalAccount,message:'نام کاربری ورود را وارد کنید.'}]}><Input dir="ltr" autoComplete="off" /></Form.Item>
    {policy.canUseBrowser&&<Form.Item label="داخلی قابل شماره‌گیری" name="voip_dial_extension" extra="شماره‌ای که همکاران برای تماس با این کاربر می‌گیرند؛ مانند ۱۰۱ یا ۱۰۲. برای ورود استفاده نمی‌شود." rules={[{pattern:/^[0-9۰-۹٠-٩*#]{1,20}$/,message:'داخلی تماس را فقط با عدد، ستاره یا مربع وارد کنید.'}]}><Input dir="ltr" inputMode="tel" autoComplete="off" /></Form.Item>}
    <Form.Item label="کد اپراتور برای تطبیق گزارش‌ها" name="voip_operator_code"><Input dir="ltr" /></Form.Item>
    <Form.Item label="شناسه سرویس (اگر با پیش‌فرض سازمان متفاوت است)" name="voip_service_id"><Input dir="ltr" /></Form.Item>
    {policy.canUseBrowser&&<>
     <Form.Item label="رمز حساب موجود سرویس‌دهنده" name="voip_sip_password" rules={[{required:!optionalAccount&&!hasAccount,message:'رمز حساب سرویس‌دهنده را وارد کنید.'}]} extra={hasAccount?'خالی بگذارید تا رمز قبلی حفظ شود.':optionalAccount?'برای فعال‌سازی حساب تلفن می‌توانید بعداً رمز سرویس‌دهنده را وارد کنید.':'رمز حساب را از سرویس‌دهنده بگیرید.'}><Input.Password dir="ltr" autoComplete="new-password" /></Form.Item>
     <Form.Item label="سرور SIP حساب اپراتور" name="voip_server_url" extra="همان سروری که در PortSIP وارد می‌کنید؛ برای SIP معمولی، درگاه سامانه استفاده می‌شود."><Input dir="ltr" autoComplete="off" /></Form.Item>
     <div className="md:col-span-2"><Collapse items={[{key:'sip',label:'تنظیمات پیشرفتهٔ اتصال صوت',children:<>
      <Form.Item label="روش اتصال" name="voip_connection_strategy" initialValue="auto"><AdaptiveSelectField options={[{value:'auto',label:'خودکار — WebRTC مستقیم یا درگاه SIP'},{value:'gateway',label:'SIP معمولی از طریق درگاه'},{value:'direct',label:'WebRTC مستقیم سرویس‌دهنده'}]} /></Form.Item>
      {strategy!=='direct'&&<>
       <Form.Item label="نوع اتصال به سرور SIP" name="voip_sip_transport" initialValue="udp"><AdaptiveSelectField options={[{value:'udp',label:'UDP'},{value:'tcp',label:'TCP'}]} /></Form.Item>
       <Form.Item label="پورت SIP (پیش‌فرض ۵۰۶۰)" name="voip_sip_port"><InputNumber min={1} max={65535} /></Form.Item>
      </>}
      <Form.Item label="شناسه احراز هویت SIP (اگر با داخلی فرق دارد)" name="voip_auth_username"><Input dir="ltr" autoComplete="off" /></Form.Item>
      {strategy!=='gateway'&&<Form.Item label="آدرس کامل WSS حساب اپراتور" name="voip_wss_url" extra="فقط برای WebRTC مستقیم؛ اگر خالی باشد در حالت خودکار، درگاه SIP انتخاب می‌شود." rules={[{validator:async(_,value)=>{if(value&&!normalizeWssUrl(value))throw new Error('آدرس کامل wss:// وارد کنید.');}}]}><Input dir="ltr" /></Form.Item>}
      <Form.Item label="دامنه SIP (اگر با سرور متفاوت است)" name="voip_sip_domain" rules={[{validator:async(_,value)=>{if(value&&!normalizeSipDomain(value))throw new Error('دامنه SIP را بدون مسیر یا نشانی وب وارد کنید.');}}]}><Input dir="ltr" /></Form.Item>
     </>}]} /></div>
    </>}
   </div>
  </>}
 </div>;
}
