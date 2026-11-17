select set_config('test.auth_role','service_role',false);
do $$declare rows jsonb; first_id uuid; again_id uuid;
  actor uuid:='50000000-0000-4000-8000-000000000001'; tenant uuid:='20000000-0000-4000-8000-000000000001';
begin
  rows:=read_saas_workflow_source(support_provider_org_id(),actor,'saas_orgs',null,200,0);
  if jsonb_array_length(rows)<>1 or rows->0->>'id'<>tenant::text then raise exception 'provider scan missed tenant'; end if;
  rows:=read_saas_workflow_source(support_provider_org_id(),actor,'saas_orgs','30000000-0000-4000-8000-000000000001',1,0);
  if rows->0->>'id'<>tenant::text then raise exception 'legacy event identity failed'; end if;
  first_id:=workflow_create_saas_related_invoice(support_provider_org_id(),actor,'saas_orgs',tenant,'{"name":"test","status":"proforma","total_invoice_amount":100}','execution:one');
  again_id:=workflow_create_saas_related_invoice(support_provider_org_id(),actor,'saas_orgs',tenant,'{"name":"duplicate"}','execution:one');
  if first_id<>again_id or (select count(*) from invoices)<>1 then raise exception 'duplicate invoice'; end if;
  if not exists(select 1 from invoices where id=first_id and org_id=support_provider_org_id() and saas_tenant_org_id=tenant) then raise exception 'wrong invoice scope'; end if;
  begin
    perform read_saas_workflow_source(tenant,actor,'saas_orgs',null,1,0);
    raise exception 'wrong provider accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform workflow_create_saas_related_invoice(support_provider_org_id(),actor,'saas_orgs',tenant,'{"name":"paid","status":"settled"}','execution:paid');
    raise exception 'paid invoice accepted';
  exception when raise_exception then if sqlerrm<>'workflow_invoice_must_be_unpaid' then raise; end if; end;
  update profiles set is_active=false where id=actor;
  begin
    perform read_saas_workflow_source(support_provider_org_id(),actor,'saas_orgs',null,1,0);
    raise exception 'inactive actor accepted';
  exception when insufficient_privilege then null; end;
end$$;
