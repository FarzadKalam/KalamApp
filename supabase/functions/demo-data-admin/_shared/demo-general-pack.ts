/** Connected examples for the general pack. Industry-specific packs can replace this builder. */
export async function seedGeneralPackExtras(client: any, context: {
  orgId: string; userId: string; customerId: string; employeeId: string; date: string; startAt: string; endAt: string;
}) {
  const common = { org_id: context.orgId, created_by: context.userId, updated_by: context.userId };
  const save = async (table: string, data: any) => {
    const result = await client.from(table).insert(data).select('id').single();
    if (result.error) throw result.error;
    return result.data;
  };
  const management = await save('org_roles', { org_id: context.orgId, title: 'مدیریت نمونه', is_system: false, permissions: { __settings_tabs: { view: false, edit: false }, __saas_admin: { view: false, edit: false } } });
  await save('org_roles', { org_id: context.orgId, title: 'فروش نمونه', parent_id: management.id, is_system: false, permissions: { __settings_tabs: { view: false, edit: false }, __saas_admin: { view: false, edit: false } } });
  await save('org_roles', { org_id: context.orgId, title: 'پشتیبانی نمونه', parent_id: management.id, is_system: false, permissions: { __settings_tabs: { view: false, edit: false }, __saas_admin: { view: false, edit: false } } });
  await save('products', { ...common, name: 'بسته لوازم اداری نمونه', product_type: 'goods', status: 'active', main_unit: 'بسته', sell_price: 1200000, buy_price: 850000, description: 'کالای نمونه برای تمرین ثبت خرید و فروش؛ موجودی را با عملیات انبار ثبت کنید.' });
  await save('expense_documents', { ...common, name: 'هزینه ارسال سفارش نمونه', expense_date: context.date, status: 'draft', expense_type: 'general', counterparty_type: 'other', customer_id: context.customerId, assignee_id: context.userId,
    items: [{ description: 'بسته‌بندی و ارسال سفارش', quantity: 1, unit_price: 250000, total_price: 250000 }], total_amount: 250000, remaining_amount: 250000, notes: 'پیش‌نویس نمونه؛ پس از بررسی می‌توانید تکمیلش کنید.' });
  const room = await save('reservation_resources', { ...common, name: 'اتاق جلسه نمونه', resource_type: 'room', capacity: 6, description: 'برای تمرین رزرو جلسه نیازسنجی مشتری' });
  await save('reservations', { ...common, name: 'جلسه نیازسنجی مشتری نمونه', status: 'pending', customer_id: context.customerId, assignee_id: context.userId, start_at: context.startAt, end_at: context.endAt,
    reservationItems: [{ resource_id: room.id, quantity: 1 }], notes: 'نمونهٔ ارتباط رزرو با مشتری؛ زمان و منبع را در فرم بررسی کنید.' });
  await save('workflows', { ...common, name: 'نمونه پیگیری مشتری جدید', module_id: 'customers', trigger_type: 'on_create', execution_mode: 'first_match', is_active: false,
    conditions_all: [], conditions_any: [], actions: [], description: 'این نمونه غیرفعال است. در ویرایشگر اتوماسیون، اقدام ساخت فعالیت پیگیری را اضافه، مسئول را انتخاب و سپس فعال کنید.' });
}
