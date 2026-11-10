set test.user_id='90000000-0000-4000-8000-000000000001';
set role authenticated;
-- Host-bound context wins over a forged header, preserving page/totals filters.
set request.headers='{"origin":"https://one.example.test","x-organization-id":"10000000-0000-4000-8000-000000000002"}';
do $$ declare t jsonb; p jsonb; begin
 if current_org_id()<>'10000000-0000-4000-8000-000000000001' then raise exception 'Host binding lost'; end if;
 t:=get_cash_bank_unified_ledger_totals('{"description_query":"match","date_from":"2026-10-01"}');
 p:=get_cash_bank_unified_ledger_page(1,20,'date','desc','{"description_query":"match","date_from":"2026-10-01"}');
 if (t->>'receiptTotal')::numeric<>300.30 or (t->>'paymentTotal')::numeric<>126 or (p->>'total')::int<>4
 then raise exception 'Optimized page/totals diverged'; end if;
end $$;
set request.headers='{"origin":"https://two.example.test"}';
do $$ begin
 if (get_cash_bank_unified_ledger_page(1,20,'date','desc','{}')->>'total')::int<>1
 or (get_cash_bank_unified_ledger_totals('{}')->>'receiptTotal')::numeric<>9000 then raise exception 'Other tenant report incorrect'; end if;
end $$;
set request.headers='{"origin":"https://app.tazesystem.ir","x-client-info":"supabase-js; org=10000000-0000-4000-8000-000000000001"}';
do $$ begin if current_org_id()<>'10000000-0000-4000-8000-000000000001' then raise exception 'Shared selected context lost'; end if; end $$;
set request.headers='{"origin":"https://app.tazesystem.ir"}';
do $$ begin if current_org_id() is not null or exists(select 1 from cash_bank_unified_ledger) then raise exception 'Shared host inherited another tab'; end if; end $$;
set request.headers='{"origin":"https://unknown.example.test","x-organization-id":"10000000-0000-4000-8000-000000000001"}';
do $$ begin if current_org_id() is not null then raise exception 'Unknown host accepted'; end if; end $$;
set request.headers='{"origin":"http://localhost:5173","x-organization-id":"invalid"}';
do $$ begin if current_org_id() is not null then raise exception 'Invalid context accepted'; end if; end $$;
set request.headers='{}';
do $$ begin if current_org_id()<>'10000000-0000-4000-8000-000000000001' then raise exception 'Trusted server compatibility lost'; end if; end $$;
set request.headers='broken-json';
do $$ begin if current_org_id() is not null then raise exception 'Malformed headers accepted'; end if; end $$;
reset role;
update user_organization_memberships set is_active=false where org_id='10000000-0000-4000-8000-000000000002';
set request.headers='{"origin":"https://two.example.test"}';
set role authenticated;
do $$ begin if current_org_id() is not null or (get_cash_bank_unified_ledger_page(1,20,'date','desc','{}')->>'total')::int<>0 then raise exception 'Inactive membership exposed records'; end if; end $$;
reset role;
update organizations set is_active=false where id='10000000-0000-4000-8000-000000000001';
set request.headers='{"origin":"https://one.example.test"}';
set role authenticated;
do $$ begin if current_org_id() is not null then raise exception 'Inactive organization accepted'; end if; end $$;
reset role;
update organizations set is_active=true;
-- Internal routing requires a unique non-provider admin organization.
update saas_org_settings set resolved_host=null;
insert into company_settings select id from organizations;
insert into org_roles select id,'{"__saas_admin":{"view":true}}' from organizations;
set request.headers='{"origin":"https://kalam.tazesystem.ir"}';
set role authenticated;
do $$ begin if current_org_id() is not null then raise exception 'Ambiguous internal routing accepted'; end if; end $$;
reset role;
update saas_org_settings set is_billing_provider=true where org_id='10000000-0000-4000-8000-000000000002';
set role authenticated;
do $$ begin if current_org_id()<>'10000000-0000-4000-8000-000000000001' then raise exception 'Internal/provider isolation lost'; end if; end $$;
set test.user_id='';
do $$ begin if current_org_id() is not null or exists(select 1 from cash_bank_unified_ledger) then raise exception 'Unauthenticated report exposed'; end if; end $$;
reset role;
