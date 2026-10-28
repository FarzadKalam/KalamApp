-- Remove only legacy user-count bullets from public plan copy.
-- The minimum user count remains enforced by the subscription rules.
begin;

with cleaned as (
  select p.id,
         coalesce(
           jsonb_agg(item.value order by item.ordinality)
             filter (where coalesce(
               case when jsonb_typeof(item.value) = 'string' then item.value #>> '{}' end,
               item.value ->> 'text',
               ''
             ) not in ('حداقل ۳ کاربر', 'حداقل 3 کاربر', '۳ کاربر شامل', '3 کاربر شامل')),
           '[]'::jsonb
         ) as display_features
  from public.saas_plans p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(p.display_features) = 'array' then p.display_features else '[]'::jsonb end
  ) with ordinality as item(value, ordinality)
  where lower(coalesce(p.code, '')) in ('cloud_starter', 'cloud_growth', 'cloud_enterprise')
  group by p.id
)
update public.saas_plans p
set display_features = cleaned.display_features,
    updated_at = now()
from cleaned
where p.id = cleaned.id
  and p.display_features is distinct from cleaned.display_features;

commit;
