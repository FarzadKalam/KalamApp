begin;

alter table public.company_settings
  add column if not exists print_letterheads jsonb not null default '[]'::jsonb;

comment on column public.company_settings.print_letterheads is
  'تنظیمات سربرگ‌های چاپ سازمان شامل حداکثر دو سربرگ عمودی و دو سربرگ افقی با لایه‌بندی مشترک.';

do $$
declare
  has_portrait_url boolean;
  has_portrait_layout boolean;
  has_landscape_url boolean;
  has_landscape_layout boolean;
  sql_text text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_settings'
      and column_name = 'print_letterhead_portrait_url'
  ) into has_portrait_url;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_settings'
      and column_name = 'print_letterhead_portrait_layout'
  ) into has_portrait_layout;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_settings'
      and column_name = 'print_letterhead_landscape_url'
  ) into has_landscape_url;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_settings'
      and column_name = 'print_letterhead_landscape_layout'
  ) into has_landscape_layout;

  sql_text := '
    update public.company_settings
       set print_letterheads = case
         when jsonb_typeof(print_letterheads) = ''array'' and jsonb_array_length(print_letterheads) > 0 then print_letterheads
         else (
           select coalesce(jsonb_agg(item), ''[]''::jsonb)
             from (
               select item
                 from (
                   select case
                     when ' || case when has_portrait_url then 'coalesce(nullif(trim(print_letterhead_portrait_url), ''''), '''') <> ''''' else 'false' end || '
                     then jsonb_build_object(
                       ''id'', ''portrait_1'',
                       ''slotId'', ''portrait_1'',
                       ''orientation'', ''portrait'',
                       ''title'', ''سربرگ عمودی ۱'',
                       ''imageUrl'', trim(print_letterhead_portrait_url),
                       ''isActive'', true,
                       ''layout'', ' || case when has_portrait_layout then 'coalesce(print_letterhead_portrait_layout, ''{}''::jsonb)' else '''{}''::jsonb' end || ',
                       ''sortOrder'', 1
                     )
                     else null
                   end as item
                   union all
                   select case
                     when ' || case when has_landscape_url then 'coalesce(nullif(trim(print_letterhead_landscape_url), ''''), '''') <> ''''' else 'false' end || '
                     then jsonb_build_object(
                       ''id'', ''landscape_1'',
                       ''slotId'', ''landscape_1'',
                       ''orientation'', ''landscape'',
                       ''title'', ''سربرگ افقی ۱'',
                       ''imageUrl'', trim(print_letterhead_landscape_url),
                       ''isActive'', true,
                       ''layout'', ' || case when has_landscape_layout then 'coalesce(print_letterhead_landscape_layout, ''{}''::jsonb)' else '''{}''::jsonb' end || ',
                       ''sortOrder'', 3
                     )
                     else null
                   end as item
                 ) legacy_items
                where item is not null
             ) prepared
         )
       end
     where print_letterheads is null
        or jsonb_typeof(print_letterheads) <> ''array''
        or jsonb_array_length(print_letterheads) = 0;
  ';

  execute sql_text;
end $$;

commit;
