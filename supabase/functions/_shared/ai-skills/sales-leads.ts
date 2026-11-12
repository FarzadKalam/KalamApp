import { sharedRestSelect, canViewModuleWithPlan, normalizeId } from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

export type PriceOption = {
  source: 'product_base' | 'price_list' | 'customer_last_invoice';
  labelFa: string;
  price: number;
  priceListId?: string | null;
  referenceCode?: string | null;
};

export const buildThreeSourcePriceComparison = (params: {
  product: any;
  priceLists: any[];
  customerLastInvoices: any[];
  customerId?: string | null;
}): {
  productName: string;
  systemCode: string | null;
  options: PriceOption[];
  hasMismatch: boolean;
  needsUserChoice: boolean;
} => {
  const productId = String(params.product?.id || '').trim();
  const productName = String(params.product?.name || params.product?.title || 'کالا').trim();
  const systemCode = params.product?.system_code ? String(params.product.system_code) : null;
  const options: PriceOption[] = [];

  const basePrice = Number(params.product?.sell_price ?? params.product?.sale_price ?? params.product?.price ?? 0);
  if (Number.isFinite(basePrice) && basePrice > 0) {
    options.push({
      source: 'product_base',
      labelFa: 'قیمت پایه محصول',
      price: basePrice,
    });
  }

  for (const list of params.priceLists || []) {
    const items = Array.isArray(list?.items)
      ? list.items
      : Array.isArray(list?.products)
      ? list.products
      : [];
    const matchedItem = items.find((item: any) => String(item?.product_id || item?.id || '').trim() === productId);
    const listPrice = Number(matchedItem?.price ?? matchedItem?.sell_price ?? matchedItem?.unit_price ?? 0);
    if (Number.isFinite(listPrice) && listPrice > 0) {
      options.push({
        source: 'price_list',
        labelFa: `لیست قیمت «${String(list?.name || list?.system_code || 'فروش')}»`,
        price: listPrice,
        priceListId: String(list.id),
        referenceCode: list?.system_code ? String(list.system_code) : null,
      });
    }
  }

  if (params.customerId) {
    for (const inv of params.customerLastInvoices || []) {
      const invItems = Array.isArray(inv?.invoiceItems) ? inv.invoiceItems : [];
      const matched = invItems.find((item: any) => String(item?.product_id || '').trim() === productId);
      const lastPrice = Number(matched?.unit_price ?? matched?.price ?? 0);
      if (Number.isFinite(lastPrice) && lastPrice > 0) {
        options.push({
          source: 'customer_last_invoice',
          labelFa: `آخرین فروش به این مشتری (${String(inv?.system_code || inv?.name || 'فاکتور قبلی')})`,
          price: lastPrice,
          referenceCode: inv?.system_code ? String(inv.system_code) : null,
        });
        break;
      }
    }
  }

  const distinctPrices = Array.from(new Set(options.map((o) => o.price)));
  const hasMismatch = distinctPrices.length > 1;
  return {
    productName,
    systemCode,
    options,
    hasMismatch,
    needsUserChoice: hasMismatch || options.length === 0,
  };
};

export const recommendComplementaryProducts = (params: {
  selectedProductIds: string[];
  bundles: any[];
  products: any[];
  recentInvoices?: any[];
}): Array<{ productId: string; name: string; systemCode: string | null; reasonFa: string; stock: number; sellPrice: number }> => {
  const selected = new Set((params.selectedProductIds || []).filter(Boolean));
  if (!selected.size) return [];
  const productMap = new Map((params.products || []).map((p) => [String(p.id), p]));
  const scoreMap = new Map<string, { score: number; reasonFa: string }>();

  for (const bundle of params.bundles || []) {
    const bundleItems = Array.isArray(bundle?.items)
      ? bundle.items
      : Array.isArray(bundle?.products)
      ? bundle.products
      : [];
    const ids: string[] = bundleItems.map((it: any) => String(it?.product_id || it?.id || '').trim()).filter(Boolean);
    const overlaps = ids.some((id: string) => selected.has(id));
    if (!overlaps) continue;
    for (const id of ids) {
      if (selected.has(id)) continue;
      const prev = scoreMap.get(id) || { score: 0, reasonFa: '' };
      scoreMap.set(id, {
        score: prev.score + 5,
        reasonFa: `همراه پکیج «${String(bundle?.name || 'فروش')}»`,
      });
    }
  }

  for (const inv of params.recentInvoices || []) {
    const invItems = Array.isArray(inv?.invoiceItems) ? inv.invoiceItems : [];
    const ids: string[] = invItems.map((it: any) => String(it?.product_id || '').trim()).filter(Boolean);
    if (!ids.some((id: string) => selected.has(id))) continue;
    for (const id of ids) {
      if (selected.has(id)) continue;
      const prev = scoreMap.get(id) || { score: 0, reasonFa: '' };
      scoreMap.set(id, {
        score: prev.score + 2,
        reasonFa: prev.reasonFa || 'اقلام پرکاربرد همراه این سفارش در فاکتورهای اخیر',
      });
    }
  }

  return Array.from(scoreMap.entries())
    .map(([productId, info]) => {
      const product = productMap.get(productId);
      if (!product) return null;
      const stock = Number(product?.stock ?? product?.inventory_count ?? 1);
      if (stock <= 0) return null;
      return {
        productId,
        name: String(product?.name || product?.title || 'محصول'),
        systemCode: product?.system_code ? String(product.system_code) : null,
        reasonFa: info.reasonFa,
        stock,
        sellPrice: Number(product?.sell_price ?? product?.sale_price ?? product?.price ?? 0),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 5);
};

export const salesLeadsSkill: DomainSkillModule = {
  agentKey: 'sales_leads',
  titleFa: 'ایجنت فروش و لید',
  buildContractPrompt: () => [
    '## قرارداد تخصصی ایجنت فروش و لید',
    '1. **پیش‌فاکتور و فاکتور فروش (`invoices`)**:',
    '   - همیشه نرخ کالا را از ۳ منبع «قیمت پایه محصول»، «لیست‌های قیمت فعال» و «آخرین فروش به همان مشتری» بررسی کن. اگر بین قیمت‌ها تفاوت بود یا کاربر اولویت را تعیین نکرده، قیمت‌ها را مقایسه کن و از کاربر بپرس کدام اعمال شود.',
    '   - پس از مشخص شدن اقلام اولیه، بر اساس پکیج‌های فروش (`product_bundles`) و خریدهای هم‌زمان قبلی (فقط کالاهای موجود)، حداکثر ۲ تا ۳ پیشنهاد مکمل مفید ارائه بده.',
    '   - جدول دریافت‌ها (`payments`: `payment_type`, `target_account`, `amount`, `date`, `status`, `description`, یا `cheque_id`/`barter_id`) را همراه فاکتور تنظیم کن.',
    '2. **تسویه فاکتور با رسید پرداخت**:',
    '   - در سناریوی «فاکتور فلانی رو تسویه کن اینم رسید پرداختش»، ابتدا مشتری و فاکتورهای باز (`remaining_balance > 0`) را پیدا کن؛ مبلغ/تاریخ/بانک و پیوست رسید را با مبلغ مانده تطبیق بده، حساب مقصد را اگر مشخص نیست بپرس، و ردیف دریافت روی `payments` فاکتور و رکورد `cash_bank_operations` (`operation_type = receipt`, `sales_invoice_id`) پیشنهاد/ثبت کن.',
    '3. **برگشت از فروش (`sales_return_invoices` روی جدول `invoices` با `taxpayer_invoice_subject = 4`)**:',
    '   - حتماً فاکتور مرجع (`source_invoice_id`)، مشتری و اقلام/مقادیر برگشتی و دلیل عودت را کنترل و پیش‌نویس را برای تأیید ارائه کن.',
    '4. **ساخت پروژه پس از فروش (`projects` + `process_template_id`)**:',
    '   - برای سفارش‌های اجرایی/خدماتی، الگوهای فرآیند مرتبط (`process_templates`) را پیشنهاد بده و پس از تأیید، پروژه متصل به مشتری، فاکتور و الگو بساز.',
    '5. **لیدها (`marketing_leads`)**: تحلیل وضعیت، پیشنهاد تماس/پیگیری و ثبت فعالیت پیگیری.',
  ].join('\n'),
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    if (!orgId || ctx.grounding.freeChatMode) return null;
    const perms = ctx.authContext?.permissions;
    const plan = ctx.grounding.planContext;
    const bundle: Record<string, any> = {};

    const [
      customers,
      products,
      priceLists,
      bundles,
      openInvoices,
      openLeads,
      processTemplates,
    ] = await Promise.all([
      canViewModuleWithPlan(plan, perms, 'customers')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'customers', {
            org_id: `eq.${orgId}`,
            select: 'id,full_name,business_name,name,system_code,mobile_1',
            order: 'updated_at.desc',
            limit: 12,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'products')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'products', {
            org_id: `eq.${orgId}`,
            select: 'id,name,system_code,sell_price,buy_price,stock,main_unit',
            order: 'updated_at.desc',
            limit: 15,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'price_lists')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'price_lists', {
            org_id: `eq.${orgId}`,
            select: 'id,name,system_code,status,items',
            order: 'updated_at.desc',
            limit: 8,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'product_bundles')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'product_bundles', {
            org_id: `eq.${orgId}`,
            select: 'id,name,bundle_number,products',
            limit: 8,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'invoices')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'invoices', {
            org_id: `eq.${orgId}`,
            select: 'id,name,system_code,customer_id,status,taxpayer_invoice_subject,total_invoice_amount,total_received_amount,remaining_balance,invoice_date',
            order: 'updated_at.desc',
            limit: 12,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'marketing_leads')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'marketing_leads', {
            org_id: `eq.${orgId}`,
            select: 'id,full_name,business_name,name,system_code,status,mobile_1,updated_at',
            order: 'updated_at.desc',
            limit: 10,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'process_templates')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'process_templates', {
            org_id: `eq.${orgId}`,
            is_active: 'eq.true',
            select: 'id,name,module_id,module_ids',
            limit: 12,
          })
        : Promise.resolve([]),
    ]);

    if (customers.length) bundle.customers_sample = customers;
    if (products.length) bundle.products_sample = products;
    if (priceLists.length) bundle.price_lists = priceLists.map((p) => ({ name: p.name, system_code: p.system_code, status: p.status }));
    if (bundles.length) bundle.product_bundles_count = bundles.length;
    if (openInvoices.length) bundle.recent_invoices = openInvoices;
    if (openLeads.length) bundle.recent_leads = openLeads;
    if (processTemplates.length) {
      bundle.project_process_templates = processTemplates.filter(
        (t) => t.module_id === 'projects' || (Array.isArray(t.module_ids) && t.module_ids.includes('projects')),
      );
    }

    return bundle;
  },
};
