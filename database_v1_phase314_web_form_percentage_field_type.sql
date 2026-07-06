-- =====================================================
-- KalamApp - Phase 314
-- Web forms: allow percentage field type in saved fields
-- =====================================================

begin;

alter table if exists public.web_form_fields
  drop constraint if exists chk_web_form_fields_type;

alter table if exists public.web_form_fields
  add constraint chk_web_form_fields_type check (
    field_type in (
      'text', 'long_text', 'number', 'percentage', 'phone', 'date', 'time', 'datetime',
      'image', 'file', 'multi_select', 'location', 'checkbox', 'select', 'relation'
    )
  );

notify pgrst, 'reload schema';

commit;
