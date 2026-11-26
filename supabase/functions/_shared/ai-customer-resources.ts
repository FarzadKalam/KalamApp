import type {CustomerChannelPolicy} from './ai-customer-channel-policy.ts';

export type CustomerResourceReader = {
  orgId: string;
  read: (table: string, query: Record<string,string>) => Promise<any[]>;
  canReadInstructions: boolean;
  canReadKnowledge: boolean;
  canReadRow: (row: any) => boolean;
};

/** Explicit IDs are applied at the data source, before ranking or a page limit.
 * An empty selection means no documents, never all organization documents. */
export async function readSelectedCustomerKnowledge(reader: CustomerResourceReader, policy: CustomerChannelPolicy, query: string) {
  if (!reader.orgId) throw new Error('سازمان جاری مشخص نیست.');
  const [documents, instructions] = await Promise.all([
    reader.canReadKnowledge && policy.documentIds.length ? reader.read('org_documents', {
      org_id:`eq.${reader.orgId}`,id:`in.(${policy.documentIds.join(',')})`,status:'eq.active',use_for_ai:'eq.true',
      select:'id,title,updated_at,allowed_user_ids,allowed_role_ids',
    }) : Promise.resolve([]),
    reader.canReadInstructions && policy.instructionIds.length ? reader.read('instructions', {
      org_id:`eq.${reader.orgId}`,id:`in.(${policy.instructionIds.join(',')})`,status:'in.(approved,published)',use_for_ai:'eq.true',
      select:'id,name,updated_at,visible_to_user_ids,visible_to_role_ids',
    }) : Promise.resolve([]),
  ]);
  const docIds=documents.filter(reader.canReadRow).map(r=>r.id);
  const instructionIds=instructions.filter(reader.canReadRow).map(r=>r.id);
  const sourceFilters=[docIds.length?`document_id.in.(${docIds.join(',')})`:'',
    instructionIds.length?`and(source_kind.eq.instruction,source_record_id.in.(${instructionIds.join(',')}))`:''].filter(Boolean);
  if(!sourceFilters.length)return [];
  const chunks=await reader.read('document_chunks',{
    org_id:`eq.${reader.orgId}`,status:'eq.active',or:`(${sourceFilters.join(',')})`,
    select:'id,document_id,source_kind,source_record_id,source_module_id,content,metadata,updated_at,allowed_user_ids,allowed_role_ids',
    // Bound a turn's context, not the contact's record history. Selection is already applied.
    limit:'120',order:'updated_at.desc,id.asc',
  });
  const tokens=[...new Set(String(query||'').toLocaleLowerCase().split(/[\s\p{P}]+/u).filter(t=>t.length>1))];
  return chunks.filter(reader.canReadRow).filter(row=>
    docIds.includes(row.document_id)||(row.source_kind==='instruction'&&instructionIds.includes(row.source_record_id)))
    .map(row=>({row,score:tokens.reduce((n,t)=>n+(String(row.content||'').toLocaleLowerCase().includes(t)?1:0),0)}))
    .sort((a,b)=>b.score-a.score||String(b.row.updated_at||'').localeCompare(String(a.row.updated_at||'')))
    .slice(0,6).map(({row})=>({...row,content:String(row.content||'').slice(0,2000)}));
}


