begin;

with subfolders as (
  select
    sf.id as subfolder_id,
    parent.id as record_folder_id
  from file_folders sf
  join file_folders parent on parent.id = sf.parent_id
  where sf.folder_type = 'system_subrecord'
    and parent.folder_type = 'system_record'
)
update file_entries fe
set folder_id = subfolders.record_folder_id
from subfolders
where fe.folder_id = subfolders.subfolder_id;

with subfolders as (
  select
    sf.id as subfolder_id,
    parent.id as record_folder_id
  from file_folders sf
  join file_folders parent on parent.id = sf.parent_id
  where sf.folder_type = 'system_subrecord'
    and parent.folder_type = 'system_record'
)
update record_files rf
set folder_id = subfolders.record_folder_id
from subfolders
where rf.folder_id = subfolders.subfolder_id;

with subfolders as (
  select
    sf.id as subfolder_id,
    parent.id as record_folder_id
  from file_folders sf
  join file_folders parent on parent.id = sf.parent_id
  where sf.folder_type = 'system_subrecord'
    and parent.folder_type = 'system_record'
)
update file_assets fa
set origin_folder_id = subfolders.record_folder_id
from subfolders
where fa.origin_folder_id = subfolders.subfolder_id;

delete from file_folders
where folder_type = 'system_subrecord';

commit;
