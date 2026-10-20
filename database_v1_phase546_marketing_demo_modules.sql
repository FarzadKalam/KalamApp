-- Phase 546: give marketing demo tenants the relevant modules and campaign channels.
begin;

create or replace function public.apply_marketing_demo_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_industry text;
begin
  if new.is_demo is distinct from true or new.request_id is null then return new; end if;
  select industry into v_industry
  from public.saas_onboarding_requests
  where id = new.request_id;
  if v_industry = 'marketing' then
    new.module_overrides := coalesce(new.module_overrides, '{}'::jsonb)
      || jsonb_build_object('billboards', true, 'advertising_campaigns', true);
    new.feature_overrides := coalesce(new.feature_overrides, '{}'::jsonb)
      || jsonb_build_object('campaign_sms', true, 'campaign_email', true, 'campaign_instagram_post', true);
  end if;
  return new;
end;
$$;
revoke all on function public.apply_marketing_demo_entitlements() from public, anon, authenticated;

drop trigger if exists trg_marketing_demo_entitlements on public.saas_org_settings;
create trigger trg_marketing_demo_entitlements
before insert or update of request_id, is_demo on public.saas_org_settings
for each row execute function public.apply_marketing_demo_entitlements();

update public.saas_org_settings settings
set module_overrides = coalesce(settings.module_overrides, '{}'::jsonb)
      || jsonb_build_object('billboards', true, 'advertising_campaigns', true),
    feature_overrides = coalesce(settings.feature_overrides, '{}'::jsonb)
      || jsonb_build_object('campaign_sms', true, 'campaign_email', true, 'campaign_instagram_post', true)
from public.saas_onboarding_requests request
where settings.is_demo = true and settings.request_id = request.id
  and request.industry = 'marketing'
  and (coalesce(settings.module_overrides, '{}'::jsonb) ->> 'billboards' is distinct from 'true'
    or coalesce(settings.module_overrides, '{}'::jsonb) ->> 'advertising_campaigns' is distinct from 'true'
    or coalesce(settings.feature_overrides, '{}'::jsonb) ->> 'campaign_sms' is distinct from 'true'
    or coalesce(settings.feature_overrides, '{}'::jsonb) ->> 'campaign_email' is distinct from 'true'
    or coalesce(settings.feature_overrides, '{}'::jsonb) ->> 'campaign_instagram_post' is distinct from 'true');

commit;
