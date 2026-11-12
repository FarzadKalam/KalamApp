import { sharedRestSelect, canViewModuleWithPlan, normalizeId } from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

export const purchaseSupplySkill: DomainSkillModule = {
  agentKey: 'purchase_supply',
  titleFa: 'ایجنت خرید و تأمین',
  buildContractPrompt: () => [
    '## قرارداد تخصصی ایجنت خرید و تأمین',
    '1. **فاکتور خرید (`purchase_invoices`) و برگشت از خرید (`purchase_return_invoices` با `taxpayer_invoice_subject = 4`)**:',
    '   - تأمین‌کننده (`supplier_id`)، اقلام خرید، نرخ خرید قبلی کالا، قفسه/انبار مقصد (`warehouses`/`shelves`) و ربط به پروژه (`project_id`) یا فرآیند اجرا (`process_template_id`) را کنترل کن.',
    '   - برای برگشت از خرید، حتماً فاکتور خرید مرجع (`source_invoice_id`)، اقلام برگشتی و دلیل برگشت را پیش از ثبت نهایی تأیید بگیر.',
    '2. **پرداخت به تأمین‌کننده (`cash_bank_operations` با `operation_type = payment` و `purchase_invoice_id`)**:',
    '   - در تسویه یا ثبت رسید پرداخت به تأمین‌کننده، حساب مبدا (بانک/صندوق/تنخواه)، مبلغ مانده و تاریخ را تطبیق بده و پیش از ثبت تأیید بگیر.',
    '3. **پایش موجودی انبار**: کالاهای با موجودی کم یا کسری مرتبط با پروژه‌های باز را شناسایی کن و فهرست تأمین پیشنهاد بده.',
  ].join('\n'),
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    if (!orgId || ctx.grounding.freeChatMode) return null;
    const perms = ctx.authContext?.permissions;
    const plan = ctx.grounding.planContext;
    const bundle: Record<string, any> = {};

    const [suppliers, purchaseInvoices, lowStockProducts] = await Promise.all([
      canViewModuleWithPlan(plan, perms, 'suppliers')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'suppliers', {
            org_id: `eq.${orgId}`,
            select: 'id,full_name,business_name,name,system_code,mobile_1',
            order: 'updated_at.desc',
            limit: 10,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'purchase_invoices')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'purchase_invoices', {
            org_id: `eq.${orgId}`,
            select: 'id,name,system_code,supplier_id,status,taxpayer_invoice_subject,total_invoice_amount,remaining_balance,invoice_date',
            order: 'updated_at.desc',
            limit: 10,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'products')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'products', {
            org_id: `eq.${orgId}`,
            select: 'id,name,system_code,buy_price,stock,main_unit',
            order: 'stock.asc.nullslast',
            limit: 10,
          })
        : Promise.resolve([]),
    ]);

    if (suppliers.length) bundle.suppliers_sample = suppliers;
    if (purchaseInvoices.length) bundle.recent_purchase_invoices = purchaseInvoices;
    if (lowStockProducts.length) bundle.low_stock_products = lowStockProducts;
    return bundle;
  },
};
