// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

type DemoDataAction = 'seed_org_demo_data' | 'clear_org_demo_data' | 'get_demo_seed_status';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const ALLOWED_DEMO_ROLES = new Set(['super_admin', 'admin', 'manager']);

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

const asLocalPhone = (e164?: string | null) =>
  String(e164 || '').replace(/^\+98/, '0');

const normalizeEmail = (value?: string | null) =>
  String(value || '').trim().toLowerCase();

const normalizeRole = (value?: string | null) =>
  String(value || '').trim().toLowerCase();

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

const createServiceClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase function secrets are not configured.');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const getBearerToken = (request: Request) =>
  String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

const verifyCaller = async (client: any, request: Request) => {
  const token = getBearerToken(request);
  if (!token) {
    throw new Error('درخواست احراز هویت نشده است.');
  }
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw new Error('درخواست احراز هویت نشده است.');
  }
  return data.user;
};

const requireCallerOrgAccess = async (client: any, callerUserId: string) => {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, org_id, role, role_id, full_name, email, mobile_1')
    .eq('id', callerUserId)
    .maybeSingle();
  if (profileError || !profile?.id || !profile?.org_id) {
    throw new Error('پروفایل کاربر یا سازمان جاری پیدا نشد.');
  }
  if (!ALLOWED_DEMO_ROLES.has(normalizeRole(profile.role))) {
    throw new Error('دسترسی کافی برای مدیریت داده‌های دمو ندارید.');
  }

  const { data: saasSettings, error: saasError } = await client
    .from('saas_org_settings')
    .select('org_id, slug, is_demo')
    .eq('org_id', profile.org_id)
    .maybeSingle();
  if (saasError || !saasSettings?.org_id) {
    throw new Error('تنظیمات SaaS سازمان پیدا نشد.');
  }
  if (saasSettings.is_demo !== true) {
    throw new Error('داده‌های دمو فقط برای سازمان‌های دمو قابل مدیریت است.');
  }

  const { data: company } = await client
    .from('company_settings')
    .select('company_full_name, trade_name, email, mobile, brand_palette_key')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    profile,
    saasSettings,
    company: company || null,
  };
};

const getActiveBatch = async (client: any, orgId: string) => {
  const { data } = await client
    .from('demo_seed_batches')
    .select('id, status, seeded_records_count, pack_key, created_at, cleared_at')
    .eq('org_id', orgId)
    .eq('status', 'seeded')
    .is('cleared_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
};

const createBatch = async (client: any, orgId: string, callerUserId: string, metadata: Record<string, any>) => {
  const { data, error } = await client
    .from('demo_seed_batches')
    .insert({
      org_id: orgId,
      pack_key: 'general_v1',
      industry_key: String(metadata.industry || '').trim() || null,
      status: 'seeding',
      metadata,
      seeded_by: callerUserId,
    })
    .select('id')
    .single();
  if (error || !data?.id) throw error || new Error('ایجاد batch داده دمو ناموفق بود.');
  return String(data.id);
};

const registerRows = async (client: any, batchId: string, orgId: string, items: Array<Record<string, any>>) => {
  if (!items.length) return;
  const payload = items.map((item) => ({
    batch_id: batchId,
    org_id: orgId,
    table_name: item.table_name,
    record_id: item.record_id,
    delete_order: item.delete_order,
    label: item.label || null,
    metadata: item.metadata || {},
  }));
  const { error } = await client.from('demo_seed_records').insert(payload);
  if (error) throw error;
};

const markBatchStatus = async (client: any, batchId: string, patch: Record<string, any>) => {
  const { error } = await client.from('demo_seed_batches').update(patch).eq('id', batchId);
  if (error) throw error;
};

const appendTrackedRows = (
  trackedRows: Array<Record<string, any>>,
  tableName: string,
  rows: any[],
  deleteOrder: number,
  labelKey = 'name'
) => {
  rows.forEach((row) => {
    trackedRows.push({
      table_name: tableName,
      record_id: row.id,
      delete_order: deleteOrder,
      label: String(row?.[labelKey] || row?.title || row?.full_name || row?.business_name || row.id || '').trim() || null,
    });
  });
};

const seedOrgDemoData = async (client: any, caller: any, context: any) => {
  const orgId = String(context.profile.org_id);
  const existingBatch = await getActiveBatch(client, orgId);
  if (existingBatch?.id) {
    return {
      success: true,
      batch_id: existingBatch.id,
      status: 'seeded',
      seeded_records_count: Number(existingBatch.seeded_records_count || 0),
      has_seeded_batch: true,
      warning: null,
    };
  }

  const batchId = await createBatch(client, orgId, caller.id, {
    slug: context.saasSettings?.slug || null,
    company_name: context.company?.company_full_name || context.company?.trade_name || context.profile?.full_name || null,
    industry: context.company?.industry || null,
  });

  const trackedRows: Array<Record<string, any>> = [];

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
    appendTrackedRows(trackedRows, 'warehouses', warehouses || [], 190);

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
    appendTrackedRows(trackedRows, 'shelves', shelves || [], 189);

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
    appendTrackedRows(trackedRows, 'suppliers', suppliers || [], 180, 'business_name');

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
          sale_price: 18500000,
          purchase_price: 11200000,
          min_stock: 3,
          current_stock: 12,
          preferred_stock: 20,
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
          sale_price: 26500000,
          purchase_price: 17500000,
          min_stock: 2,
          current_stock: 8,
          preferred_stock: 12,
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
          sale_price: 9500000,
          purchase_price: 4200000,
          min_stock: 1,
          current_stock: 5,
          preferred_stock: 8,
          created_by: caller.id,
          updated_by: caller.id,
        },
      ])
      .select('id,name,sale_price');
    if (productError) throw productError;
    appendTrackedRows(trackedRows, 'products', products || [], 175);

    const { data: priceLists, error: priceListError } = await client
      .from('price_lists')
      .insert({
        org_id: orgId,
        name: 'لیست قیمت شروع سریع',
        status: 'active',
        description: 'لیست قیمت اولیه برای نمایش فرآیند فروش و خرید',
        items: (products || []).map((product: any, index: number) => ({
          product_id: product.id,
          price: Number(product.sale_price || 0),
          discount_percent: index === 0 ? 5 : 0,
        })),
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select('id,name');
    if (priceListError) throw priceListError;
    appendTrackedRows(trackedRows, 'price_lists', priceLists ? [priceLists] : [], 170);

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
    appendTrackedRows(trackedRows, 'product_bundles', bundles ? [bundles] : [], 165);

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
      appendTrackedRows(trackedRows, 'bundle_items', bundleItems || [], 164, 'id');
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
    appendTrackedRows(trackedRows, 'customers', customers || [], 160, 'full_name');

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
    appendTrackedRows(trackedRows, 'marketing_leads', marketingLeads || [], 158);

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
    appendTrackedRows(trackedRows, 'process_templates', processTemplate ? [processTemplate] : [], 150);

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
    appendTrackedRows(trackedRows, 'process_template_stages', templateStages || [], 149, 'stage_name');

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
    appendTrackedRows(trackedRows, 'projects', projects ? [projects] : [], 145);

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
    appendTrackedRows(trackedRows, 'project_members', projectMembers ? [projectMembers] : [], 144, 'id');

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
    appendTrackedRows(trackedRows, 'process_runs', processRun ? [processRun] : [], 143, 'process_name');

    await client.from('projects').update({ process_run_id: processRun.id }).eq('id', projects.id);

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
    appendTrackedRows(trackedRows, 'process_run_stages', processRunStages || [], 142, 'stage_name');

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
    appendTrackedRows(trackedRows, 'tasks', tasks || [], 141);

    if (processRunStages?.[0]?.id && tasks?.[0]?.id) {
      await client.from('process_run_stages').update({ task_id: tasks[0].id }).eq('id', processRunStages[0].id);
    }
    if (processRunStages?.[1]?.id && tasks?.[1]?.id) {
      await client.from('process_run_stages').update({ task_id: tasks[1].id }).eq('id', processRunStages[1].id);
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
    appendTrackedRows(trackedRows, 'invoices', invoices ? [invoices] : [], 138);

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
        notify_supplier: true,
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
    appendTrackedRows(trackedRows, 'purchase_invoices', purchaseInvoices ? [purchaseInvoices] : [], 137);

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
    appendTrackedRows(trackedRows, 'secretariat_documents', secretariatDocs ? [secretariatDocs] : [], 136);

    const { data: deliveryForms, error: deliveryError } = await client
      .from('delivery_forms')
      .insert({
        org_id: orgId,
        name: 'فرم تحویل بسته شروع فروش',
        system_code: 'DLV-001',
        form_type: 'goods_delivery',
        status: 'approved',
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
    appendTrackedRows(trackedRows, 'delivery_forms', deliveryForms ? [deliveryForms] : [], 135);

    const { data: stockTransfers, error: transferError } = await client
      .from('stock_transfers')
      .insert({
        org_id: orgId,
        name: 'انتقال آماده‌سازی تحویل',
        system_code: 'TRN-001',
        status: 'completed',
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
    appendTrackedRows(trackedRows, 'stock_transfers', stockTransfers ? [stockTransfers] : [], 134);

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
    appendTrackedRows(trackedRows, 'work_schedules', workSchedule ? [workSchedule] : [], 128, 'title');

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
    appendTrackedRows(trackedRows, 'employees', employees || [], 126, 'full_name');

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
    appendTrackedRows(trackedRows, 'attendance_logs', attendanceLogs || [], 124, 'id');

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
    appendTrackedRows(trackedRows, 'leave_requests', leaveRequests ? [leaveRequests] : [], 122, 'id');

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
    appendTrackedRows(trackedRows, 'overtime_requests', overtimeRequests ? [overtimeRequests] : [], 121, 'id');

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
    appendTrackedRows(trackedRows, 'mission_requests', missionRequests ? [missionRequests] : [], 120, 'id');

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
    appendTrackedRows(trackedRows, 'recruitment_applicants', applicants ? [applicants] : [], 118);

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
    appendTrackedRows(trackedRows, 'employee_contracts', contracts ? [contracts] : [], 116);

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
    appendTrackedRows(trackedRows, 'payroll_slips', payrollSlip ? [payrollSlip] : [], 114);

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
    appendTrackedRows(trackedRows, 'employee_bonus_requests', bonusRequest ? [bonusRequest] : [], 113, 'title');

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
    appendTrackedRows(trackedRows, 'employee_penalty_requests', penaltyRequest ? [penaltyRequest] : [], 112, 'title');

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
    appendTrackedRows(trackedRows, 'surveys', surveys ? [surveys] : [], 110, 'title');

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
    if (goalsError) throw goalsError;
    appendTrackedRows(trackedRows, 'goals', goals || [], 108);

    await registerRows(client, batchId, orgId, trackedRows);
    await markBatchStatus(client, batchId, {
      status: 'seeded',
      seeded_records_count: trackedRows.length,
      metadata: {
        slug: context.saasSettings?.slug || null,
        pack_key: 'general_v1',
        completed_at: now().toISOString(),
      },
    });

    return {
      success: true,
      batch_id: batchId,
      status: 'seeded',
      seeded_records_count: trackedRows.length,
      has_seeded_batch: true,
      warning: null,
    };
  } catch (error) {
    await markBatchStatus(client, batchId, {
      status: 'failed',
      metadata: {
        slug: context.saasSettings?.slug || null,
        pack_key: 'general_v1',
        failed_at: now().toISOString(),
        error: String(error?.message || error || 'unknown_error'),
      },
    }).catch(() => null);
    throw error;
  }
};

const clearSeededDemoData = async (client: any, caller: any, context: any) => {
  const orgId = String(context.profile.org_id);
  const activeBatch = await getActiveBatch(client, orgId);
  if (!activeBatch?.id) {
    return {
      success: true,
      batch_id: null,
      status: 'cleared',
      seeded_records_count: 0,
      has_seeded_batch: false,
    };
  }

  await markBatchStatus(client, activeBatch.id, { status: 'clearing' });

  try {
    const { data: records, error: recordError } = await client
      .from('demo_seed_records')
      .select('id, table_name, record_id, delete_order')
      .eq('batch_id', activeBatch.id)
      .eq('org_id', orgId)
      .order('delete_order', { ascending: false })
      .order('created_at', { ascending: false });
    if (recordError) throw recordError;

    for (const record of records || []) {
      const { error } = await client
        .from(String(record.table_name))
        .delete()
        .eq('id', record.record_id)
        .eq('org_id', orgId);
      if (error) {
        throw new Error(`${record.table_name}: ${error.message}`);
      }
    }

    await markBatchStatus(client, activeBatch.id, {
      status: 'cleared',
      cleared_by: caller.id,
      cleared_at: now().toISOString(),
    });

    return {
      success: true,
      batch_id: activeBatch.id,
      status: 'cleared',
      seeded_records_count: Number(activeBatch.seeded_records_count || 0),
      has_seeded_batch: false,
    };
  } catch (error) {
    await markBatchStatus(client, activeBatch.id, { status: 'failed' }).catch(() => null);
    throw error;
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const client = createServiceClient();
    const caller = await verifyCaller(client, request);
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim() as DemoDataAction;
    const context = await requireCallerOrgAccess(client, caller.id);

    if (action === 'get_demo_seed_status') {
      const activeBatch = await getActiveBatch(client, String(context.profile.org_id));
      return json(200, {
        success: true,
        is_demo: true,
        slug: context.saasSettings?.slug || null,
        has_seeded_batch: !!activeBatch?.id,
        batch_id: activeBatch?.id || null,
        status: activeBatch?.status || null,
        seeded_records_count: Number(activeBatch?.seeded_records_count || 0),
        pack_key: activeBatch?.pack_key || null,
      });
    }

    if (action === 'seed_org_demo_data') {
      const result = await seedOrgDemoData(client, caller, context);
      return json(200, {
        ...result,
        is_demo: true,
        slug: context.saasSettings?.slug || null,
      });
    }

    if (action === 'clear_org_demo_data') {
      const result = await clearSeededDemoData(client, caller, context);
      return json(200, {
        ...result,
        is_demo: true,
        slug: context.saasSettings?.slug || null,
      });
    }

    return json(400, {
      success: false,
      message: 'action نامعتبر است.',
    });
  } catch (error) {
    return json(400, {
      success: false,
      message: String(error?.message || error || 'اجرای سرویس داده دمو ناموفق بود.'),
    });
  }
});
