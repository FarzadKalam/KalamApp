-- TazeSystem V1 Phase 529: مصرف واقعی فضای ذخیره‌سازی در سطح سازمان.
begin;
create or replace function public.get_current_saas_storage_usage()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_org_id uuid:=public.current_org_id(); v_bytes bigint:=0; v_files bigint:=0;
begin
  if v_org_id is null then return jsonb_build_object('bytes',0,'files',0); end if;
  select coalesce(sum(greatest(coalesce(file_size_bytes,0),0)),0),count(*) into v_bytes,v_files
  from public.file_assets where org_id=v_org_id;
  return jsonb_build_object('bytes',v_bytes,'files',v_files,'gb',round(v_bytes/1073741824.0,3));
end;
$$;
revoke all on function public.get_current_saas_storage_usage() from public,anon;
grant execute on function public.get_current_saas_storage_usage() to authenticated;
notify pgrst,'reload schema';
commit;
