-- جمع ستون‌ها و ماندهٔ کارت حساب باید از یک دفتر گردش واحد به‌دست آید.
-- دریافت همیشه بستانکار و پرداخت همیشه بدهکار است؛ بنابراین مانده دقیقاً
-- برابر جمع بدهکار منهای جمع بستانکار خواهد بود.

begin;

do $$
begin
  if to_regprocedure('public.get_public_online_account_card_v426(text)') is null
     and to_regprocedure('public.get_public_online_account_card(text)') is not null then
    execute 'alter function public.get_public_online_account_card(text) rename to get_public_online_account_card_v426';
  end if;
end;
$$;

create or replace function public.get_public_online_account_card(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_summary jsonb := jsonb_build_object('total_debit', 0, 'total_credit', 0, 'final_balance', 0);
begin
  v_payload := public.get_public_online_account_card_v426(p_token);
  if coalesce(v_payload ->> 'error', '') <> '' then
    return v_payload;
  end if;

  with source_rows as (
    select value row_data
    from jsonb_array_elements(coalesce(v_payload -> 'rows', '[]'::jsonb))
  ), normalized_rows as (
    select
      row_data,
      coalesce(row_data ->> 'row_type', '') row_type,
      coalesce(nullif(row_data ->> 'date', '')::date, '9999-12-31'::date) sort_date,
      coalesce(row_data ->> 'key', '') row_key,
      case
        when row_data ->> 'row_type' = 'receipt' then 0::numeric
        when row_data ->> 'row_type' = 'payment' then abs(coalesce((row_data ->> 'debit')::numeric, 0)) + abs(coalesce((row_data ->> 'credit')::numeric, 0))
        else abs(coalesce((row_data ->> 'debit')::numeric, 0))
      end debit,
      case
        when row_data ->> 'row_type' = 'receipt' then abs(coalesce((row_data ->> 'debit')::numeric, 0)) + abs(coalesce((row_data ->> 'credit')::numeric, 0))
        when row_data ->> 'row_type' = 'payment' then 0::numeric
        else abs(coalesce((row_data ->> 'credit')::numeric, 0))
      end credit
    from source_rows
  ), ranked_rows as (
    select
      *,
      sum(debit - credit) over (
        order by (row_type = 'opening') desc, sort_date, row_key
        rows between unbounded preceding and current row
      ) balance
    from normalized_rows
  )
  select
    coalesce(
      jsonb_agg(
        row_data || jsonb_build_object('debit', debit, 'credit', credit, 'balance', balance)
        order by (row_type = 'opening') desc, sort_date, row_key
      ),
      '[]'::jsonb
    ),
    jsonb_build_object(
      'total_debit', coalesce(sum(debit), 0),
      'total_credit', coalesce(sum(credit), 0),
      'final_balance', coalesce(sum(debit - credit), 0),
      'source', 'operational_ledger'
    )
  into v_rows, v_summary
  from ranked_rows;

  return jsonb_set(
    jsonb_set(v_payload, '{rows}', v_rows, true),
    '{summary}', v_summary,
    true
  );
end;
$$;

revoke all on function public.get_public_online_account_card_v426(text) from public, authenticated;
revoke all on function public.get_public_online_account_card(text) from public, authenticated;
grant execute on function public.get_public_online_account_card(text) to anon;

commit;
