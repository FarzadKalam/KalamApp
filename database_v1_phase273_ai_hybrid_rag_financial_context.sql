-- TazeSystem V1 Phase 273
-- Hybrid organization knowledge retrieval and permission-gated financial context for AI.

begin;

alter table public.document_chunks
  add column if not exists fts tsvector
  generated always as (to_tsvector('simple'::regconfig, coalesce(content, ''))) stored;

create index if not exists idx_document_chunks_fts
  on public.document_chunks using gin (fts);

create or replace function public.match_ai_document_chunks_hybrid(
  p_org_id uuid,
  p_user_id uuid,
  p_role_id uuid,
  p_query_text text,
  p_query_embedding vector(1536),
  p_match_count integer default 6,
  p_match_threshold double precision default 0.52,
  p_full_text_weight double precision default 1,
  p_semantic_weight double precision default 1,
  p_rrf_k integer default 50
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  updated_at timestamptz,
  similarity double precision,
  hybrid_score double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select
      c.id,
      c.document_id,
      c.chunk_index,
      c.content,
      c.metadata,
      c.updated_at,
      c.embedding,
      c.fts
    from public.document_chunks c
    where c.org_id = p_org_id
      and c.status = 'active'
      and c.embedding_status = 'ready'
      and c.embedding is not null
      and (
        (
          coalesce(array_length(c.allowed_user_ids, 1), 0) = 0
          and coalesce(array_length(c.allowed_role_ids, 1), 0) = 0
        )
        or p_user_id = any(c.allowed_user_ids)
        or p_role_id = any(c.allowed_role_ids)
      )
  ),
  full_text as (
    select
      v.id,
      row_number() over (
        order by ts_rank_cd(v.fts, websearch_to_tsquery('simple'::regconfig, p_query_text)) desc
      ) as rank_ix
    from visible v
    where nullif(btrim(coalesce(p_query_text, '')), '') is not null
      and v.fts @@ websearch_to_tsquery('simple'::regconfig, p_query_text)
    order by ts_rank_cd(v.fts, websearch_to_tsquery('simple'::regconfig, p_query_text)) desc
    limit greatest(1, least(coalesce(p_match_count, 6), 20)) * 2
  ),
  semantic as (
    select
      v.id,
      1 - (v.embedding <=> p_query_embedding) as similarity,
      row_number() over (order by v.embedding <=> p_query_embedding) as rank_ix
    from visible v
    where 1 - (v.embedding <=> p_query_embedding)
      >= greatest(-1, least(1, coalesce(p_match_threshold, 0.52)))
    order by v.embedding <=> p_query_embedding
    limit greatest(1, least(coalesce(p_match_count, 6), 20)) * 2
  ),
  ranked as (
    select
      coalesce(f.id, s.id) as id,
      s.similarity,
      (
        coalesce(1.0 / (greatest(1, coalesce(p_rrf_k, 50)) + f.rank_ix), 0.0)
          * greatest(0, coalesce(p_full_text_weight, 1))
        +
        coalesce(1.0 / (greatest(1, coalesce(p_rrf_k, 50)) + s.rank_ix), 0.0)
          * greatest(0, coalesce(p_semantic_weight, 1))
      )::double precision as hybrid_score
    from full_text f
    full outer join semantic s on s.id = f.id
  )
  select
    v.id,
    v.document_id,
    v.chunk_index,
    v.content,
    v.metadata,
    v.updated_at,
    coalesce(r.similarity, 0)::double precision as similarity,
    r.hybrid_score
  from ranked r
  join visible v on v.id = r.id
  order by r.hybrid_score desc, coalesce(r.similarity, 0) desc
  limit greatest(1, least(coalesce(p_match_count, 6), 20));
$$;

revoke all on function public.match_ai_document_chunks_hybrid(
  uuid, uuid, uuid, text, vector, integer, double precision, double precision, double precision, integer
) from public;
revoke all on function public.match_ai_document_chunks_hybrid(
  uuid, uuid, uuid, text, vector, integer, double precision, double precision, double precision, integer
) from authenticated;
grant execute on function public.match_ai_document_chunks_hybrid(
  uuid, uuid, uuid, text, vector, integer, double precision, double precision, double precision, integer
) to service_role;

create index if not exists idx_journal_entries_org_posted_date
  on public.journal_entries(org_id, entry_date, id)
  where status = 'posted';

create or replace function public.get_ai_financial_snapshot(
  p_org_id uuid,
  p_date_from date,
  p_date_to date,
  p_include_accounting boolean default false,
  p_include_sales boolean default false,
  p_include_purchases boolean default false,
  p_include_expenses boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with accounting_lines as (
    select
      je.id as entry_id,
      jl.id as line_id,
      coa.id as account_id,
      coa.code as account_code,
      coa.name as account_name,
      coa.account_type,
      coalesce(jl.debit, 0)::numeric as debit,
      coalesce(jl.credit, 0)::numeric as credit
    from public.journal_entries je
    join public.journal_lines jl on jl.entry_id = je.id
    join public.chart_of_accounts coa
      on coa.id = jl.account_id
      and coa.org_id = p_org_id
    where je.org_id = p_org_id
      and p_include_accounting
      and je.status = 'posted'
      and je.entry_date between p_date_from and p_date_to
      and coa.account_type in ('income', 'expense')
  ),
  account_totals as (
    select
      account_id,
      account_code,
      account_name,
      account_type,
      sum(debit)::numeric as debit,
      sum(credit)::numeric as credit,
      case
        when account_type = 'income' then sum(credit - debit)
        else sum(debit - credit)
      end::numeric as amount,
      count(*)::integer as line_count
    from accounting_lines
    group by account_id, account_code, account_name, account_type
  ),
  accounting_summary as (
    select
      coalesce(sum(amount) filter (where account_type = 'income'), 0)::numeric as income_total,
      coalesce(sum(amount) filter (where account_type = 'expense'), 0)::numeric as expense_total,
      coalesce(sum(line_count), 0)::integer as line_count
    from account_totals
  ),
  sales_summary as (
    select
      count(*)::integer as record_count,
      coalesce(sum(total_invoice_amount), 0)::numeric as total
    from public.invoices
    where p_include_sales
      and org_id = p_org_id
      and invoice_date between p_date_from and p_date_to
      and status in ('confirmed', 'final', 'prepayment', 'settled', 'completed')
  ),
  purchase_summary as (
    select
      count(*)::integer as record_count,
      coalesce(sum(total_invoice_amount), 0)::numeric as total
    from public.purchase_invoices
    where p_include_purchases
      and org_id = p_org_id
      and invoice_date between p_date_from and p_date_to
      and status in ('final', 'settled', 'completed')
  ),
  expense_summary as (
    select
      count(*)::integer as record_count,
      coalesce(sum(total_amount), 0)::numeric as total
    from public.expense_documents
    where p_include_expenses
      and org_id = p_org_id
      and expense_date between p_date_from and p_date_to
      and status in ('approved', 'paid', 'posted')
  )
  select jsonb_build_object(
    'kind', 'financial_snapshot',
    'date_from', p_date_from,
    'date_to', p_date_to,
    'accounting', jsonb_build_object(
      'basis', 'posted_journal_entries',
      'available', (select line_count > 0 from accounting_summary),
      'income_total', (select income_total from accounting_summary),
      'expense_total', (select expense_total from accounting_summary),
      'net_profit', (
        select income_total - expense_total
        from accounting_summary
      ),
      'posted_entry_count', (
        select count(distinct entry_id)::integer
        from accounting_lines
      ),
      'line_count', (select line_count from accounting_summary),
      'unposted_entry_count', (
        select case when p_include_accounting then count(*)::integer else 0 end
        from public.journal_entries je
        where p_include_accounting
          and je.org_id = p_org_id
          and je.entry_date between p_date_from and p_date_to
          and je.status <> 'posted'
      ),
      'top_income_accounts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'account_code', q.account_code,
          'account_name', q.account_name,
          'amount', q.amount,
          'line_count', q.line_count
        ) order by abs(q.amount) desc)
        from (
          select account_code, account_name, amount, line_count
          from account_totals
          where account_type = 'income' and amount <> 0
          order by abs(amount) desc
          limit 10
        ) q
      ), '[]'::jsonb),
      'top_expense_accounts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'account_code', q.account_code,
          'account_name', q.account_name,
          'amount', q.amount,
          'line_count', q.line_count
        ) order by abs(q.amount) desc)
        from (
          select account_code, account_name, amount, line_count
          from account_totals
          where account_type = 'expense' and amount <> 0
          order by abs(amount) desc
          limit 10
        ) q
      ), '[]'::jsonb)
    ),
    'operational', jsonb_build_object(
      'basis', 'finalized_operational_records',
      'approximate', true,
      'sales', case when p_include_sales then (
        select jsonb_build_object('record_count', record_count, 'total', total)
        from sales_summary
      ) else null end,
      'purchases', case when p_include_purchases then (
        select jsonb_build_object('record_count', record_count, 'total', total)
        from purchase_summary
      ) else null end,
      'expenses', case when p_include_expenses then (
        select jsonb_build_object('record_count', record_count, 'total', total)
        from expense_summary
      ) else null end
    )
  );
$$;

revoke all on function public.get_ai_financial_snapshot(
  uuid, date, date, boolean, boolean, boolean, boolean
) from public;
revoke all on function public.get_ai_financial_snapshot(
  uuid, date, date, boolean, boolean, boolean, boolean
) from authenticated;
grant execute on function public.get_ai_financial_snapshot(
  uuid, date, date, boolean, boolean, boolean, boolean
) to service_role;

notify pgrst, 'reload schema';

commit;
