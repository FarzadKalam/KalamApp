-- TazeSystem V1 Phase 286
-- Repair legacy tenant policies that still allow nullable org access paths.

begin;

do $$
begin
  if to_regclass('public.cash_bank_operations') is not null then
    alter table public.cash_bank_operations enable row level security;
    drop policy if exists p_cash_bank_operations_org_all on public.cash_bank_operations;
    create policy p_cash_bank_operations_org_all
    on public.cash_bank_operations
    for all
    to authenticated
    using (org_id = public.current_org_id())
    with check (org_id = public.current_org_id());
  end if;
end
$$;

do $$
begin
  if to_regclass('public.petty_funds') is not null then
    alter table public.petty_funds enable row level security;
    drop policy if exists p_petty_funds_org_all on public.petty_funds;
    create policy p_petty_funds_org_all
    on public.petty_funds
    for all
    to authenticated
    using (org_id = public.current_org_id())
    with check (org_id = public.current_org_id());
  end if;
end
$$;

do $$
begin
  if to_regclass('public.file_folders') is not null then
    alter table public.file_folders enable row level security;
    drop policy if exists p_file_folders_org_all on public.file_folders;
    create policy p_file_folders_org_all
    on public.file_folders
    for all
    to authenticated
    using (org_id = public.current_org_id())
    with check (org_id = public.current_org_id());
  end if;
end
$$;

do $$
begin
  if to_regclass('public.file_assets') is not null then
    alter table public.file_assets enable row level security;
    drop policy if exists p_file_assets_org_all on public.file_assets;
    create policy p_file_assets_org_all
    on public.file_assets
    for all
    to authenticated
    using (org_id = public.current_org_id())
    with check (org_id = public.current_org_id());
  end if;
end
$$;

do $$
begin
  if to_regclass('public.file_entries') is not null then
    alter table public.file_entries enable row level security;
    drop policy if exists p_file_entries_org_all on public.file_entries;
    create policy p_file_entries_org_all
    on public.file_entries
    for all
    to authenticated
    using (org_id = public.current_org_id())
    with check (org_id = public.current_org_id());
  end if;
end
$$;

do $$
begin
  if to_regclass('public.file_access_rules') is not null then
    alter table public.file_access_rules enable row level security;
    drop policy if exists p_file_access_rules_org_all on public.file_access_rules;
    create policy p_file_access_rules_org_all
    on public.file_access_rules
    for all
    to authenticated
    using (org_id = public.current_org_id())
    with check (org_id = public.current_org_id());
  end if;
end
$$;

do $$
begin
  if to_regclass('public.short_links') is not null then
    alter table public.short_links enable row level security;
    drop policy if exists p_short_links_auth_org_all on public.short_links;
    create policy p_short_links_auth_org_all
    on public.short_links
    for all
    to authenticated
    using (org_id = public.current_org_id())
    with check (org_id = public.current_org_id());
  end if;
end
$$;

commit;
