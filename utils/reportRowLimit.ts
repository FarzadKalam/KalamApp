import {digitsToEnglish} from './persianSearchText';
export const REPORT_ROW_LIMIT_MIN=20;
export const REPORT_ROW_LIMIT_MAX=5000;
export const parseReportRowLimit=(value:unknown)=>{
 const text=digitsToEnglish(value).replace(/[٬,]/g,'').trim();
 return /^\d+$/.test(text)?Number(text):NaN;
};
export const isValidReportRowLimit=(value:unknown)=>{const n=parseReportRowLimit(value);return Number.isSafeInteger(n)&&n>=REPORT_ROW_LIMIT_MIN&&n<=REPORT_ROW_LIMIT_MAX;};
export const normalizeReportRowLimit=(value:unknown)=>{
 const n=parseReportRowLimit(value);return Number.isFinite(n)?Math.min(REPORT_ROW_LIMIT_MAX,Math.max(REPORT_ROW_LIMIT_MIN,n)):200;
};
/** Stable query order belongs to the caller. Never return partial data on error. */
export const fetchReportRowsByPage=async <T>(limit:number,read:(start:number,end:number)=>PromiseLike<{data:T[]|null;error:any}>)=>{
 const rows:T[]=[];
 while(rows.length<limit){
  const result=await read(rows.length,Math.min(limit,rows.length+250)-1);
  if(result.error)throw result.error;
  const page=result.data||[];
  if(!page.length)break;
  rows.push(...page.slice(0,limit-rows.length));
 }
 return rows;
};
