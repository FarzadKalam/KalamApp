set role authenticated;
select set_config('test.org','10000000-0000-4000-8000-000000000001',false);
select set_config('test.permissions','{"customers":{"view":true},"invoices":{"view":true}}',false);
do $$declare result jsonb;begin
 result:=public.read_call_contact_history('customers','40000000-0000-4000-8000-000000000001','invoices',0);
 if (result->>'count')::int<>21 or jsonb_array_length(result->'rows')<>20 or not (result->>'hasMore')::boolean then raise exception 'page treated as complete history';end if;
 if result->'rows'->0->>'name'<>'فاکتور 21' then raise exception 'newest activity ordering failed';end if;
 if (result->'summary'->>'settled')::int<>1 or (result->'summary'->>'completedAndSettled')::int<>1 then raise exception 'invoice summary includes wrong tenant/deleted rows';end if;
 if exists(select 1 from jsonb_array_elements(result->'rows')r where r->>'name'='نباید دیده شود')then raise exception 'foreign invoice leaked';end if;
 result:=public.read_call_contact_history('customers','40000000-0000-4000-8000-000000000001','invoices',20);
 if jsonb_array_length(result->'rows')<>1 or (result->>'hasMore')::boolean then raise exception 'older page unavailable';end if;
 perform set_config('test.permissions','{"customers":{"view":true},"invoices":{"view":true,"fields":{"remaining_balance":false,"payments":false}}}',true);
 result:=public.read_call_contact_history('customers','40000000-0000-4000-8000-000000000001','invoices',0);
 if result->'rows'->0?'remaining_balance' or result->'rows'->0?'payments' or result->'summary'<>'null'::jsonb then raise exception 'field restrictions leaked through summary';end if;
 perform set_config('test.org','',true);
 begin
  perform public.read_call_contact_history('customers','40000000-0000-4000-8000-000000000001','invoices',0);
  raise exception 'null tenant accepted';
 exception when others then if sqlerrm<>'contact_scope_required' then raise;end if;end;
end$$;
reset role;
