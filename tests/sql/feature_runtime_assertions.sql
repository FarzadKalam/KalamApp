select set_config('test.uid','00000000-0000-0000-0000-000000000003',false);
select set_config('test.org','00000000-0000-0000-0000-000000000001',false);
update saas_org_settings set feature_overrides='{"goals":false,"advanced_reports":false,"business_model_canvas":false,"internal_chat":false,"advanced_commission":false}' where org_id=current_org_id();
set role authenticated;
do $$ begin
 if exists(select 1 from goals) or exists(select 1 from report_definitions) then raise exception 'Commercial resource bypassed disabled feature'; end if;
 if (select count(*) from org_documents)<>1 then raise exception 'Canvas gate hid ordinary knowledge documents or leaked canvas'; end if;
 begin
  insert into notes(org_id) values(current_org_id());
  raise exception 'Direct message bypassed disabled feature';
 exception when insufficient_privilege then null; end;
 begin
  perform save_commission_calculation('{}','[]');
  raise exception 'Commission RPC bypassed disabled plan';
 exception when insufficient_privilege then null; end;
 insert into notes(org_id,module_id,record_id) values(current_org_id(),'tasks','test-record');
 insert into notes(org_id,metadata) values(current_org_id(),'{"saved_message":true}');
end $$;
reset role;
update saas_org_settings set feature_overrides='{"goals":true,"advanced_reports":true,"business_model_canvas":true,"internal_chat":true}' where org_id=current_org_id();
set role authenticated;
do $$ begin
 if (select count(*) from goals)<>1 or (select count(*) from report_definitions)<>1 or (select count(*) from org_documents)<>2 then raise exception 'Enabled resource did not recover'; end if;
 insert into notes(org_id) values(current_org_id());
end $$;
reset role;
