-- Phase 548: close legacy cross-tenant table reads and prepare a private
-- organization-scoped bucket. Existing images are deliberately left in place;
-- moving their bytes and rewriting stored URLs must be verified separately.
begin;

drop policy if exists "Public Access Product Images" on public.product_images;
drop policy if exists "authenticated read seniority rates" on public.seniority_annual_rates;

-- A public SELECT policy disclosed the entire collection of active short links.
-- Resolve only the requested code through a narrowly scoped function instead.
drop policy if exists p_short_links_public_select on public.short_links;
revoke select on public.short_links from anon;

create or replace function public.resolve_shared_short_link(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_link public.short_links%rowtype;
  v_target text;
begin
  if p_code is null or length(p_code) < 4 or length(p_code) > 32 then
    return null;
  end if;
  select * into v_link from public.short_links
  where code = p_code and is_active = true
    and (expires_at is null or expires_at > now())
  limit 1;
  if not found then return null; end if;

  v_target := nullif(v_link.target_url, '');
  if v_target is null and v_link.target_asset_id is not null then
    select target_url into v_target from public.file_assets
    where id = v_link.target_asset_id and org_id = v_link.org_id;
  end if;
  if v_target is null and v_link.target_entry_id is not null then
    select a.target_url into v_target
    from public.file_entries e
    join public.file_assets a on a.id = e.asset_id and a.org_id = e.org_id
    where e.id = v_link.target_entry_id and e.org_id = v_link.org_id;
  end if;
  if v_target is null then return null; end if;
  return jsonb_build_object(
    'link_type', v_link.link_type,
    'target_url', v_target,
    'metadata', v_link.metadata
  );
end;
$$;
revoke all on function public.resolve_shared_short_link(text) from public, anon, authenticated;
grant execute on function public.resolve_shared_short_link(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('tenant-private', 'tenant-private', false, 524288000)
on conflict (id) do update
  set public = false,
      file_size_limit = 524288000;

-- Keep the existing images policies until public form uploads and legacy URLs
-- have an authenticated/private replacement. Changing them here would break
-- anonymous uploads and files already shared by KalamApp users.

commit;
