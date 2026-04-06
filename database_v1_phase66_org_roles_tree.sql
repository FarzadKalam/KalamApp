alter table public.org_roles
  add column if not exists parent_id uuid references public.org_roles(id) on delete set null,
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_org_roles_org_parent_sort
  on public.org_roles (org_id, parent_id, sort_order, created_at);

create or replace function public.prevent_org_role_cycle()
returns trigger
language plpgsql
as $$
declare
  v_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'org_roles.parent_id cannot reference itself';
  end if;

  v_parent_id := new.parent_id;
  while v_parent_id is not null loop
    if v_parent_id = new.id then
      raise exception 'org_roles tree cycle detected';
    end if;

    select parent_id
      into v_parent_id
    from public.org_roles
    where id = v_parent_id;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_prevent_org_role_cycle on public.org_roles;
create trigger trg_prevent_org_role_cycle
before insert or update of parent_id on public.org_roles
for each row
execute function public.prevent_org_role_cycle();
