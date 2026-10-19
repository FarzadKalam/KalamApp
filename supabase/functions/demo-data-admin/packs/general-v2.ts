// @ts-nocheck
import { createTrackedDemoClient, resolveDemoPack } from '../_shared/demo-seed-runtime.ts';
import { seedGeneralPackExtras } from '../_shared/demo-general-pack.ts';
import { getActiveBatch, createBatch, markBatchStatus } from '../_shared/demo-seed-batches.ts';
const now = () => new Date();
const todayIso = (daysOffset = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + daysOffset);
  return value.toISOString().slice(0, 10);
};

const dateTimeIso = (daysOffset = 0, hours = 9, minutes = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + daysOffset);
  value.setHours(hours, minutes, 0, 0);
  return value.toISOString();
};

const normalizeEmail = (value?: string | null) =>
  String(value || '').trim().toLowerCase();

const getErrorMessage = (error: any, fallback = 'unknown_error') =>
  String(error?.message || error?.details || error?.hint || error || fallback);

const buildWeeklyPlan = () => ({
  saturday: { enabled: true, start: '08:30', end: '17:30' },
  sunday: { enabled: true, start: '08:30', end: '17:30' },
  monday: { enabled: true, start: '08:30', end: '17:30' },
  tuesday: { enabled: true, start: '08:30', end: '17:30' },
  wednesday: { enabled: true, start: '08:30', end: '17:30' },
  thursday: { enabled: true, start: '08:30', end: '13:30' },
  friday: { enabled: false, start: null, end: null },
});

const buildInvoiceItems = (products: any[], shelfId?: string | null, priceListId?: string | null) => {
  const [first, second] = products;
  return [
    {
      product_id: first?.id || null,
      quantity: 3,
      package_id: null,
      price_list_id: priceListId || null,
      main_unit: 'عدد',
      sub_quantity: null,
      sub_unit: null,
      unit_price: 18500000,
      discount: 5,
      vat: 10,
      total_price: 57997500,
      source_shelf_id: shelfId || null,
      description: 'فروش اولیه برای شروع دمو',
    },
    {
      product_id: second?.id || null,
      quantity: 2,
      package_id: null,
      price_list_id: priceListId || null,
      main_unit: 'عدد',
      sub_quantity: null,
      sub_unit: null,
      unit_price: 26500000,
      discount: 0,
      vat: 10,
      total_price: 58300000,
      source_shelf_id: shelfId || null,
      description: 'آیتم دوم فاکتور فروش',
    },
  ];
};

const buildPurchaseItems = (products: any[], shelfId?: string | null) => {
  const [first, second] = products;
  return [
    {
      product_id: first?.id || null,
      quantity: 20,
      main_unit: 'عدد',
      sub_quantity: null,
      sub_unit: null,
      unit_price: 11200000,
      discount: 0,
      vat: 10,
      total_price: 246400000,
      source_shelf_id: shelfId || null,
      description: 'تامین موجودی شروع دمو',
    },
    {
      product_id: second?.id || null,
      quantity: 8,
      main_unit: 'عدد',
      sub_quantity: null,
      sub_unit: null,
      unit_price: 17500000,
      discount: 3,
      vat: 10,
      total_price: 149380000,
      source_shelf_id: shelfId || null,
      description: 'تامین کالای جانبی',
    },
  ];
};

const buildPayrollLines = (baseSalary: number, bonus: number, penalty: number) => ([
  { key: 'base_salary', label: 'حقوق پایه', amount: baseSalary, kind: 'earning' },
  { key: 'sales_bonus', label: 'پاداش فروش', amount: bonus, kind: 'earning' },
  { key: 'discipline_penalty', label: 'جریمه تاخیر', amount: penalty, kind: 'deduction' },
]);

export const seedGeneralOrgDemoData = async (serviceClient: any, caller: any, context: any) => {
  const orgId = String(context.profile.org_id);
  const existingBatch = await getActiveBatch(serviceClient, orgId);
  if (existingBatch?.id) {
    if (existingBatch.status !== 'seeded') throw new Error('ساخت قبلی ناتمام است؛ ابتدا داده‌های نمونه قبلی را حذف کنید.');
    return {
      success: true,
      batch_id: existingBatch.id,
      status: 'seeded',
      seeded_records_count: Number(existingBatch.seeded_records_count || 0),
      has_seeded_batch: true,
      warning: null,
    };
  }

  const batchId = await createBatch(serviceClient, orgId, caller.id, {
    slug: context.saasSettings?.slug || null,
    company_name: context.company?.company_full_name || context.company?.trade_name || context.profile?.full_name || null,
    industry: context.company?.industry || null,
  });

  const client = createTrackedDemoClient(serviceClient, batchId);

  try {
    const ownerName = String(context.profile.full_name || caller.user_metadata?.full_name || 'مدیر سازمان').trim();
    const ownerEmail = normalizeEmail(context.profile.email || context.company?.email || caller.email || '');
    const ownerPhone = String(context.profile.mobile_1 || context.company?.mobile || '').trim();
    const assigneeId = context.profile.id;
    const assigneeRoleId = context.profile.role_id || null;
    const organizationName =
      String(context.company?.company_full_name || context.company?.trade_name || '').trim()
      || String(ownerName || 'سازمان نمونه').trim();

    const { data: warehouses, error: warehouseError } = await client
      .from('warehouses')
      .insert([
        {
          org_id: orgId,
          name: 'انبار مرکزی',
          system_code: 'WH-001',
          category: 'inside',
          location: 'دفتر مرکزی',
          manager_id: assigneeId,
          created_by: caller.id,
          updated_by: caller.id,
        },
        {
          org_id: orgId,
          name: 'انبار ارسال',
          system_code: 'WH-002',
          category: 'inside',
          location: 'بخش لجستیک',
          manager_id: assigneeId,
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id,name');
    if (warehouseError) throw warehouseError;


    const { data: shelves, error: shelfError } = await client
      .from('shelves')
      .insert([
        {
          org_id: orgId,
          warehouse_id: warehouses?.[0]?.id || null,
          name: 'قفسه آماده فروش',
          shelf_number: 'A-01',
          system_code: 'SH-001',
          location_detail: 'ردیف اول',
          responsible_id: assigneeId,
          created_by: caller.id,
          updated_by: caller.id,
        },
        {
          org_id: orgId,
          warehouse_id: warehouses?.[1]?.id || null,
          name: 'قفسه بسته‌بندی',
          shelf_number: 'B-02',
          system_code: 'SH-002',
          location_detail: 'بخش خروج',
          responsible_id: assigneeId,
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id,name');
    if (shelfError) throw shelfError;


    const { data: suppliers, error: supplierError } = await client
      .from('suppliers')
      .insert([
        {
          org_id: orgId,
          business_name: 'تامین گستران پارس',
          first_name: 'مریم',
          last_name: 'قاسمی',
          supply_type: 'مواد اولیه',
          rank: 'A',
          mobile_1: '09121230001',
          phone: '02188770001',
          system_code: 'SUP-001',
          city: 'تهران',
          address: 'جردن، پلاک ۱۸',
          website: 'https://supplier-demo.example',
          created_by: caller.id,
          updated_by: caller.id,
        },
        {
          org_id: orgId,
          business_name: 'همکاران لجستیک آراد',
          first_name: 'رضا',
          last_name: 'صادقی',
          supply_type: 'خدمات',
          rank: 'B',
          mobile_1: '09121230002',
          phone: '02188770002',
          system_code: 'SUP-002',
          city: 'کرج',
          address: 'عظیمیه، واحد ۲',
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id,business_name');
    if (supplierError) throw supplierError;


    const { data: products, error: productError } = await client
      .from('products')
      .insert([
        {
          org_id: orgId,
          name: 'پکیج استقرار پایه',
          system_code: 'PRD-001',
          status: 'active',
          product_type: 'service',
          category: 'خدمات',
          main_unit: 'عدد',
          sell_price: 18500000,
          buy_price: 11200000,
          related_supplier: suppliers?.[0]?.id || null,
          created_by: caller.id,
          updated_by: caller.id,
        },
        {
          org_id: orgId,
          name: 'بسته پشتیبانی ویژه',
          system_code: 'PRD-002',
          status: 'active',
          product_type: 'service',
          category: 'اشتراک',
          main_unit: 'عدد',
          sell_price: 26500000,
          buy_price: 17500000,
          related_supplier: suppliers?.[1]?.id || null,
          created_by: caller.id,
          updated_by: caller.id,
        },
        {
          org_id: orgId,
          name: 'داشبورد فروش آماده',
          system_code: 'PRD-003',
          status: 'active',
          product_type: 'service',
          category: 'نرم‌افزار',
          main_unit: 'عدد',
          sell_price: 9500000,
          buy_price: 4200000,
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id,name,sell_price');
    if (productError) throw productError;


    const { data: priceLists, error: priceListError } = await client
      .from('price_lists')
      .insert({
        org_id: orgId,
        name: 'لیست قیمت شروع سریع',
        status: 'active',
        description: 'لیست قیمت اولیه برای نمایش فرآیند فروش و خرید',
        items: (products || []).map((product: any, index: number) => ({
          product_id: product.id,
          price: Number(product.sell_price || 0),
          discount_percent: index === 0 ? 5 : 0,
        })),
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,name');
    if (priceListError) throw priceListError;


    const { data: bundles, error: bundleError } = await client
      .from('product_bundles')
      .insert({
        org_id: orgId,
        bundle_number: 'BND-001',
        name: 'پکیج شروع فروش و عملیات',
        status: 'active',
        shelf_id: shelves?.[0]?.id || null,
        notes: 'برای نمایش همزمان فاکتور، فعالیت و عملیات تحویل',
        products: [
          { product_id: products?.[0]?.id || null, quantity: 1 },
          { product_id: products?.[2]?.id || null, quantity: 1 },
        ],
        assignee_id: assigneeId,
        assignee_type: 'user',
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,name');
    if (bundleError) throw bundleError;


    if (bundles?.id) {
      const { data: bundleItems, error: bundleItemsError } = await client
        .from('bundle_items')
        .insert([
          {
            org_id: orgId,
            bundle_id: bundles.id,
            product_id: products?.[0]?.id || null,
            quantity: 1,
            unit: 'عدد',
          },
          {
            org_id: orgId,
            bundle_id: bundles.id,
            product_id: products?.[2]?.id || null,
            quantity: 1,
            unit: 'عدد',
          },
        ])
        .select('id');
      if (bundleItemsError) throw bundleItemsError;

    }

    const { data: customers, error: customerError } = await client
      .from('customers')
      .insert([
        {
          org_id: orgId,
          full_name: 'علی مرادی',
          first_name: 'علی',
          last_name: 'مرادی',
          business_name: 'فروشگاه آینده',
          person_type: 'real',
          system_code: 'CUS-001',
          mobile_1: '09125550001',
          city: 'تهران',
          address: 'سعادت‌آباد، سرو غربی',
          email: 'customer.one@example.com',
          industry: 'retail',
          portal_enabled: true,
          portal_status: 'active',
          assignee_id: assigneeId,
          assignee_type: 'user',
          created_by: caller.id,
          updated_by: caller.id,
        },
        {
          org_id: orgId,
          full_name: 'شرکت داده‌پردازان رشد',
          legal_name: 'شرکت داده‌پردازان رشد',
          business_name: 'داده‌پردازان رشد',
          person_type: 'legal',
          system_code: 'CUS-002',
          mobile_1: '09125550002',
          city: 'اصفهان',
          address: 'خیابان چهارباغ بالا',
          email: 'customer.two@example.com',
          industry: 'it',
          assignee_id: assigneeId,
          assignee_type: 'user',
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id,full_name,business_name');
    if (customerError) throw customerError;


    const { data: marketingLeads, error: leadError } = await client
      .from('marketing_leads')
      .insert([
        {
          org_id: orgId,
          name: 'سرنخ دمو - کمپین بهار',
          business_name: 'فروشگاه آینده',
          first_name: 'علی',
          mobile: '09125550001',
          source: 'landing_page',
          status: 'new',
          lead_type: 'new_lead',
          description: 'درخواست دمو از کمپین تبلیغاتی برای نمایش funnel فروش',
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id,name');
    if (leadError) throw leadError;


    const { data: processTemplate, error: templateError } = await client
      .from('process_templates')
      .insert({
        org_id: orgId,
        module_id: 'projects',
        module_ids: ['projects', 'tasks'],
        process_kind: 'generic',
        name: 'الگوی اجرای پروژه مشتری',
        description: 'از شروع نیازسنجی تا تحویل و پشتیبانی اولیه',
        auto_copy_mode: 'manual',
        is_active: true,
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,name')
      .single();
    if (templateError) throw templateError;


    const { data: templateStages, error: templateStageError } = await client
      .from('process_template_stages')
      .insert([
        {
          template_id: processTemplate.id,
          stage_name: 'نیازسنجی و کشف',
          sort_order: 10,
          default_status: 'todo',
          default_assignee_id: assigneeId,
          default_assignee_role_id: assigneeRoleId,
          auto_create_task: true,
          wage: 600000,
          metadata: { color: 'blue' },
        },
        {
          template_id: processTemplate.id,
          stage_name: 'استقرار و آموزش',
          sort_order: 20,
          default_status: 'todo',
          default_assignee_id: assigneeId,
          default_assignee_role_id: assigneeRoleId,
          auto_create_task: true,
          wage: 850000,
          metadata: { color: 'orange' },
        },
        {
          template_id: processTemplate.id,
          stage_name: 'تحویل و پشتیبانی اولیه',
          sort_order: 30,
          default_status: 'todo',
          default_assignee_id: assigneeId,
          default_assignee_role_id: assigneeRoleId,
          auto_create_task: true,
          wage: 500000,
          metadata: { color: 'green' },
        },
      ])
      .select('id,stage_name,sort_order');
    if (templateStageError) throw templateStageError;


    const { data: projects, error: projectError } = await client
      .from('projects')
      .insert([
        {
          org_id: orgId,
          name: 'استقرار تازه سیستم برای فروشگاه آینده',
          system_code: 'PRJ-001',
          status: 'in_progress',
          priority: 'high',
          customer_id: customers?.[0]?.id || null,
          owner_id: assigneeId,
          assignee_id: assigneeId,
          assignee_role_id: assigneeRoleId,
          assignee_type: 'user',
          process_template_id: processTemplate.id,
          start_date: todayIso(-10),
          due_date: todayIso(14),
          estimated_budget: 95000000,
          actual_cost: 23000000,
          progress_percent: 45,
          location: 'شعبه مرکزی مشتری',
          description: 'پروژه راه‌اندازی فروش، انبار و منابع انسانی',
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id,name')
      .single();
    if (projectError) throw projectError;


    const { data: projectMembers, error: projectMemberError } = await client
      .from('project_members')
      .insert({
        org_id: orgId,
        project_id: projects.id,
        user_id: assigneeId,
        member_role: 'owner',
        allocation_percent: 100,
        is_active: true,
        joined_at: todayIso(-10),
      })
      .select('id');
    if (projectMemberError) throw projectMemberError;


    const { data: processRun, error: processRunError } = await client
      .from('process_runs')
      .insert({
        org_id: orgId,
        template_id: processTemplate.id,
        module_id: 'projects',
        record_id: projects.id,
        process_name: 'اجرای پروژه فروشگاه آینده',
        status: 'active',
        copied_mode: 'manual',
        started_at: dateTimeIso(-9, 9, 0),
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,process_name')
      .single();
    if (processRunError) throw processRunError;


    const projectLinkResult = await client.from('projects').update({ process_run_id: processRun.id }).eq('id', projects.id).eq('org_id', orgId);
    if (projectLinkResult.error) throw projectLinkResult.error;

    const { data: processRunStages, error: processRunStageError } = await client
      .from('process_run_stages')
      .insert((templateStages || []).map((stage: any, index: number) => ({
        process_run_id: processRun.id,
        template_stage_id: stage.id,
        stage_name: stage.stage_name,
        sort_order: stage.sort_order,
        status: index === 0 ? 'done' : index === 1 ? 'in_progress' : 'todo',
        assignee_user_id: assigneeId,
        assignee_role_id: assigneeRoleId,
        line_no: index + 1,
        planned_start_at: dateTimeIso(index * 2 - 8, 9, 0),
        planned_due_at: dateTimeIso(index * 2 - 7, 17, 0),
        started_at: index <= 1 ? dateTimeIso(index * 2 - 8, 9, 30) : null,
        completed_at: index === 0 ? dateTimeIso(-7, 16, 0) : null,
        wage: index === 0 ? 600000 : index === 1 ? 850000 : 500000,
        produced_qty: 0,
        metadata: {},
      })))
      .select('id,stage_name');
    if (processRunStageError) throw processRunStageError;


    const { data: tasks, error: taskError } = await client
      .from('tasks')
      .insert([
        {
          org_id: orgId,
          name: 'جلسه کشف نیازهای عملیاتی',
          system_code: 'TSK-001',
          status: 'done',
          priority: 'high',
          related_to_module: 'projects',
          description: 'نیازهای فروش، انبار و منابع انسانی بررسی شد.',
          start_date: dateTimeIso(-9, 10, 0),
          due_date: dateTimeIso(-8, 15, 0),
          spent_hours: 4.5,
          wage: 1200000,
          project_id: projects.id,
          related_customer: customers?.[0]?.id || null,
          process_run_stage_id: processRunStages?.[0]?.id || null,
          assignee_id: assigneeId,
          assignee_role_id: assigneeRoleId,
          assignee_type: 'user',
          task_type: 'جلسه خارجی',
          created_by: caller.id,
          updated_by: caller.id,
        },
        {
          org_id: orgId,
          name: 'آماده‌سازی داشبورد فروش و لیست قیمت',
          system_code: 'TSK-002',
          status: 'in_progress',
          priority: 'high',
          related_to_module: 'projects',
          description: 'داشبورد و ساختار قیمت‌گذاری اولیه در حال تنظیم است.',
          start_date: dateTimeIso(-3, 9, 0),
          due_date: dateTimeIso(2, 17, 0),
          spent_hours: 6,
          wage: 2200000,
          project_id: projects.id,
          related_product: products?.[2]?.id || null,
          process_run_stage_id: processRunStages?.[1]?.id || null,
          assignee_id: assigneeId,
          assignee_role_id: assigneeRoleId,
          assignee_type: 'user',
          task_type: 'فعالیت سازمانی',
          created_by: caller.id,
          updated_by: caller.id,
        },
        {
          org_id: orgId,
          name: 'پیگیری سرنخ کمپین بهار',
          system_code: 'TSK-003',
          status: 'todo',
          priority: 'medium',
          related_to_module: 'marketing_leads',
          description: 'هماهنگی برای جلسه دمو و ارسال پرزنتیشن',
          start_date: dateTimeIso(1, 9, 30),
          due_date: dateTimeIso(3, 16, 0),
          spent_hours: 0,
          wage: 0,
          marketing_lead_id: marketingLeads?.[0]?.id || null,
          assignee_id: assigneeId,
          assignee_role_id: assigneeRoleId,
          assignee_type: 'user',
          task_type: 'تماس خروجی',
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id,name');
    if (taskError) throw taskError;


    if (processRunStages?.[0]?.id && tasks?.[0]?.id) {
      const linkResult = await client.from('process_run_stages').update({ task_id: tasks[0].id }).eq('id', processRunStages[0].id).eq('process_run_id', processRun.id);
      if (linkResult.error) throw linkResult.error;
    }
    if (processRunStages?.[1]?.id && tasks?.[1]?.id) {
      const linkResult = await client.from('process_run_stages').update({ task_id: tasks[1].id }).eq('id', processRunStages[1].id).eq('process_run_id', processRun.id);
      if (linkResult.error) throw linkResult.error;
    }

    const { data: invoices, error: invoiceError } = await client
      .from('invoices')
      .insert({
        org_id: orgId,
        name: 'فاکتور فروش استقرار اولیه',
        invoice_date: todayIso(-4),
        system_code: 'INV-001',
        status: 'completed',
        customer_id: customers?.[0]?.id || null,
        sale_source: 'direct',
        invoiceItems: buildInvoiceItems(products || [], shelves?.[0]?.id || null, priceLists?.id || null),
        payments: [
          {
            payment_type: 'cash',
            status: 'completed',
            amount: 45000000,
            date: todayIso(-3),
            description: 'پیش‌پرداخت',
          },
        ],
        total_invoice_amount: 116297500,
        total_received_amount: 45000000,
        remaining_balance: 71297500,
        project_id: projects.id,
        assignee_id: assigneeId,
        assignee_type: 'user',
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,name')
      .single();
    if (invoiceError) throw invoiceError;


    const { data: purchaseInvoices, error: purchaseError } = await client
      .from('purchase_invoices')
      .insert({
        org_id: orgId,
        name: 'فاکتور خرید موجودی اولیه',
        invoice_date: todayIso(-12),
        system_code: 'PINV-001',
        status: 'completed',
        supplier_id: suppliers?.[0]?.id || null,
        purchase_source: 'supplier',
        notify_supplier: false,
        invoiceItems: buildPurchaseItems(products || [], shelves?.[0]?.id || null),
        payments: [
          {
            payment_type: 'bank_transfer',
            status: 'completed',
            amount: 150000000,
            date: todayIso(-11),
            description: 'پرداخت مرحله اول',
          },
        ],
        total_invoice_amount: 395780000,
        total_received_amount: 150000000,
        remaining_balance: 245780000,
        project_id: projects.id,
        assignee_id: assigneeId,
        assignee_type: 'user',
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,name')
      .single();
    if (purchaseError) throw purchaseError;


    const { data: secretariatDocs, error: docError } = await client
      .from('secretariat_documents')
      .insert({
        org_id: orgId,
        name: 'نامه معرفی پروژه به مشتری',
        system_code: 'DOC-001',
        document_type: 'letter',
        direction: 'outgoing',
        status: 'registered',
        priority: 'normal',
        confidentiality: 'normal',
        document_date: todayIso(-5),
        registered_at: dateTimeIso(-5, 11, 0),
        sender_profile_id: assigneeId,
        recipient_profile_id: assigneeId,
        assignee_id: assigneeId,
        assignee_type: 'user',
        assignee_role_id: assigneeRoleId,
        customer_id: customers?.[0]?.id || null,
        related_module_id: 'projects',
        related_record_id: projects.id,
        body: 'خلاصه شروع پروژه و برنامه فاز اول برای مشتری ارسال شد.',
        summary: 'شروع رسمی پروژه و اعلام برنامه استقرار',
        process_template_id: processTemplate.id,
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,name')
      .single();
    if (docError) throw docError;


    const { data: deliveryForms, error: deliveryError } = await client
      .from('delivery_forms')
      .insert({
        org_id: orgId,
        name: 'فرم تحویل بسته شروع فروش',
        system_code: 'DLV-001',
        form_type: 'goods_delivery',
        status: 'confirmed',
        delivery_date: todayIso(-2),
        delivered_by_id: assigneeId,
        received_by_id: assigneeId,
        assignee_id: assigneeId,
        assignee_type: 'user',
        assignee_role_id: assigneeRoleId,
        location_text: 'دفتر مشتری',
        related_module_id: 'invoices',
        related_record_id: invoices.id,
        items: [
          { product_id: products?.[0]?.id || null, quantity: 1, unit: 'عدد' },
          { product_id: products?.[2]?.id || null, quantity: 1, unit: 'عدد' },
        ],
        notes: 'تحویل اقلام و آموزش اولیه انجام شد.',
        process_template_id: processTemplate.id,
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,name')
      .single();
    if (deliveryError) throw deliveryError;


    const { data: stockTransfers, error: transferError } = await client
      .from('stock_transfers')
      .insert({
        org_id: orgId,
        name: 'انتقال آماده‌سازی تحویل',
        system_code: 'TRN-001',
        status: 'closed',
        transfer_date: todayIso(-2),
        transfer_type: 'delivery',
        product_id: products?.[0]?.id || null,
        delivered_qty: 1,
        required_qty: 1,
        from_shelf_id: shelves?.[0]?.id || null,
        to_shelf_id: shelves?.[1]?.id || null,
        invoice_id: invoices.id,
        source_warehouse_id: warehouses?.[0]?.id || null,
        target_warehouse_id: warehouses?.[1]?.id || null,
        sender_id: assigneeId,
        receiver_id: assigneeId,
        assignee_id: assigneeId,
        assignee_type: 'user',
        assignee_role_id: assigneeRoleId,
        delivery_form_id: deliveryForms.id,
        related_module_id: 'delivery_forms',
        related_record_id: deliveryForms.id,
        process_template_id: processTemplate.id,
        notes: 'جابجایی موجودی جهت آماده‌سازی تحویل مشتری',
        created_by: caller.id,
      })
      .select('id,name')
      .single();
    if (transferError) throw transferError;


    const { data: workSchedule, error: scheduleError } = await client
      .from('work_schedules')
      .insert({
        org_id: orgId,
        title: 'برنامه کاری اداری',
        status: 'draft',
        schedule_type: 'fixed',
        is_active: true,
        effective_from: todayIso(-60),
        start_time: '08:30',
        end_time: '17:30',
        expected_daily_minutes: 510,
        weekly_plan: buildWeeklyPlan(),
        weekly_days: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
        notes: 'برنامه پیش‌فرض تیم عملیات و فروش',
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,title')
      .single();
    if (scheduleError) throw scheduleError;


    const { data: employees, error: employeeError } = await client
      .from('employees')
      .insert([
        {
          org_id: orgId,
          full_name: ownerName,
          first_name: ownerName.split(' ')[0] || ownerName,
          last_name: ownerName.split(' ').slice(1).join(' ') || 'مدیر',
          system_code: 'EMP-001',
          related_profile_id: assigneeId,
          employment_status: 'active',
          employment_type: 'full_time',
          salary_type: 'monthly',
          department: 'مدیریت',
          team: 'هسته اصلی',
          job_title: 'مدیر سازمان',
          mobile_1: ownerPhone || '09120000000',
          email: ownerEmail || null,
          default_work_schedule_id: workSchedule.id,
          expected_daily_minutes: 510,
          overtime_auto_approve: true,
          leave_auto_approve: true,
          mission_auto_approve: true,
          base_salary: 68000000,
          hourly_rate: 420000,
          overtime_rate: 650000,
          late_penalty_rate: 250000,
          bank_name: 'ملت',
          bank_account_number: '0102030405',
          iban: 'IR120000000000000000000000',
          created_by: caller.id,
          updated_by: caller.id,
        },
        {
          org_id: orgId,
          full_name: 'سارا نادری',
          first_name: 'سارا',
          last_name: 'نادری',
          system_code: 'EMP-002',
          employment_status: 'active',
          employment_type: 'full_time',
          salary_type: 'monthly',
          department: 'فروش',
          team: 'درآمد',
          job_title: 'کارشناس فروش',
          mobile_1: '09123334455',
          email: 's.naderi@example.com',
          default_work_schedule_id: workSchedule.id,
          expected_daily_minutes: 510,
          base_salary: 52000000,
          hourly_rate: 320000,
          overtime_rate: 510000,
          late_penalty_rate: 190000,
          bank_name: 'ملی',
          bank_account_number: '1102030405',
          iban: 'IR130000000000000000000000',
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id,full_name,base_salary,related_profile_id');
    if (employeeError) throw employeeError;


    const { data: attendanceLogs, error: attendanceError } = await client
      .from('attendance_logs')
      .insert([
        {
          org_id: orgId,
          employee_id: employees?.[0]?.id || null,
          related_profile_id: assigneeId,
          assignee_id: assigneeId,
          assignee_type: 'user',
          log_type: 'check_in',
          occurred_at: dateTimeIso(-1, 8, 37),
          source_type: 'manual',
          location_text: 'دفتر مرکزی',
          notes: 'ورود مدیر سازمان',
          created_by: caller.id,
          updated_by: caller.id,
        },
        {
          org_id: orgId,
          employee_id: employees?.[1]?.id || null,
          assignee_id: assigneeId,
          assignee_type: 'user',
          log_type: 'check_out',
          occurred_at: dateTimeIso(-1, 17, 42),
          source_type: 'manual',
          location_text: 'دفتر فروش',
          notes: 'ثبت خروج کارشناس فروش',
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id');
    if (attendanceError) throw attendanceError;


    const { data: leaveRequests, error: leaveError } = await client
      .from('leave_requests')
      .insert({
        org_id: orgId,
        employee_name: employees?.[1]?.full_name || 'کارشناس فروش',
        requester_name: employees?.[1]?.full_name || 'کارشناس فروش',
        employee_id: employees?.[1]?.id || null,
        status: 'approved',
        leave_type: 'daily',
        start_date: dateTimeIso(4, 9, 0),
        end_date: dateTimeIso(4, 18, 0),
        total_days: 1,
        total_minutes: 480,
        total_hours: 8,
        notes: 'مرخصی شخصی تاییدشده',
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id');
    if (leaveError) throw leaveError;


    const { data: overtimeRequests, error: overtimeError } = await client
      .from('overtime_requests')
      .insert({
        org_id: orgId,
        employee_id: employees?.[1]?.id || null,
        status: 'approved',
        work_date: todayIso(-2),
        start_time: '18:00',
        end_time: '20:30',
        total_minutes: 150,
        notes: 'اضافه‌کاری برای تکمیل گزارش فروش',
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id');
    if (overtimeError) throw overtimeError;


    const { data: missionRequests, error: missionError } = await client
      .from('mission_requests')
      .insert({
        org_id: orgId,
        employee_id: employees?.[0]?.id || null,
        status: 'approved',
        start_date: todayIso(7),
        end_date: todayIso(8),
        destination: 'اصفهان',
        notes: 'ماموریت برای جلسه راه‌اندازی شعبه دوم',
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id');
    if (missionError) throw missionError;


    const { data: applicants, error: applicantError } = await client
      .from('recruitment_applicants')
      .insert({
        org_id: orgId,
        name: 'مهسا عباسی',
        system_code: 'APP-001',
        status: 'interview',
        source: 'linkedin',
        position_title: 'کارشناس پشتیبانی',
        department: 'پشتیبانی',
        mobile: '09124445566',
        email: 'mahsa.abbasi@example.com',
        expected_salary: 36000000,
        interview_at: dateTimeIso(3, 11, 0),
        score: 82,
        assigned_reviewer_id: assigneeId,
        assignee_id: assigneeId,
        assignee_type: 'user',
        assignee_role_id: assigneeRoleId,
        notes: 'برای فاز رشد تیم پشتیبانی',
        process_template_id: processTemplate.id,
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,name')
      .single();
    if (applicantError) throw applicantError;


    const { data: contracts, error: contractError } = await client
      .from('employee_contracts')
      .insert({
        org_id: orgId,
        name: 'قرارداد کارشناس فروش - سارا نادری',
        system_code: 'CTR-001',
        contract_type: 'employment',
        status: 'active',
        employee_id: employees?.[1]?.id || null,
        applicant_id: applicants.id,
        assignee_id: assigneeId,
        assignee_type: 'user',
        assignee_role_id: assigneeRoleId,
        start_date: todayIso(-30),
        end_date: todayIso(335),
        base_salary: 52000000,
        work_location: 'دفتر فروش',
        title: 'قرارداد استخدام کارشناس فروش',
        body: 'نمونه قرارداد جهت نمایش خروجی‌های منابع انسانی و فرآیندها',
        terms: [
          { title: 'ساعت کاری', value: '۸:۳۰ تا ۱۷:۳۰' },
          { title: 'بیمه', value: 'از ماه اول فعال' },
        ],
        process_template_id: processTemplate.id,
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,name')
      .single();
    if (contractError) throw contractError;


    const baseSalary = Number(employees?.[1]?.base_salary || 0);
    const bonusAmount = 4500000;
    const penaltyAmount = 650000;
    const grossAmount = baseSalary + bonusAmount;
    const netAmount = grossAmount - penaltyAmount - 3570000;

    const { data: payrollSlip, error: payrollError } = await client
      .from('payroll_slips')
      .insert({
        org_id: orgId,
        name: 'فیش حقوق فروردین - سارا نادری',
        system_code: 'PAY-001',
        period_start: todayIso(-30),
        period_end: todayIso(-1),
        status: 'paid',
        employee_id: employees?.[1]?.id || null,
        assignee_id: assigneeId,
        assignee_type: 'user',
        assignee_role_id: assigneeRoleId,
        base_salary: baseSalary,
        task_wage_total: 1800000,
        bonus_total: bonusAmount,
        deduction_total: penaltyAmount,
        insurance_employee_amount: 3570000,
        insurance_employer_amount: 11730000,
        gross_amount: grossAmount,
        net_amount: netAmount,
        lines: buildPayrollLines(baseSalary, bonusAmount, penaltyAmount),
        payments: [{ date: todayIso(0), amount: netAmount, method: 'bank_transfer' }],
        performance_snapshot: {
          invoice_count: 2,
          collected_amount: 45000000,
          completed_tasks: 5,
        },
        task_ids: (tasks || []).slice(0, 2).map((task: any) => task.id),
        related_module_id: 'employees',
        related_record_id: employees?.[1]?.id || null,
        process_template_id: processTemplate.id,
        metadata: { seeded_demo: true },
        notes: 'فیش ثبت‌شده برای نمایش ماژول حقوق و دستمزد',
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,name')
      .single();
    if (payrollError) throw payrollError;


    const { data: bonusRequest, error: bonusError } = await client
      .from('employee_bonus_requests')
      .insert({
        org_id: orgId,
        title: 'پاداش تحقق هدف فروش ماهانه',
        employee_id: employees?.[1]?.id || null,
        request_date: todayIso(-2),
        effective_date: todayIso(-1),
        amount: bonusAmount,
        status: 'completed',
        assignee_id: assigneeId,
        related_payroll_slip_id: payrollSlip.id,
        reason: 'عبور از هدف فروش و وصول موفق',
        notes: 'برای نمایش ارتباط پاداش با فیش حقوق',
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,title')
      .single();
    if (bonusError) throw bonusError;


    const { data: penaltyRequest, error: penaltyError } = await client
      .from('employee_penalty_requests')
      .insert({
        org_id: orgId,
        title: 'جریمه تاخیر ثبت گزارش روزانه',
        employee_id: employees?.[1]?.id || null,
        request_date: todayIso(-4),
        effective_date: todayIso(-1),
        amount: penaltyAmount,
        status: 'completed',
        assignee_id: assigneeId,
        related_payroll_slip_id: payrollSlip.id,
        reason: 'تاخیر در ثبت گزارش فعالیت',
        notes: 'برای نمایش ارتباط جریمه با فیش حقوق',
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,title')
      .single();
    if (penaltyError) throw penaltyError;


    const { data: surveys, error: surveyError } = await client
      .from('surveys')
      .insert({
        org_id: orgId,
        title: 'نظرسنجی رضایت از شروع همکاری',
        status: 'new',
        survey_type: 'customer_success',
        respondent_name: 'علی مرادی',
        respondent_phone: '09125550001',
        respondent_email: 'customer.one@example.com',
        channel: 'web_form',
        overall_experience: 'good',
        recommendation_score: 9,
        favorite_aspects: ['پیگیری سریع', 'داشبورد فروش'],
        improvement_areas: ['جزئیات بیشتر در آموزش'],
        visit_datetime: dateTimeIso(-1, 14, 0),
        branch_location: 'دفتر مرکزی مشتری',
        follow_up_consent: true,
        comments: 'شروع همکاری خوب بود و تیم پشتیبانی پاسخ‌گو بود.',
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,title')
      .single();
    if (surveyError) throw surveyError;


    const seedWarnings: string[] = [];

    const { data: goals, error: goalsError } = await client
      .from('goals')
      .insert([
        {
          org_id: orgId,
          module_id: 'invoices',
          name: 'هدف فروش ماهانه دمو',
          description: 'مجموع فروش وصول‌شده برای نمایش کارت اهداف',
          goal_scope: 'team',
          period_unit: 'month',
          subperiod_unit: 'week',
          metric_type: 'sum',
          metric_field_key: 'total_received_amount',
          date_field_key: 'invoice_date',
          target_value: 60000000,
          levels_enabled: true,
          bronze_value: 30000000,
          silver_value: 45000000,
          gold_value: 60000000,
          assignee_user_ids: [assigneeId],
          assignee_role_ids: assigneeRoleId ? [assigneeRoleId] : [],
          conditions_all: [{ id: 'seed_goal_invoice_status', field: 'status', operator: 'in', value: ['completed', 'paid', 'settled'] }],
          conditions_any: [],
          config: { seed_key: 'demo_sales_goal_v1', is_seeded_default: true },
          is_active: true,
          created_by: caller.id,
          updated_by: caller.id,
        },
        {
          org_id: orgId,
          module_id: 'tasks',
          name: 'هدف اتمام فعالیت‌های کلیدی',
          description: 'برای نمایش پیشرفت اهداف عملیاتی',
          goal_scope: 'team',
          period_unit: 'month',
          subperiod_unit: 'week',
          metric_type: 'count',
          metric_field_key: 'id',
          date_field_key: 'created_at',
          target_value: 6,
          levels_enabled: true,
          bronze_value: 2,
          silver_value: 4,
          gold_value: 6,
          assignee_user_ids: [assigneeId],
          assignee_role_ids: assigneeRoleId ? [assigneeRoleId] : [],
          conditions_all: [{ id: 'seed_goal_task_done', field: 'status', operator: 'equals', value: 'done' }],
          conditions_any: [],
          config: { seed_key: 'demo_tasks_goal_v1', is_seeded_default: true },
          is_active: true,
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id,name');
    if (goalsError) {
      seedWarnings.push('نمونه‌های هدف‌گذاری ساخته نشدند؛ سایر نمونه‌ها آماده‌اند.');
    }

    await seedGeneralPackExtras(client, {
      orgId, userId: caller.id, customerId: customers[0].id, employeeId: employees[0].id,
      date: todayIso(), startAt: dateTimeIso(2, 10, 0), endAt: dateTimeIso(2, 11, 0),
    });
    // Every insert is already tracked atomically by insert_demo_seed_rows.
    await markBatchStatus(serviceClient, batchId, {
      status: 'seeded',
      metadata: {
        slug: context.saasSettings?.slug || null,
        pack_key: resolveDemoPack(context.company?.industry).key,
        completed_at: now().toISOString(),
        warnings: seedWarnings,
      },
    });

    return {
      success: true,
      batch_id: batchId,
      status: 'seeded',
      seeded_records_count: Number((await getActiveBatch(serviceClient, orgId))?.seeded_records_count || 0),
      has_seeded_batch: true,
      warning: seedWarnings.length ? seedWarnings.join(' | ') : null,
    };
  } catch (error) {
    await markBatchStatus(serviceClient, batchId, {
      status: 'failed',
      metadata: {
        slug: context.saasSettings?.slug || null,
        pack_key: resolveDemoPack(context.company?.industry).key,
        failed_at: now().toISOString(),
        error: getErrorMessage(error),
      },
    }).catch(() => null);
    throw error;
  }
};
