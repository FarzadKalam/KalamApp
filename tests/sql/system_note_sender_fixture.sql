-- Isolated CI database only, after the recipient guard regression suite.
create table public.chat_groups(id uuid primary key, org_id uuid, user_ids uuid[], role_ids uuid[]);
alter table public.notification_inbox_items add column is_org_wide boolean default false;
create unique index fixture_inbox_source on public.notification_inbox_items(org_id,source_type,source_id);
create function public.kalam_distinct_uuid_array(uuid[]) returns uuid[] language sql immutable as $$ select coalesce(array_agg(distinct x) filter(where x is not null),'{}'::uuid[]) from unnest($1) x $$;
create function public.kalam_jsonb_uuid_array(jsonb) returns uuid[] language sql immutable as $$ select coalesce(array_agg(value::uuid),'{}'::uuid[]) from jsonb_array_elements_text(case when jsonb_typeof($1)='array' then $1 else '[]'::jsonb end) $$;
create function public.kalam_direct_conversation_key(uuid,uuid) returns text language sql immutable as $$ select 'direct:' || $1::text || ':' || $2::text $$;
create function public.kalam_upsert_notification_item(uuid,text,text,text,text,text,text,text,text,text,uuid[],uuid[],boolean,jsonb,timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 insert into public.notification_inbox_items(id,org_id,source_type,source_id,section,category,target_user_ids,target_role_ids,is_org_wide,last_event_at)
 values(gen_random_uuid(),$1,$2,$3,$4,$5,$11,$12,$13,$15)
 on conflict(org_id,source_type,source_id) do update set target_user_ids=excluded.target_user_ids,target_role_ids=excluded.target_role_ids,is_org_wide=excluded.is_org_wide
 returning id into result;
 return result;
end $$;
-- Reproduce the actual bug: actor A produces a workflow message for user B.
update public.notes set author_id='10000000-0000-0000-0000-000000000001'
 where id='40000000-0000-0000-0000-000000000004';
update public.notification_inbox_items set target_user_ids=array_append(target_user_ids,'10000000-0000-0000-0000-000000000001'::uuid),is_org_wide=true
 where source_id='40000000-0000-0000-0000-000000000004';
create table public.fixture_broadcast_count(total integer);
insert into public.fixture_broadcast_count values(0);
create function public.fixture_count_broadcast() returns trigger language plpgsql as $$
begin update public.fixture_broadcast_count set total=total+1; return new; end $$;
create trigger trg_notification_inbox_items_broadcast after update on public.notification_inbox_items
for each row execute function public.fixture_count_broadcast();
