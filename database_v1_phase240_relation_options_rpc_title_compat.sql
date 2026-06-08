-- TazeSystem V1 - Phase 240
-- Repair relation option RPCs that referenced optional title columns on modules
-- where title is not guaranteed to exist.

begin;

create or replace function public.search_relation_options_v1(
  p_target_module text,
  p_target_field text default null,
  p_search text default null,
  p_exact_ids uuid[] default null,
  p_limit integer default 50
)
returns table(value uuid, label text, search_text text)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_module text := trim(coalesce(p_target_module, ''));
  v_search text := trim(coalesce(p_search, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_like text := case when v_search = '' then null else '%' || v_search || '%' end;
begin
  if v_module = 'customers' then
    return query
    select
      c.id,
      trim(coalesce(nullif(c.full_name, ''), nullif(c.business_name, ''), nullif(c.legal_name, ''), nullif(c.system_code, ''), 'بدون نام')) as label,
      lower(trim(concat_ws(' ', c.full_name, c.business_name, c.legal_name, c.mobile_1, c.phone, c.system_code))) as search_text
    from public.customers c
    where c.org_id = public.current_org_id()
      and (p_exact_ids is null or c.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', c.full_name, c.business_name, c.legal_name, c.mobile_1, c.phone, c.system_code) ilike v_like)
    order by c.updated_at desc nulls last, c.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'projects' then
    return query
    select
      p.id,
      trim(coalesce(nullif(p.name, ''), nullif(p.system_code, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', p.name, p.system_code, p.status))) as search_text
    from public.projects p
    where p.org_id = public.current_org_id()
      and (p_exact_ids is null or p.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', p.name, p.system_code, p.status) ilike v_like)
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'products' then
    return query
    select
      p.id,
      trim(coalesce(nullif(p.name, ''), nullif(p.system_code, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', p.name, p.system_code, p.status))) as search_text
    from public.products p
    where p.org_id = public.current_org_id()
      and (p_exact_ids is null or p.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', p.name, p.system_code, p.status) ilike v_like)
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'suppliers' then
    return query
    select
      s.id,
      trim(coalesce(nullif(s.full_name, ''), nullif(s.business_name, ''), nullif(s.system_code, ''), 'بدون نام')) as label,
      lower(trim(concat_ws(' ', s.full_name, s.business_name, s.mobile_1, s.phone, s.system_code))) as search_text
    from public.suppliers s
    where s.org_id = public.current_org_id()
      and (p_exact_ids is null or s.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', s.full_name, s.business_name, s.mobile_1, s.phone, s.system_code) ilike v_like)
    order by s.updated_at desc nulls last, s.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'invoices' then
    return query
    select
      i.id,
      trim(coalesce(nullif(i.name, ''), nullif(i.system_code, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', i.name, i.system_code, i.status))) as search_text
    from public.invoices i
    where i.org_id = public.current_org_id()
      and (p_exact_ids is null or i.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', i.name, i.system_code, i.status) ilike v_like)
    order by i.updated_at desc nulls last, i.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'purchase_invoices' then
    return query
    select
      i.id,
      trim(coalesce(nullif(i.name, ''), nullif(i.system_code, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', i.name, i.system_code, i.status))) as search_text
    from public.purchase_invoices i
    where i.org_id = public.current_org_id()
      and (p_exact_ids is null or i.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', i.name, i.system_code, i.status) ilike v_like)
    order by i.updated_at desc nulls last, i.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'tasks' then
    return query
    select
      t.id,
      trim(coalesce(nullif(t.name, ''), nullif(t.system_code, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', t.name, t.system_code, t.status))) as search_text
    from public.tasks t
    where t.org_id = public.current_org_id()
      and (p_exact_ids is null or t.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', t.name, t.system_code, t.status) ilike v_like)
    order by t.updated_at desc nulls last, t.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'profiles' then
    return query
    select
      p.id,
      trim(coalesce(nullif(p.full_name, ''), nullif(p.email, ''), nullif(p.mobile_1, ''), 'کاربر بدون نام')) as label,
      lower(trim(concat_ws(' ', p.full_name, p.email, p.mobile_1))) as search_text
    from public.profiles p
    where p.org_id = public.current_org_id()
      and (p_exact_ids is null or p.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', p.full_name, p.email, p.mobile_1) ilike v_like)
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module in ('org_roles', 'roles') then
    return query
    select
      r.id,
      trim(coalesce(nullif(r.title, ''), 'بدون عنوان')) as label,
      lower(trim(coalesce(r.title, ''))) as search_text
    from public.org_roles r
    where r.org_id = public.current_org_id()
      and (p_exact_ids is null or r.id = any(p_exact_ids))
      and (v_like is null or r.title ilike v_like)
    order by r.sort_order asc nulls last, r.title asc
    limit v_limit;
    return;
  end if;

  if v_module = 'shelves' then
    return query
    select
      s.id,
      trim(coalesce(nullif(s.shelf_number, ''), nullif(s.name, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', s.shelf_number, s.name))) as search_text
    from public.shelves s
    where s.org_id = public.current_org_id()
      and (p_exact_ids is null or s.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', s.shelf_number, s.name) ilike v_like)
    order by s.updated_at desc nulls last, s.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  if v_module = 'process_templates' then
    return query
    select
      pt.id,
      trim(coalesce(nullif(pt.name, ''), 'بدون عنوان')) as label,
      lower(trim(concat_ws(' ', pt.name, pt.module_id, array_to_string(pt.module_ids, ' ')))) as search_text
    from public.process_templates pt
    where pt.org_id = public.current_org_id()
      and (p_exact_ids is null or pt.id = any(p_exact_ids))
      and (v_like is null or concat_ws(' ', pt.name, pt.module_id, array_to_string(pt.module_ids, ' ')) ilike v_like)
    order by pt.updated_at desc nulls last, pt.created_at desc nulls last
    limit v_limit;
    return;
  end if;

  return;
end;
$$;

revoke all on function public.search_relation_options_v1(text, text, text, uuid[], integer) from public;
grant execute on function public.search_relation_options_v1(text, text, text, uuid[], integer) to authenticated, service_role;

commit;
