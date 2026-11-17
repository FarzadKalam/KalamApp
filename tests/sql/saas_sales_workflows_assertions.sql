select set_config('test.auth_role','service_role',false);
do $$
declare provider uuid:=public.support_provider_org_id();
  actor uuid:='50000000-0000-4000-8000-000000000001';
  tenant uuid:='20000000-0000-4000-8000-000000000001';
  owner_id uuid:='50000000-0000-4000-8000-000000000002';
  staff_id uuid:='50000000-0000-4000-8000-000000000003';
  blocked_id uuid:='50000000-0000-4000-8000-000000000004';
  bundle uuid; manual uuid; feature uuid; addon uuid; invoice uuid; second_invoice uuid; customer uuid;
  bill public.saas_orders%rowtype; online_order uuid; tx uuid; ticket uuid; tenant_view jsonb;
begin
  customer:=public.resolve_saas_sales_customer(provider,tenant);
  if customer is null or customer is distinct from public.resolve_saas_sales_customer(provider,tenant) then raise exception 'CRM identity not stable'; end if;
  select bundle_id into strict bundle from saas_sales_catalog_links where org_id=provider and kind='plan' and code='test';
  select product_id into strict feature from saas_sales_catalog_links where org_id=provider and kind='feature' and code='web_search';
  insert into saas_catalog_items values('test-addon','افزونه آزمایشی','bundle','test-addon','one_time',
    '{"included_items":[{"item_kind":"module","entitlement_code":"tasks","quantity":1}]}',true);
  select product_id into strict addon from saas_sales_catalog_links where org_id=provider and kind='addon' and code='test-addon';
  if (select jsonb_array_length(products) from product_bundles where id=bundle)<>2 then raise exception 'plan bundle contents missing'; end if;
  insert into products(org_id,name,product_type) values(provider,'خدمت دستی','service') returning id into manual;
  insert into invoices(org_id,saas_tenant_org_id,workflow_saas_origin_key,name,status,invoice_date,"invoiceItems")
    values(provider,tenant,'test-key','فاکتور آزمایشی','proforma',current_date,jsonb_build_array(
      jsonb_build_object('product_id',bundle,'source_module_id','product_bundles','quantity',3,'unit_price',100),
      jsonb_build_object('product_id',manual,'source_module_id','products','quantity',1,'unit_price',50),
      jsonb_build_object('product_id',feature,'source_module_id','products','quantity',1,'unit_price',10),
      jsonb_build_object('product_id',addon,'source_module_id','products','quantity',1,'unit_price',25))) returning id into invoice;
  perform workflow_deliver_saas_sales_invoice(provider,actor,'invoices',invoice,3);
  perform workflow_deliver_saas_sales_invoice(provider,actor,'invoices',invoice,3);
  select * into strict bill from saas_orders where org_id=tenant;
  if bill.total_irt<>385 or jsonb_array_length(bill.items)<>3 or bill.items->0->'metadata'->>'term_months'<>'3' then
    raise exception 'wrong captured price or entitlements';
  end if;
  perform set_config('test.auth_uid',owner_id::text,true);
  perform set_config('test.current_org',tenant::text,true);
  tenant_view:=get_current_saas_pending_orders()->0;
  if tenant_view->>'title'<>'فاکتور آزمایشی' or tenant_view->'items'->1->>'title'<>'خدمت دستی' or tenant_view ? 'invoice_id'
    then raise exception 'account response not safe or missing manual item'; end if;
  set local role authenticated;
  if exists(select 1 from saas_orders where id=bill.id) then raise exception 'raw invoice order exposed'; end if;
  if get_current_saas_pending_orders()->0->>'title'<>'فاکتور آزمایشی' then raise exception 'safe account view unavailable'; end if;
  reset role;
  perform set_config('test.current_org',provider::text,true);
  if jsonb_array_length(get_current_saas_pending_orders())<>0 then raise exception 'cross-tenant invoice exposure'; end if;
  begin
    perform workflow_apply_saas_sales_invoice_access(provider,actor,invoice);
    raise exception 'unpaid access allowed';
  exception when raise_exception then if sqlerrm<>'پرداخت فاکتور در حساب و اشتراک هنوز تأیید نشده است.' then raise; end if; end;
  perform set_config('test.auth_role','authenticated',true);
  update saas_catalog_items set metadata='{"included_items":[]}',billing_cycle='monthly' where code='test-addon';
  perform public.activate_saas_order_items(bill.id,null,'billing_wallet');
  if not exists(select 1 from invoices where id=invoice and status='settled' and customer_id=customer and total_received_amount=385)
    or (select count(*) from invoices)<>1 then raise exception 'payment did not settle original invoice'; end if;
  if not exists(select 1 from saas_org_settings where org_id=tenant and plan_code='test' and is_demo=false)
    or not exists(select 1 from saas_org_entitlements where org_id=tenant and entitlement_code='web_search' and item_kind='feature')
    or not exists(select 1 from saas_org_entitlements where org_id=tenant and entitlement_code='tasks' and item_kind='module')
    or (select count(*) from saas_org_entitlements where org_id=tenant)<>2 then raise exception 'entitlements did not follow packaged and mapped items'; end if;
  perform set_config('test.auth_role','service_role',true);
  insert into company_settings values(provider,'IRR');
  insert into invoices(org_id,saas_tenant_org_id,workflow_saas_origin_key,name,status,invoice_date,"invoiceItems")
    values(provider,tenant,'irr-test','فاکتور ریالی','proforma',current_date,jsonb_build_array(
      jsonb_build_object('product_id',manual,'source_module_id','products','quantity',1,'unit_price',50))) returning id into second_invoice;
  perform workflow_deliver_saas_sales_invoice(provider,actor,'invoices',second_invoice,1);
  select order_id into strict online_order from saas_sales_invoice_orders where invoice_id=second_invoice;
  insert into payment_transactions(org_id,purpose,status,amount,currency,metadata)
    values(tenant,'saas_account_order','pending',50,'IRT',jsonb_build_object('saas_order_id',online_order)) returning id into tx;
  begin
    insert into payment_transactions(org_id,purpose,status,amount,currency,metadata)
      values(tenant,'saas_account_order','pending',50,'IRT',jsonb_build_object('saas_order_id',online_order));
    raise exception 'duplicate gateway payment initiated';
  exception when raise_exception then if sqlerrm<>'پرداخت دیگری برای این فاکتور در جریان است.' then raise; end if; end;
  begin
    perform public.activate_saas_order_items(online_order,tx,'online');
    raise exception 'nonverified payment settled';
  exception when raise_exception then if sqlerrm<>'دریافت تأییدشده با مبلغ فاکتور مطابقت ندارد.' then raise; end if; end;
  update payment_transactions set status='verified' where id=tx;
  perform public.activate_saas_order_items(online_order,tx,'online');
  if not exists(select 1 from invoices where id=second_invoice and status='settled' and total_received_amount=500)
    or (select count(*) from invoices)<>2 then raise exception 'online payment did not settle IRR sale invoice'; end if;
  insert into profiles(id,org_id,is_active,full_name) values(owner_id,tenant,true,'مالک'),(staff_id,tenant,true,'کاربر'),(blocked_id,tenant,true,'فاقد دسترسی');
  insert into org_roles(id,org_id,permissions,title) values('40000000-0000-4000-8000-000000000002',tenant,'{"__support_tickets":{"view":false}}','محدود');
  insert into user_organization_memberships values
    (tenant,owner_id,null,true,true,'admin'),(tenant,staff_id,null,true,false,'member'),
    (tenant,blocked_id,'40000000-0000-4000-8000-000000000002',true,false,'member');
  perform set_config('test.auth_role','service_role',true);
  ticket:=(workflow_send_saas_ticket(provider,actor,'invoices',invoice,array['default'],'general','فاکتور حساب شما','آماده پرداخت','delivery-one')->>'id')::uuid;
  perform workflow_send_saas_ticket(provider,actor,'invoices',invoice,array['default'],'general','فاکتور حساب شما','آماده پرداخت','delivery-one');
  if (select count(*) from saas_support_tickets)<>1 or not exists(select 1 from test_notification_items
    where org_id=tenant and cardinality(recipient_ids)=2 and owner_id=any(recipient_ids) and staff_id=any(recipient_ids)) then
    raise exception 'ticket notification audience or duplication';
  end if;
  perform set_config('test.current_org',tenant::text,true);
  perform set_config('test.auth_uid',staff_id::text,true);
  if not support_can_view_ticket(ticket,false) or support_unread_total()<>1 or not support_send_message(ticket,'reply',false)
    then raise exception 'multi recipient ticket access missing'; end if;
  perform set_config('test.auth_uid',blocked_id::text,true);
  if support_can_view_ticket(ticket,false) or support_unread_total()<>0 then raise exception 'unauthorized ticket exposure'; end if;
end $$;
