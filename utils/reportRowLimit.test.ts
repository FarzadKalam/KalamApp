// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {fetchReportRowsByPage,isValidReportRowLimit,normalizeReportRowLimit} from './reportRowLimit';
describe('report row capacity',()=>{
 it('preserves 1000 and 5000 including localized digits across normalization',()=>{
  for(const [value,expected] of [[1000,1000],[5000,5000],['۱۰۰۰',1000],['۵٬۰۰۰',5000],['٥٠٠٠',5000]]){expect(isValidReportRowLimit(value)).toBe(true);expect(normalizeReportRowLimit(normalizeReportRowLimit(value))).toBe(expected);}
  expect(normalizeReportRowLimit(1000)).toBe(1000);expect(normalizeReportRowLimit(5000)).toBe(5000);
  for(const value of [null,'',19,5001,20.5,'abc'])expect(isValidReportRowLimit(value)).toBe(false);
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
});
