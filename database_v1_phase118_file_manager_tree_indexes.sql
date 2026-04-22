-- =====================================================
-- KalamApp - Phase 118 File Manager Tree Indexes
-- Date: 2026-04-22
-- Type: Additive / non-breaking migration
-- Goal: speed up module -> record -> folder file manager browsing
-- =====================================================

begin;

create index if not exists idx_file_folders_parent_tree
  on public.file_folders(parent_id, sort_order, created_at);

create index if not exists idx_file_entries_folder_active_tree
  on public.file_entries(folder_id, is_deleted, created_at desc);

create index if not exists idx_file_entries_module_record_active_tree
  on public.file_entries(module_id, record_id, is_deleted, created_at desc);

create index if not exists idx_record_files_entry_folder_tree
  on public.record_files(file_entry_id, folder_id);

commit;
