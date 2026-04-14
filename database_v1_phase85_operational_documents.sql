-- KalamApp V1 - Phase 85
-- Secretariat, delivery forms, upgraded stock transfer vouchers, and purchase invoice estimate field.

begin;

alter table if exists public.purchase_invoices
  add column if not exists estimated_invoice_amount numeric(18,2) not null default 0;

create table if not exists public.secretariat_documents (
  id uuid primary key default gen_random_uuid()
);

alter table public.secretariat_documents
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists document_type text not null default 'letter',
  add column if not exists direction text not null default 'internal',
  add column if not exists status text not null default 'draft',
  add column if not exists priority text not null default 'normal',
  add column if not exists confidentiality text not null default 'normal',
  add column if not exists document_date date not null default current_date,
  add column if not exists registered_at timestamptz,
  add column if not exists due_at timestamptz,
  add column if not exists external_number text,
  add column if not exists indicator_number text,
  add column if not exists sender_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists recipient_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists related_document_id uuid references public.secretariat_documents(id) on delete set null,
  add column if not exists related_module_id text,
  add column if not exists related_record_id uuid,
  add column if not exists body text,
  add column if not exists summary text,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.delivery_forms (
  id uuid primary key default gen_random_uuid()
);

alter table public.delivery_forms
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists form_type text not null default 'goods_delivery',
  add column if not exists status text not null default 'draft',
  add column if not exists delivery_date date not null default current_date,
  add column if not exists delivered_by_id uuid references public.profiles(id) on delete set null,
  add column if not exists received_by_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists external_delivered_by text,
  add column if not exists external_received_by text,
  add column if not exists location_text text,
  add column if not exists related_module_id text,
  add column if not exists related_record_id uuid,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.stock_transfers
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists status text not null default 'draft',
  add column if not exists transfer_date date not null default current_date,
  add column if not exists source_warehouse_id uuid references public.warehouses(id) on delete set null,
  add column if not exists target_warehouse_id uuid references public.warehouses(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists delivery_form_id uuid references public.delivery_forms(id) on delete set null,
  add column if not exists related_module_id text,
  add column if not exists related_record_id uuid,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists inventory_applied_at timestamptz,
  add column if not exists inventory_applied_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null then
    alter table public.secretariat_documents alter column org_id set default public.current_org_id();
    alter table public.delivery_forms alter column org_id set default public.current_org_id();
  end if;
end $$;

update public.secretariat_documents
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

update public.delivery_forms
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

do $$
begin
  if to_regclass('public.stock_transfers') is not null then
    update public.stock_transfers
    set assignee_type = case
      when assignee_role_id is not null then 'role'
      when assignee_id is not null then 'user'
      else nullif(assignee_type, '')
    end
    where assignee_role_id is not null
       or assignee_id is not null
       or coalesce(assignee_type, '') <> '';
  end if;
end $$;

alter table public.secretariat_documents
  drop constraint if exists chk_secretariat_documents_document_type,
  drop constraint if exists chk_secretariat_documents_direction,
  drop constraint if exists chk_secretariat_documents_status,
  drop constraint if exists chk_secretariat_documents_priority,
  drop constraint if exists chk_secretariat_documents_confidentiality,
  drop constraint if exists chk_secretariat_documents_assignee_type;

alter table public.secretariat_documents
  add constraint chk_secretariat_documents_document_type
    check (document_type in ('letter', 'incoming_letter', 'outgoing_letter', 'internal_notice', 'internal_request', 'directive', 'minutes')),
  add constraint chk_secretariat_documents_direction
    check (direction in ('incoming', 'outgoing', 'internal')),
  add constraint chk_secretariat_documents_status
    check (status in ('draft', 'registered', 'in_review', 'referred', 'answered', 'archived', 'canceled')),
  add constraint chk_secretariat_documents_priority
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add constraint chk_secretariat_documents_confidentiality
    check (confidentiality in ('normal', 'confidential', 'secret')),
  add constraint chk_secretariat_documents_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role'));

alter table public.delivery_forms
  drop constraint if exists chk_delivery_forms_form_type,
  drop constraint if exists chk_delivery_forms_status,
  drop constraint if exists chk_delivery_forms_assignee_type;

alter table public.delivery_forms
  add constraint chk_delivery_forms_form_type
    check (form_type in ('goods_delivery', 'goods_receipt', 'document_delivery', 'document_receipt', 'asset_delivery', 'other')),
  add constraint chk_delivery_forms_status
    check (status in ('draft', 'pending_signature', 'signed', 'confirmed', 'archived', 'canceled')),
  add constraint chk_delivery_forms_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role'));

alter table if exists public.stock_transfers
  drop constraint if exists chk_stock_transfers_status;

alter table if exists public.stock_transfers
  add constraint chk_stock_transfers_status
    check (status in ('draft', 'pending_approval', 'approved', 'issued', 'received', 'closed', 'canceled'));

do $$
begin
  if to_regclass('public.stock_transfers') is not null then
    alter table public.stock_transfers
      drop constraint if exists chk_stock_transfers_assignee_type;

    alter table public.stock_transfers
      add constraint chk_stock_transfers_assignee_type
      check (assignee_type is null or assignee_type in ('user', 'role'));
  end if;
end $$;

create unique index if not exists idx_secretariat_documents_org_system_code
  on public.secretariat_documents(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_secretariat_documents_org_date
  on public.secretariat_documents(org_id, document_date desc);

create index if not exists idx_secretariat_documents_assignee
  on public.secretariat_documents(assignee_id, due_at desc)
  where assignee_id is not null;

create index if not exists idx_secretariat_documents_assignee_scope
  on public.secretariat_documents(assignee_id, assignee_role_id);

create index if not exists idx_secretariat_documents_related_record
  on public.secretariat_documents(related_module_id, related_record_id)
  where related_module_id is not null and related_record_id is not null;

create unique index if not exists idx_delivery_forms_org_system_code
  on public.delivery_forms(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_delivery_forms_org_date
  on public.delivery_forms(org_id, delivery_date desc);

create index if not exists idx_delivery_forms_assignee_scope
  on public.delivery_forms(assignee_id, assignee_role_id);

create index if not exists idx_delivery_forms_related_record
  on public.delivery_forms(related_module_id, related_record_id)
  where related_module_id is not null and related_record_id is not null;

do $$
begin
  if to_regclass('public.stock_transfers') is not null then
    execute $sql$
      create unique index if not exists idx_stock_transfers_org_system_code
        on public.stock_transfers(org_id, system_code)
        where system_code is not null and system_code <> ''
    $sql$;

    execute $sql$
      create index if not exists idx_stock_transfers_org_date
        on public.stock_transfers(org_id, transfer_date desc, created_at desc)
    $sql$;

    execute $sql$
      create index if not exists idx_stock_transfers_status
        on public.stock_transfers(status, transfer_date desc)
    $sql$;

    execute $sql$
      create index if not exists idx_stock_transfers_delivery_form
        on public.stock_transfers(delivery_form_id)
        where delivery_form_id is not null
    $sql$;

    execute $sql$
      create index if not exists idx_stock_transfers_assignee_scope
        on public.stock_transfers(assignee_id, assignee_role_id)
    $sql$;

    execute $sql$
      create index if not exists idx_stock_transfers_related_record
        on public.stock_transfers(related_module_id, related_record_id)
        where related_module_id is not null and related_record_id is not null
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_secretariat_documents_updated_at on public.secretariat_documents;
    create trigger trg_secretariat_documents_updated_at
      before update on public.secretariat_documents
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_delivery_forms_updated_at on public.delivery_forms;
    create trigger trg_delivery_forms_updated_at
      before update on public.delivery_forms
      for each row execute function public.set_updated_at();

    if to_regclass('public.stock_transfers') is not null then
      drop trigger if exists trg_stock_transfers_updated_at on public.stock_transfers;
      create trigger trg_stock_transfers_updated_at
        before update on public.stock_transfers
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.secretariat_documents enable row level security;
alter table public.delivery_forms enable row level security;

drop policy if exists p_secretariat_documents_org_all on public.secretariat_documents;
create policy p_secretariat_documents_org_all on public.secretariat_documents
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  );

drop policy if exists p_delivery_forms_org_all on public.delivery_forms;
create policy p_delivery_forms_org_all on public.delivery_forms
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  );

grant select, insert, update, delete on public.secretariat_documents to authenticated;
grant select, insert, update, delete on public.delivery_forms to authenticated;
grant select, insert, update, delete on public.stock_transfers to authenticated;

notify pgrst, 'reload schema';

commit;
