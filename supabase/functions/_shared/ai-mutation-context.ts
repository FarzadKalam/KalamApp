/** Candidate discovery is not a record export. Keep authoritative rows on the
 * server for approval/merging; the model reads full fields via scoped tools. */
export const summarizeMutationCandidates = (rows: any[]) => {
  const keys = ['id','system_code','name','title','full_name','business_name','status','customer_id','related_customer','invoice_date','created_at','updated_at','invoice_type'];
  return (rows || []).slice(0,20).map(row => ({
    ...Object.fromEntries(keys.filter(key => typeof row?.[key] === 'string' || typeof row?.[key] === 'number')
      .map(key => [key,typeof row[key] === 'string' ? row[key].slice(0,160) : row[key]])),
    detailSource: 'read_process_context: section=field; use record id and exact field name',
  }));
};

