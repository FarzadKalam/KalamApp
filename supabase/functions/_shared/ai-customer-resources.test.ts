import {describe,it,expect,vi} from 'vitest';
import {readSelectedCustomerKnowledge,type CustomerResourceReader} from './ai-customer-resources';
import {normalizeCustomerChannelPolicy} from './ai-customer-channel-policy';
const id='10000000-0000-4000-8000-000000000001';
describe('explicit customer knowledge sources',()=>{
  const reader=():CustomerResourceReader=>({orgId:'org',canReadInstructions:true,canReadKnowledge:true,canReadRow:()=>true,read:vi.fn(async()=>[])});
  it('does not query organization knowledge when selection is empty',async()=>{
    const r=reader();expect(await readSelectedCustomerKnowledge(r,normalizeCustomerChannelPolicy({},[]),'قیمت')).toEqual([]);expect(r.read).not.toHaveBeenCalled();
  });
  it('applies selected source IDs before limiting chunks and discards unselected output',async()=>{
    const r=reader();vi.mocked(r.read).mockImplementation(async(table)=>table==='org_documents'?[{id}]:[
      {id:'selected',document_id:id,content:'قیمت معتبر'}, {id:'leak',document_id:'other',content:'قیمت خصوصی'}]);
    const rows=await readSelectedCustomerKnowledge(r,normalizeCustomerChannelPolicy({documentIds:[id]},[]),'قیمت');
    expect(rows.map(r=>r.id)).toEqual(['selected']);
    expect(r.read).toHaveBeenLastCalledWith('document_chunks',expect.objectContaining({org_id:'eq.org',or:`(document_id.in.(${id}))`}));
  });
  it('does not use stale indexed chunks for a removed or hidden parent source',async()=>{
    const r=reader();r.canReadRow=()=>false;vi.mocked(r.read).mockResolvedValue([{id}]);
    expect(await readSelectedCustomerKnowledge(r,normalizeCustomerChannelPolicy({documentIds:[id]},[]),'')).toEqual([]);
    expect(r.read).toHaveBeenCalledTimes(1);
  });
});


