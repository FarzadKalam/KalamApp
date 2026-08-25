-- Prevent the shared campaign-link trigger from reading table-specific columns
-- when it runs for outbound_messages. Existing non-campaign records return unchanged.

begin;

create or replace function public.validate_advertising_campaign_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_campaign_org uuid;
  v_tool_campaign uuid;
  v_tool_org uuid;
  v_source text;
  v_record jsonb;
begin
  -- NEW has a different row type for each table using this trigger. Reading
  -- table-specific fields directly here causes PostgreSQL to fail before the
  -- CASE branch can protect it (for example, outbound_messages has no source).
  v_record := to_jsonb(new);
  v_source := case tg_table_name
    when 'marketing_leads' then nullif(btrim(coalesce(v_record ->> 'source', '')), '')
    when 'customers' then nullif(btrim(coalesce(v_record ->> 'lead_source', '')), '')
    when 'invoices' then nullif(btrim(coalesce(v_record ->> 'sale_source', '')), '')
    else null
  end;

  -- Preserve all existing messages, groups, contacts and business records that
  -- are not linked to an advertising campaign.
  if new.advertising_campaign_id is null and new.advertising_campaign_tool_id is null then
    if v_source = 'advertising_campaign' then
      raise exception 'رکوردهای منتسب به کمپین تبلیغاتی باید کمپین یا ابزار تبلیغاتی معتبر داشته باشند.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.advertising_campaign_id is null and new.advertising_campaign_tool_id is not null then
    select campaign_id, org_id
      into v_tool_campaign, v_tool_org
      from public.advertising_campaign_tools
     where id = new.advertising_campaign_tool_id;

    if v_tool_campaign is null or v_tool_org is distinct from new.org_id then
      raise exception 'ابزار تبلیغاتی متعلق به سازمان جاری نیست.' using errcode = '23514';
    end if;

    new.advertising_campaign_id := v_tool_campaign;
  end if;

  select org_id
    into v_campaign_org
    from public.advertising_campaigns
   where id = new.advertising_campaign_id;

  if v_campaign_org is null or v_campaign_org is distinct from new.org_id then
    raise exception 'کمپین تبلیغاتی متعلق به سازمان جاری نیست.' using errcode = '23514';
  end if;

  if new.advertising_campaign_tool_id is not null then
    select campaign_id, org_id
      into v_tool_campaign, v_tool_org
      from public.advertising_campaign_tools
     where id = new.advertising_campaign_tool_id;

    if v_tool_campaign is null
       or v_tool_campaign is distinct from new.advertising_campaign_id
       or v_tool_org is distinct from new.org_id then
      raise exception 'ابزار تبلیغاتی با کمپین یا سازمان رکورد سازگار نیست.' using errcode = '23514';
    end if;
  end if;

  -- Update the source marker only for tables that actually contain that field.
  if tg_table_name = 'marketing_leads' then
    new := jsonb_populate_record(
      new,
      jsonb_set(to_jsonb(new), '{source}', '"advertising_campaign"'::jsonb, true)
    );
  elsif tg_table_name = 'customers' then
    new := jsonb_populate_record(
      new,
      jsonb_set(to_jsonb(new), '{lead_source}', '"advertising_campaign"'::jsonb, true)
    );
  elsif tg_table_name = 'invoices' then
    new := jsonb_populate_record(
      new,
      jsonb_set(to_jsonb(new), '{sale_source}', '"advertising_campaign"'::jsonb, true)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_marketing_leads_campaign_link on public.marketing_leads;
create trigger trg_marketing_leads_campaign_link
before insert or update of advertising_campaign_id, advertising_campaign_tool_id, source
on public.marketing_leads
for each row execute function public.validate_advertising_campaign_link();

drop trigger if exists trg_customers_campaign_link on public.customers;
create trigger trg_customers_campaign_link
before insert or update of advertising_campaign_id, advertising_campaign_tool_id, lead_source
on public.customers
for each row execute function public.validate_advertising_campaign_link();

drop trigger if exists trg_invoices_campaign_link on public.invoices;
create trigger trg_invoices_campaign_link
before insert or update of advertising_campaign_id, advertising_campaign_tool_id, sale_source
on public.invoices
for each row execute function public.validate_advertising_campaign_link();

drop trigger if exists trg_outbound_messages_campaign_link on public.outbound_messages;
create trigger trg_outbound_messages_campaign_link
before insert or update of advertising_campaign_id, advertising_campaign_tool_id
on public.outbound_messages
for each row execute function public.validate_advertising_campaign_link();

notify pgrst, 'reload schema';

commit;
