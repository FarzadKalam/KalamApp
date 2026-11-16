import {digitsToEnglish} from './persianSearchText';
export const REPORT_ROW_LIMIT_MIN=20;
// Keep ordinary reports aligned with report-runtime's existing execution capacity.
export const REPORT_ROW_LIMIT_MAX=100_000;
export const REPORT_MAX_SOURCE_BYTES=64*1024*1024;
export const REPORT_PAGE_SIZE=250;
export const REPORT_CHART_MAX_GROUPS=500;
export const parseReportRowLimit=(value:unknown)=>{
 const text=digitsToEnglish(value).replace(/[٬,]/g,'').trim();
 return /^\d+$/.test(text)?Number(text):NaN;
};
export const isValidReportRowLimit=(value:unknown)=>{const n=parseReportRowLimit(value);return Number.isSafeInteger(n)&&n>=REPORT_ROW_LIMIT_MIN&&n<=REPORT_ROW_LIMIT_MAX;};
export const normalizeReportRowLimit=(value:unknown)=>{
 const n=parseReportRowLimit(value);return Number.isFinite(n)?Math.min(REPORT_ROW_LIMIT_MAX,Math.max(REPORT_ROW_LIMIT_MIN,n)):200;
};
export const createReportDataBudget=(maxBytes=REPORT_MAX_SOURCE_BYTES)=>{
 let used=0;
 const encoder=new TextEncoder();
 return {add(value:unknown){
  used+=encoder.encode(JSON.stringify(value)??'').byteLength;
  if(used>maxBytes)throw new Error('report_data_size_exceeded');
 }};
};
/** Stable query order belongs to the caller. Never return partial data on error. */
export const fetchReportRowsByPage=async <T>(limit:number,read:(start:number,end:number)=>PromiseLike<{data:T[]|null;error:any}>,options:{budget?:ReturnType<typeof createReportDataBudget>}={})=>{
 if(!isValidReportRowLimit(limit))throw new Error('invalid_report_row_limit');
 const budget=options.budget||createReportDataBudget();
 const rows:T[]=[];
 while(rows.length<limit){
  const result=await read(rows.length,Math.min(limit,rows.length+REPORT_PAGE_SIZE)-1);
  if(result.error)throw result.error;
  const page=result.data||[];
  if(!page.length)break;
  const selected=page.slice(0,limit-rows.length);
  budget.add(selected);
  rows.push(...selected);
 }
 return rows;
};
/** Prevent a long chain of field/condition promises from starving browser rendering. */
export const createReportWorkScheduler=()=>{
 let count=0;
 return async()=>{
  if(++count>REPORT_ROW_LIMIT_MAX)throw new Error('report_expanded_row_limit_exceeded');
  if(count%REPORT_PAGE_SIZE===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
 };
};
