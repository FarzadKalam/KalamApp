-- Phase 183: Backfill entry_no for existing journal entries that lack a number
-- Assigns sequential numbers per fiscal year (oldest entry gets lowest number).
-- Entries not covered by any fiscal year are grouped together under NULL fiscal_year_id.

do $$
declare
  v_year_id uuid;
  v_max_no  int;
  v_counter int;
  r         record;
begin
  -- Process each fiscal year
  for v_year_id in
    select id from public.fiscal_years order by start_date
  loop
    -- Find the current max entry_no already assigned within this fiscal year
    select coalesce(
      max(
        case
          when entry_no ~ '^\d+$' then entry_no::int
          else 0
        end
      ), 0
    )
    into v_max_no
    from public.journal_entries
    where fiscal_year_id = v_year_id
      and entry_no is not null;

    v_counter := v_max_no;

    -- Assign sequential numbers to unnumbered entries in this fiscal year (oldest first)
    for r in
      select id
      from public.journal_entries
      where fiscal_year_id = v_year_id
        and entry_no is null
      order by entry_date, created_at
    loop
      v_counter := v_counter + 1;
      update public.journal_entries
      set entry_no = lpad(v_counter::text, 6, '0')
      where id = r.id;
    end loop;
  end loop;

  -- Process entries with no fiscal year assigned (null fiscal_year_id)
  select coalesce(
    max(
      case
        when entry_no ~ '^\d+$' then entry_no::int
        else 0
      end
    ), 0
  )
  into v_max_no
  from public.journal_entries
  where fiscal_year_id is null
    and entry_no is not null;

  v_counter := v_max_no;

  for r in
    select id
    from public.journal_entries
    where fiscal_year_id is null
      and entry_no is null
    order by entry_date, created_at
  loop
    v_counter := v_counter + 1;
    update public.journal_entries
    set entry_no = lpad(v_counter::text, 6, '0')
    where id = r.id;
  end loop;
end;
$$;
