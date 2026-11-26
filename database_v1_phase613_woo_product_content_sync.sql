begin;

alter table public.external_record_links
  add column if not exists product_content_sync jsonb,
  add column if not exists product_content_operation uuid,
  add column if not exists product_content_operation_until timestamptz;

alter table public.external_sync_history
  add column if not exists local_record_id uuid;

create index if not exists external_sync_history_product_idx
  on public.external_sync_history (org_id, local_record_id, started_at desc, id desc)
  where module_key = 'products' and local_record_id is not null;

create or replace function public.touch_product_site_content_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.touch_product_site_content_updated_at() from public, anon, authenticated;

drop trigger if exists product_site_content_updated_at on public.product_site_content;
create trigger product_site_content_updated_at
before insert or update on public.product_site_content
for each row execute function public.touch_product_site_content_updated_at();

drop policy if exists product_site_content_field_access on public.product_site_content;
create policy product_site_content_field_access on public.product_site_content
as restrictive for all to authenticated
using (org_id = public.current_org_id() and public.current_user_can_module_field('products', 'view', 'product_site_content'))
with check (org_id = public.current_org_id() and public.current_user_can_module_field('products', 'edit', 'product_site_content'));

drop policy if exists product_site_content_field_delete on public.product_site_content;
create policy product_site_content_field_delete on public.product_site_content
as restrictive for delete to authenticated
using (org_id = public.current_org_id() and public.current_user_can_module_field('products', 'edit', 'product_site_content'));

alter table public.product_site_content drop constraint if exists product_site_content_slug_format;
alter table public.product_site_content add constraint product_site_content_slug_format
  check (slug = '' or slug ~ '^([a-z0-9]|%[a-f0-9]{2})+(-([a-z0-9]|%[a-f0-9]{2})+)*$');

notify pgrst, 'reload schema';
commit;
