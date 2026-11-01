set role anon;
do $$
declare payload jsonb;
begin
  payload := public.get_public_content_calendar('active-link');
  if jsonb_array_length(payload->'tasks') <> 1 or jsonb_array_length(payload->'projects') <> 1 then
    raise exception 'Public calendar leaked another org or lost a visible record';
  end if;
  if payload#>>'{tasks,0,status_presentation,label}' <> 'آمادهٔ انتشار'
    or payload#>>'{tasks,0,status_presentation,color}' <> 'purple' then
    raise exception 'Custom current status presentation is missing';
  end if;
  if payload::text like '%private-value%' or payload::text like '%do-not-publish%' or payload::text like '%status-secret%' then
    raise exception 'Private workflow data leaked';
  end if;
  if jsonb_array_length(payload#>'{tasks,0,public_fields}') <> 1 or payload#>>'{tasks,0,public_fields,0,value}' <> 'public-value' then
    raise exception 'Explicit public field selection changed';
  end if;
  if public.get_public_content_calendar('private-link')->>'error' <> 'not_found'
    or public.get_public_content_calendar('archived-link')->>'error' <> 'not_found'
    or public.get_public_content_calendar('unknown-link')->>'error' <> 'not_found' then
    raise exception 'Inactive public link is accessible';
  end if;
end $$;
reset role;
