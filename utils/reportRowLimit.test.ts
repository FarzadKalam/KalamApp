// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {fetchReportRowsByPage,isValidReportRowLimit,normalizeReportRowLimit,createReportDataBudget,createReportWorkScheduler} from './reportRowLimit';
import {buildReportTableRowCombinations} from './reporting';
describe('report row capacity',()=>{
 it('preserves 1000 and 5000 including localized digits across normalization',()=>{
  for(const [value,expected] of [[1000,1000],[5000,5000],[5001,5001],[100000,100000],['۱۰۰٬۰۰۰',100000],['١٠٠٠٠٠',100000],['۱۰۰۰',1000],['۵٬۰۰۰',5000],['٥٠٠٠',5000]]){expect(isValidReportRowLimit(value)).toBe(true);expect(normalizeReportRowLimit(normalizeReportRowLimit(value))).toBe(expected);}
  expect(normalizeReportRowLimit(1000)).toBe(1000);expect(normalizeReportRowLimit(5000)).toBe(5000);
  for(const value of [null,'',19,100001,Infinity,20.5,'abc'])expect(isValidReportRowLimit(value)).toBe(false);
 });
 it('reads 5000 rows in bounded pages instead of a single API request',async()=>{
  const source=Array.from({length:6000},(_,i)=>({id:i}));const read=vi.fn(async(start:number,end:number)=>({data:source.slice(start,end+1),error:null}));
  const rows=await fetchReportRowsByPage(5000,read);expect(rows).toHaveLength(5000);expect(rows.at(-1)).toEqual({id:4999});expect(read).toHaveBeenCalledTimes(20);expect(read.mock.calls.every(([start,end])=>end-start<250)).toBe(true);
 });
 it('continues when a server returns shorter pages and never returns partial success on failure',async()=>{
  const source=Array.from({length:700},(_,i)=>i);const read=vi.fn(async(start:number)=>({data:source.slice(start,start+100),error:null}));
  expect(await fetchReportRowsByPage(1000,read)).toEqual(source);
  let calls=0;await expect(fetchReportRowsByPage(1000,async()=>++calls===1?{data:[1,2],error:null}:{data:null,error:new Error('read failed')})).rejects.toThrow('read failed');
 });
 it.each(['tasks','invoices'])('loads 100000 %s records without omissions or oversized requests',async(moduleId)=>{
  const source=Array.from({length:100000},(_,id)=>({id,name:`${moduleId} ${id}`,invoiceItems:moduleId==='invoices'?[{quantity:2,price:1000},{quantity:1,price:500}]:undefined}));
  const read=vi.fn(async(start:number,end:number)=>({data:source.slice(start,end+1),error:null}));
  const rows=await fetchReportRowsByPage(100000,read);
  expect(rows).toHaveLength(100000);expect(new Set(rows.map(row=>row.id)).size).toBe(100000);
  expect(rows.at(-1)?.id).toBe(99999);expect(read).toHaveBeenCalledTimes(400);
  expect(read.mock.calls.every(([start,end])=>end-start===249)).toBe(true);
 });
 it('rejects a wide payload without returning partial success',async()=>{
  let call=0;
  await expect(fetchReportRowsByPage(100000,async()=>({data:[{value:++call===1?'small':'س'.repeat(100)}],error:null}),{budget:createReportDataBudget(80)})).rejects.toThrow('report_data_size_exceeded');
  expect(call).toBe(2);
 });
 it('rejects cartesian expansion before allocating a million combinations',()=>{
  expect(()=>buildReportTableRowCombinations([{blockId:'a',rows:Array(1001).fill({})},{blockId:'b',rows:Array(1000).fill({})}])).toThrow('report_expanded_row_limit_exceeded');
 });
 it('yields to the browser and enforces the combined expansion budget across parent records',async()=>{
  vi.useFakeTimers();
  try {
   const work=createReportWorkScheduler();
   for(let i=1;i<=100000;i++){
    const result=work();if(i%250===0)await vi.runAllTimersAsync();await result;
   }
   await expect(work()).rejects.toThrow('report_expanded_row_limit_exceeded');
  } finally {vi.useRealTimers();}
 });
});
