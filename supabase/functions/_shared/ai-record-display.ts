/** Only pass already-authorized fields. Never substitute a technical id for a title. */
export const RECORD_CHOICE_GUIDANCE='در پرسش و تأیید انتخاب رکورد، نام یا عنوان انسانی را اصل قرار بده؛ کد سیستمی فقط کنار نام و هرگز به‌تنهایی نمایش داده شود. اگر عنوان در داده نیست، ابتدا آن را با ابزار مجاز بخوان. برای نام‌های مشابه، تاریخ، مبلغ و واحد پول و طرف حساب مجاز را برای تفکیک اضافه کن؛ UUID، شناسه داخلی یا کد تنها مثل p135 گزینه قابل فهم نیست. داده مخفی یا مبلغ و تاریخ حدسی نمایش نده.';
export const describeAiRecord=(row:Record<string,any>)=>{
 const safe=(v:any)=>typeof v==='string'&&!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(v)?v.trim():'';
 const title=['name','title','full_name','business_name','display_name'].map(k=>safe(row[k])).find(Boolean)||null;
 const code=safe(row.system_code)||null;
 const date=['invoice_date','purchase_date','date','created_at'].map(k=>safe(row[k])).find(Boolean)||null;
 const amount=['total_invoice_amount','total_amount','amount'].map(k=>row[k]).find(v=>v!=null&&Number.isFinite(Number(v)))??null;
 return {title,systemCode:code,date,amount,label:title?[title,code,date,amount!=null?String(amount):''].filter(Boolean).join(' · '):null,needsTitle:!title};
};
