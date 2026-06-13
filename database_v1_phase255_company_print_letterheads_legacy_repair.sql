begin;

alter table public.company_settings
  add column if not exists print_letterheads jsonb not null default '[]'::jsonb;

update public.company_settings
   set print_letterheads = '[]'::jsonb
 where print_letterheads is null
    or jsonb_typeof(print_letterheads) <> 'array';

do $$
declare
  has_portrait_url boolean;
  has_portrait_layout boolean;
  has_landscape_url boolean;
  has_landscape_layout boolean;
  portrait_layout_expr text;
  landscape_layout_expr text;
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

  portrait_layout_expr := case
    when has_portrait_layout then 'coalesce(print_letterhead_portrait_layout, ''{}''::jsonb)'
    else '''{}''::jsonb'
  end;

  landscape_layout_expr := case
    when has_landscape_layout then 'coalesce(print_letterhead_landscape_layout, ''{}''::jsonb)'
    else '''{}''::jsonb'
  end;

  if has_portrait_url then
    execute format(
      $sql$
      update public.company_settings
         set print_letterheads = case
           when exists (
             select 1
               from jsonb_array_elements(print_letterheads) as item
              where coalesce(item->>'slotId', item->>'id') = 'portrait_1'
           ) then print_letterheads
           when coalesce(nullif(trim(print_letterhead_portrait_url), ''), '') = '' then print_letterheads
           else print_letterheads || jsonb_build_array(
             jsonb_build_object(
               'id', 'portrait_1',
               'slotId', 'portrait_1',
               'orientation', 'portrait',
               'title', 'سربرگ عمودی ۱',
               'imageUrl', trim(print_letterhead_portrait_url),
               'isActive', true,
               'layout', %s,
               'sortOrder', 1
             )
           )
         end
       where jsonb_typeof(print_letterheads) = 'array';
      $sql$,
      portrait_layout_expr
    );
  end if;

  if has_landscape_url then
    execute format(
      $sql$
      update public.company_settings
         set print_letterheads = case
           when exists (
             select 1
               from jsonb_array_elements(print_letterheads) as item
              where coalesce(item->>'slotId', item->>'id') = 'landscape_1'
           ) then print_letterheads
           when coalesce(nullif(trim(print_letterhead_landscape_url), ''), '') = '' then print_letterheads
           else print_letterheads || jsonb_build_array(
             jsonb_build_object(
               'id', 'landscape_1',
               'slotId', 'landscape_1',
               'orientation', 'landscape',
               'title', 'سربرگ افقی ۱',
               'imageUrl', trim(print_letterhead_landscape_url),
               'isActive', true,
               'layout', %s,
               'sortOrder', 3
             )
           )
         end
       where jsonb_typeof(print_letterheads) = 'array';
      $sql$,
      landscape_layout_expr
    );
  end if;
end $$;

commit;
