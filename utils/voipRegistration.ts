/** REGISTER being sent is not registration success. Resolve only after SIP accepts it. */
export function createVoipRegistrationWait(timeoutMs=15_000){
 let finish:(value:boolean)=>void=()=>{};
 let errorMessage:string|null=null;
 let done=false;
 const promise=new Promise<boolean>(resolve=>{finish=resolve;});
 const timer=setTimeout(()=>fail('ثبت حساب SIP در زمان مناسب تأیید نشد. آدرس WSS و دسترسی سرویس‌دهنده را بررسی کنید.'),timeoutMs);
 function settle(value:boolean){if(done)return;done=true;clearTimeout(timer);finish(value);}
 function fail(message:string){if(done)return;errorMessage=message;settle(false);}
 return {promise,success:()=>settle(true),fail,getError:()=>errorMessage};
}
export const getSipRegistrationError=(status?:number)=>status===401||status===403
 ?'ورود SIP رد شد؛ نام کاربری، شناسه احراز هویت و رمز سرویس‌دهنده را بررسی کنید.'
 :status===404?'حساب یا دامنه SIP نزد سرویس‌دهنده پیدا نشد.'
 :'سرویس‌دهنده ثبت حساب SIP را نپذیرفت. تنظیمات حساب و دامنه را بررسی کنید.';
