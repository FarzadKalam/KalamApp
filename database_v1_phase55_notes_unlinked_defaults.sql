alter table if exists public.notes
  alter column module_id set default '',
  alter column record_id set default '';

create or replace function public.normalize_note_scope()
returns trigger
language plpgsql
as $$
begin
  new.module_id := coalesce(nullif(trim(new.module_id), ''), '');
  new.record_id := coalesce(nullif(trim(new.record_id), ''), '');
  return new;
end;
$$;

drop trigger if exists trg_notes_normalize_scope on public.notes;

create trigger trg_notes_normalize_scope
before insert or update on public.notes
for each row
execute function public.normalize_note_scope();
