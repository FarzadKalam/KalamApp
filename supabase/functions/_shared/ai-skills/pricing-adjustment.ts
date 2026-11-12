import { canViewModuleWithPlan, normalizeId, sharedRestSelect } from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

export type PriceAdjustmentMode =
  | 'percent_increase'
  | 'percent_decrease'
  | 'fixed_delta'
  | 'set_price';

export type BundleDiscountMode = 'keep_ratio' | 'keep_amount' | 'clear_discount';

export type PriceAdjustmentScope =
  | 'products'
  | 'price_lists'
  | 'product_bundles'
  | 'proforma_invoices';

export type PriceAdjustmentTargetItem = {
  productId: string;
  mode: PriceAdjustmentMode;
  value: number;
  roundingStep?: number;
  alsoUpdateBuyPrice?: boolean;
};

export const PRICING_ADJUSTMENT_KEYWORDS_REGEX =
  /(تغییر\s*قیمت|تنظیم\s*قیمت|افزایش\s*قیمت|کاهش\s*قیمت|اصلاح\s*قیمت|درصد.*(افزایش|کاهش|تغییر|ببر\s*بالا|بیار\s*پایین|گرون|ارزون)|(افزایش|کاهش)\s*(بد|کن)|لیست\s*قیمت.*(تغییر|افزایش|کاهش)|پیش[‌ ]?فاکتور.*قیمت|پکیج.*قیمت|برچسب.*قیمت|اسکرین[‌ ]?شات.*قیمت)/i;

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const roundAdjustedPrice = (
  rawPrice: number,
  roundingStep = 1,
): number => {
  const safe = Math.max(0, Number.isFinite(rawPrice) ? rawPrice : 0);
  const step = Math.max(1, Math.floor(toFiniteNumber(roundingStep, 1)));
  if (step <= 1) return Math.round(safe);
  return Math.max(0, Math.round(safe / step) * step);
};

export const computeAdjustedUnitPrice = (
  currentPrice: number,
  params: {
    mode: PriceAdjustmentMode;
    value: number;
    roundingStep?: number;
  },
): number => {
  const base = Math.max(0, toFiniteNumber(currentPrice, 0));
  const value = toFiniteNumber(params.value, 0);
  let next = base;

  switch (params.mode) {
    case 'percent_increase':
      next = base * (1 + value / 100);
      break;
    case 'percent_decrease':
      next = base * Math.max(0, 1 - value / 100);
      break;
    case 'fixed_delta':
      next = Math.max(0, base + value);
      break;
    case 'set_price':
      next = Math.max(0, value);
      break;
  }

  return roundAdjustedPrice(next, params.roundingStep);
};

export const recalculateBundleRowForPriceChange = (params: {
  row: Record<string, any>;
  nextUnitPrice: number;
  discountMode?: BundleDiscountMode;
}) => {
  const row = { ...(params.row || {}) };
  const qty = Math.max(
    0,
    toFiniteNumber(row.quantity ?? row.qty ?? row.usage, 1) || 1,
  );
  const oldUnitPrice = Math.max(0, toFiniteNumber(row.unit_price ?? row.price, 0));
  const nextUnitPrice = Math.max(0, toFiniteNumber(params.nextUnitPrice, oldUnitPrice));

  const oldGross = qty * oldUnitPrice;
  const newGross = qty * nextUnitPrice;
  const discountType = String(row.discount_type || 'amount').trim().toLowerCase() === 'percent'
    ? 'percent'
    : 'amount';
  const rawOldDiscount = Math.max(0, toFiniteNumber(row.discount, 0));
  const mode: BundleDiscountMode = params.discountMode || 'keep_ratio';

  let nextDiscountType: 'amount' | 'percent' = discountType;
  let nextDiscount = rawOldDiscount;
  let discountAmount = 0;

  if (mode === 'clear_discount') {
    nextDiscount = 0;
    discountAmount = 0;
  } else if (discountType === 'percent') {
    const pct = Math.min(100, rawOldDiscount);
    const oldDiscountAmount = oldGross * (pct / 100);
    if (mode === 'keep_amount') {
      nextDiscountType = 'amount';
      discountAmount = Math.min(newGross, Math.round(oldDiscountAmount));
      nextDiscount = discountAmount;
    } else {
      nextDiscountType = 'percent';
      nextDiscount = pct;
      discountAmount = newGross * (pct / 100);
    }
  } else {
    if (mode === 'keep_ratio') {
      if (oldGross > 0 && rawOldDiscount > 0) {
        const ratio = Math.min(1, rawOldDiscount / oldGross);
        discountAmount = Math.min(newGross, Math.round(newGross * ratio));
      } else {
        discountAmount = 0;
      }
      nextDiscount = discountAmount;
    } else {
      // keep_amount
      discountAmount = Math.min(newGross, rawOldDiscount);
      nextDiscount = rawOldDiscount > newGross ? newGross : rawOldDiscount;
    }
  }

  const nextTotalPrice = Math.max(0, Math.round(newGross - discountAmount));
  return {
    ...row,
    unit_price: nextUnitPrice,
    discount_type: nextDiscountType,
    discount: nextDiscount,
    total_price: nextTotalPrice,
  };
};

export const recalculateInvoiceRowForPriceChange = (params: {
  row: Record<string, any>;
  nextUnitPrice: number;
  preserveRowDiscountMode?: BundleDiscountMode;
}) => {
  const row = { ...(params.row || {}) };
  const lengthVal = toFiniteNumber(row.length, NaN);
  const widthVal = toFiniteNumber(row.width, NaN);
  const areaUsage = Number.isFinite(lengthVal) && Number.isFinite(widthVal) ? lengthVal * widthVal : null;
  const qty = toFiniteNumber(
    row.quantity ?? row.usage ?? areaUsage ?? row.qty ?? row.stock,
    0,
  );
  const oldUnitPrice = Math.max(0, toFiniteNumber(row.unit_price ?? row.buy_price ?? row.price, 0));
  const nextUnitPrice = Math.max(0, toFiniteNumber(params.nextUnitPrice, oldUnitPrice));

  const oldGross = qty * oldUnitPrice;
  const newGross = qty * nextUnitPrice;
  const discountType = String(row.discount_type || 'amount').trim().toLowerCase() === 'percent'
    ? 'percent'
    : 'amount';
  const oldDiscount = Math.max(0, toFiniteNumber(row.discount, 0));
  const preserveMode: BundleDiscountMode = params.preserveRowDiscountMode || 'keep_amount';

  let nextDiscount = oldDiscount;
  let discountAmount = 0;
  if (preserveMode === 'clear_discount') {
    nextDiscount = 0;
    discountAmount = 0;
  } else if (discountType === 'percent') {
    const pct = Math.min(100, oldDiscount);
    nextDiscount = pct;
    discountAmount = newGross * (pct / 100);
  } else if (preserveMode === 'keep_ratio' && oldGross > 0) {
    const ratio = Math.min(1, oldDiscount / oldGross);
    discountAmount = Math.min(newGross, Math.round(newGross * ratio));
    nextDiscount = discountAmount;
  } else {
    discountAmount = Math.min(newGross, oldDiscount);
    nextDiscount = oldDiscount;
  }

  const afterDiscount = Math.max(0, newGross - discountAmount);
  const vatType = String(row.vat_type || 'percent').trim().toLowerCase() === 'amount'
    ? 'amount'
    : 'percent';
  const vatInput = Math.max(0, toFiniteNumber(row.vat, 0));
  const vatAmount = vatType === 'percent' ? afterDiscount * (vatInput / 100) : vatInput;

  return {
    ...row,
    unit_price: nextUnitPrice,
    discount_type: discountType,
    discount: nextDiscount,
    total_price: Math.max(0, Math.round(afterDiscount + vatAmount)),
  };
};

export const recalculateInvoiceFinancialSummary = (
  invoice: Record<string, any>,
  nextItems: Array<Record<string, any>>,
) => {
  const subtotal = (nextItems || []).reduce((sum, item) => sum + toFiniteNumber(item?.total_price, 0), 0);
  const globalDiscountType = String(invoice?.global_discount_type || 'amount').trim().toLowerCase() === 'percent'
    ? 'percent'
    : 'amount';
  const globalDiscountValue = Math.max(0, toFiniteNumber(invoice?.global_discount_value, 0));
  const globalDiscountAmount = subtotal <= 0
    ? 0
    : Math.min(
        subtotal,
        globalDiscountType === 'percent'
          ? (subtotal * Math.min(100, globalDiscountValue)) / 100
          : globalDiscountValue,
      );

  const totalInvoiceAmount = Math.max(0, Math.round(subtotal - globalDiscountAmount));

  const payments = Array.isArray(invoice?.payments) ? invoice.payments : null;
  let totalReceivedAmount = Math.max(0, toFiniteNumber(invoice?.total_received_amount, 0));
  if (payments) {
    const includedStatuses = new Set(['received', 'paid', 'approved', 'cleared']);
    const hasStatus = payments.some((p: any) => p && Object.prototype.hasOwnProperty.call(p, 'status'));
    totalReceivedAmount = payments.reduce((sum: number, p: any) => {
      const status = String(p?.status || '').trim().toLowerCase();
      if (hasStatus && status && !includedStatuses.has(status)) return sum;
      return sum + Math.abs(toFiniteNumber(p?.amount, 0));
    }, 0);
  }

  return {
    total_invoice_amount: totalInvoiceAmount,
    total_received_amount: Math.round(totalReceivedAmount),
    remaining_balance: Math.round(totalInvoiceAmount - totalReceivedAmount),
  };
};

export type ApplyPriceAdjustmentPlanInput = {
  products: any[];
  priceLists: any[];
  productBundles: any[];
  proformaInvoices: any[];
  targets: PriceAdjustmentTargetItem[];
  scopes: PriceAdjustmentScope[];
  priceListIds?: string[];
  updatePriceListProfitPercentage?: boolean;
  bundleDiscountMode?: BundleDiscountMode;
  proformaInvoiceIds?: string[] | null;
};

export type ApplyPriceAdjustmentPlanResult = {
  targetPriceByProductId: Record<string, { oldPrice: number; newPrice: number; name: string; systemCode: string | null }>;
  productUpdates: Array<{ id: string; name: string; systemCode: string | null; oldSellPrice: number; newSellPrice: number; patch: Record<string, any> }>;
  priceListUpdates: Array<{ id: string; name: string; changedItemsCount: number; patch: Record<string, any> }>;
  bundleUpdates: Array<{ id: string; name: string; systemCode: string | null; changedRowsCount: number; oldTotal: number; newTotal: number; patch: Record<string, any> }>;
  proformaUpdates: Array<{ id: string; name: string; systemCode: string | null; oldTotal: number; newTotal: number; changedRowsCount: number; patch: Record<string, any> }>;
  summaryLinesFa: string[];
};

export const applyPriceAdjustment = (input: ApplyPriceAdjustmentPlanInput): ApplyPriceAdjustmentPlanResult => {
  const scopes = new Set<PriceAdjustmentScope>(input.scopes || []);
  const targetByProductId = new Map<string, PriceAdjustmentTargetItem>();
  for (const t of input.targets || []) {
    const pid = String(t?.productId || '').trim();
    if (pid) targetByProductId.set(pid, t);
  }

  const productById = new Map<string, any>(
    (input.products || []).map((p) => [String(p?.id || '').trim(), p]),
  );

  const resolvedNewPriceByProductId = new Map<string, number>();
  const targetPriceByProductId: ApplyPriceAdjustmentPlanResult['targetPriceByProductId'] = {};

  for (const [productId, target] of targetByProductId.entries()) {
    const product = productById.get(productId);
    const oldSellPrice = Math.max(0, toFiniteNumber(product?.sell_price, 0));
    const nextPrice = computeAdjustedUnitPrice(oldSellPrice, target);
    resolvedNewPriceByProductId.set(productId, nextPrice);
    targetPriceByProductId[productId] = {
      oldPrice: oldSellPrice,
      newPrice: nextPrice,
      name: String(product?.name || 'محصول'),
      systemCode: product?.system_code ? String(product.system_code) : null,
    };
  }

  const productUpdates: ApplyPriceAdjustmentPlanResult['productUpdates'] = [];
  if (scopes.has('products')) {
    for (const [productId, target] of targetByProductId.entries()) {
      const product = productById.get(productId);
      if (!product) continue;
      const oldSellPrice = Math.max(0, toFiniteNumber(product?.sell_price, 0));
      const newSellPrice = resolvedNewPriceByProductId.get(productId) ?? oldSellPrice;
      const patch: Record<string, any> = { sell_price: newSellPrice };
      if (target.alsoUpdateBuyPrice && product.buy_price !== undefined && product.buy_price !== null) {
        patch.buy_price = computeAdjustedUnitPrice(toFiniteNumber(product.buy_price, 0), target);
      }
      if (newSellPrice !== oldSellPrice || patch.buy_price !== undefined) {
        productUpdates.push({
          id: productId,
          name: String(product.name || 'محصول'),
          systemCode: product.system_code ? String(product.system_code) : null,
          oldSellPrice,
          newSellPrice,
          patch,
        });
      }
    }
  }

  const priceListFilter = input.priceListIds?.length ? new Set(input.priceListIds.map(String)) : null;
  const priceListUpdates: ApplyPriceAdjustmentPlanResult['priceListUpdates'] = [];
  if (scopes.has('price_lists')) {
    for (const pl of input.priceLists || []) {
      const plId = String(pl?.id || '').trim();
      if (!plId) continue;
      if (priceListFilter && !priceListFilter.has(plId)) continue;
      const items = Array.isArray(pl?.items) ? pl.items : [];
      let changedItemsCount = 0;
      const nextItems = items.map((item: any) => {
        const pid = String(item?.product_id || '').trim();
        const target = targetByProductId.get(pid);
        if (!target) return item;
        const currentPrice = toFiniteNumber(item?.price, toFiniteNumber(productById.get(pid)?.sell_price, 0));
        const nextPrice = computeAdjustedUnitPrice(currentPrice, target);
        if (nextPrice === currentPrice) return item;
        changedItemsCount += 1;
        const buyPrice = toFiniteNumber(item?.buy_price, toFiniteNumber(productById.get(pid)?.buy_price, 0));
        const nextItem: Record<string, any> = { ...item, price: nextPrice };
        if (input.updatePriceListProfitPercentage !== false && buyPrice > 0) {
          nextItem.profit_percentage = Number((((nextPrice - buyPrice) / buyPrice) * 100).toFixed(2));
        }
        return nextItem;
      });
      if (changedItemsCount > 0) {
        priceListUpdates.push({
          id: plId,
          name: String(pl?.name || 'لیست قیمت'),
          changedItemsCount,
          patch: { items: nextItems },
        });
      }
    }
  }

  const bundleUpdates: ApplyPriceAdjustmentPlanResult['bundleUpdates'] = [];
  if (scopes.has('product_bundles')) {
    const discountMode = input.bundleDiscountMode || 'keep_ratio';
    for (const bundle of input.productBundles || []) {
      const bundleId = String(bundle?.id || '').trim();
      const rows = Array.isArray(bundle?.products) ? bundle.products : [];
      if (!bundleId || rows.length === 0) continue;
      let changedRowsCount = 0;
      let oldTotal = 0;
      let newTotal = 0;

      const nextRows = rows.map((row: any) => {
        oldTotal += toFiniteNumber(row?.total_price, 0);
        const pid = String(row?.product_id || '').trim();
        const target = targetByProductId.get(pid);
        if (!target) {
          newTotal += toFiniteNumber(row?.total_price, 0);
          return row;
        }
        const currentUnit = toFiniteNumber(row?.unit_price, toFiniteNumber(productById.get(pid)?.sell_price, 0));
        const nextUnitPrice = computeAdjustedUnitPrice(currentUnit, target);
        const recalculated = recalculateBundleRowForPriceChange({
          row,
          nextUnitPrice,
          discountMode,
        });
        changedRowsCount += 1;
        newTotal += toFiniteNumber(recalculated.total_price, 0);
        return recalculated;
      });

      if (changedRowsCount > 0) {
        bundleUpdates.push({
          id: bundleId,
          name: String(bundle?.name || 'پکیج'),
          systemCode: bundle?.system_code ? String(bundle.system_code) : bundle?.bundle_number ? String(bundle.bundle_number) : null,
          changedRowsCount,
          oldTotal: Math.round(oldTotal),
          newTotal: Math.round(newTotal),
          patch: { products: nextRows },
        });
      }
    }
  }

  const proformaFilter = Array.isArray(input.proformaInvoiceIds)
    ? new Set(input.proformaInvoiceIds.map(String))
    : null;
  const proformaUpdates: ApplyPriceAdjustmentPlanResult['proformaUpdates'] = [];
  if (scopes.has('proforma_invoices')) {
    for (const inv of input.proformaInvoices || []) {
      const invId = String(inv?.id || '').trim();
      const status = String(inv?.status || '').trim().toLowerCase();
      if (!invId || status !== 'proforma') continue;
      if (proformaFilter && !proformaFilter.has(invId)) continue;
      const items = Array.isArray(inv?.invoiceItems) ? inv.invoiceItems : [];
      if (items.length === 0) continue;
      let changedRowsCount = 0;
      const nextItems = items.map((row: any) => {
        const pid = String(row?.product_id || '').trim();
        const target = targetByProductId.get(pid);
        if (!target) return row;
        const currentUnit = toFiniteNumber(row?.unit_price, toFiniteNumber(productById.get(pid)?.sell_price, 0));
        const nextUnitPrice = computeAdjustedUnitPrice(currentUnit, target);
        const recalculated = recalculateInvoiceRowForPriceChange({
          row,
          nextUnitPrice,
          preserveRowDiscountMode: input.bundleDiscountMode === 'clear_discount' ? 'clear_discount' : 'keep_ratio',
        });
        changedRowsCount += 1;
        return recalculated;
      });

      if (changedRowsCount > 0) {
        const summary = recalculateInvoiceFinancialSummary(inv, nextItems);
        const oldTotal = Math.round(toFiniteNumber(inv?.total_invoice_amount, 0));
        proformaUpdates.push({
          id: invId,
          name: String(inv?.name || 'پیش‌فاکتور'),
          systemCode: inv?.system_code ? String(inv.system_code) : null,
          oldTotal,
          newTotal: summary.total_invoice_amount,
          changedRowsCount,
          patch: {
            invoiceItems: nextItems,
            ...summary,
          },
        });
      }
    }
  }

  const summaryLinesFa: string[] = [];
  if (productUpdates.length) {
    summaryLinesFa.push(`کالاها و خدمات: ${productUpdates.length.toLocaleString('fa-IR')} مورد`);
  }
  if (priceListUpdates.length) {
    summaryLinesFa.push(`لیست قیمت‌ها: ${priceListUpdates.length.toLocaleString('fa-IR')} لیست`);
  }
  if (bundleUpdates.length) {
    summaryLinesFa.push(`پکیج‌ها: ${bundleUpdates.length.toLocaleString('fa-IR')} پکیج`);
  }
  if (proformaUpdates.length) {
    summaryLinesFa.push(`پیش‌فاکتورهای باز: ${proformaUpdates.length.toLocaleString('fa-IR')} پیش‌فاکتور`);
  }

  return {
    targetPriceByProductId,
    productUpdates,
    priceListUpdates,
    bundleUpdates,
    proformaUpdates,
    summaryLinesFa,
  };
};

export const shouldAttachPricingAdjustmentSkill = (ctx: SkillExecutionContext): boolean => {
  if ((ctx.selectedCapabilities || []).includes('pricing_adjustment')) return true;
  if (['products', 'price_lists', 'product_bundles'].includes(String(ctx.pageContext?.moduleId || ''))) {
    return PRICING_ADJUSTMENT_KEYWORDS_REGEX.test(ctx.userMessage || '');
  }
  return PRICING_ADJUSTMENT_KEYWORDS_REGEX.test(ctx.userMessage || '');
};

const extractSearchTokens = (message: string): string[] => {
  return String(message || '')
    .replace(/[\u064B-\u065F.,،؟?!()[\]{}"'«»:/\\]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !/^(همه|تمامی|رو|را|به|از|در|با|تا|های|درصد|افزایش|کاهش|تغییر|قیمت|بده|کن|شد|میخوایم|توی|چند|اسکرین|شات)$/.test(t));
};

export const pricingAdjustmentSkill: DomainSkillModule = {
  agentKey: 'sales_leads',
  titleFa: 'مهارت تنظیم قیمت و مقایسه بازار',
  buildContractPrompt: () => [
    '## قرارداد تخصصی مهارت تنظیم قیمت (`pricing_adjustment`)',
    'وقتی کاربر درخواست تغییر/افزایش/کاهش قیمت دسته‌جمعی یا تکی دارد (مثلاً «همه بنرها را ۲۰٪ افزایش بده») یا چند اسکرین‌شات قیمت سایت/کانال رقیب می‌فرستد:',
    '1. **جمع‌آوری شفاف ابهام‌ها پیش از اجرای نهایی (هرگز سرخود همه جا را تغییر نده!)**:',
    '   اگر کاربر موارد زیر را صراحتاً تعیین نکرده، ابتدا فهرست اقلام شناسایی‌شده + تصمیم‌های زیر را دقیق و کوتاه بپرس:',
    '   - **دامنه اعمال**: قیمت پایه `کالاها و خدمات (products)`؟ `لیست قیمت‌ها (price_lists)` (کدام لیست‌ها و آیا `profit_percentage` هم بروز شود)؟ `پکیج‌ها (product_bundles)`؟ `پیش‌فاکتورهای باز (invoices با status = proforma)`؟ یا همه موارد؟',
    '   - **پکیج‌ها و حفظ تخفیف**: در `product_bundles` پس از تغییر قیمت واحد اقلام، تخفیف پکیج به همان نسبت حفظ شود (`keep_ratio`)، مبلغ ثابت تخفیف حفظ شود (`keep_amount`) یا تخفیف حذف شود (`clear_discount`)؟',
    '   - **پیش‌فاکتورهای باز (`proforma`)**: اگر کالاها در پیش‌فاکتورهای باز وجود دارند، نام/کد سیستمی و جمع قدیم پیش‌فاکتورها را نشان بده و بپرس همه پیش‌فاکتورهای باز تغییر کنند یا فقط موارد انتخابی؟ (هرگز فاکتورهای تاییدشده/نهایی/تسویه‌شده را بدون دستور صریح تغییر نده!)',
    '   - **رندسازی**: قیمت‌های جدید دقیق بمانند یا به مضرب مشخصی (مثلاً ۱٬۰۰۰ یا ۱۰٬۰۰۰ واحد) رند شوند؟',
    '   - **مدیریت برچسب‌ها (`add_tags` / `remove_tags`)**: آیا روی رکوردهای تغییرکرده برچسب جدید اضافه شود یا برچسب قبلی حذف گردد؟ (مثلاً افزودن برچسب «آپدیت قیمت» و حذف «قیمت قدیم»)',
    '2. **تحلیل اسکرین‌شات سایت‌ها و کانال‌ها**:',
    '   - اگر کاربر یک یا چند تصویر اسکرین‌شات ارسال کرده، تمام کالاها/مدل‌ها/ابعاد و قیمت‌های دیده‌شده در تصویر را با تطبیق واحد پولی سازمان (`company_settings.currency_label` - مراقب تفاوت تومان و ریال باش) استخراج کن، با `catalog_products` مطابقت بده و جدول مقایسه «کالای ما | قیمت فعلی | قیمت رقیب در تصویر | تغییر پیشنهادی» بساز و برای تأیید بفرست.',
    '3. **قالب اقدام ساختاری برای تأیید و اجرای اتمیک**:',
    '   - فقط وقتی تصمیم‌های بالا روشن و کاربر آماده تأیید نهایی بود، بلوک JSON اقدام با `action_type: "apply_price_adjustment"` پیشنهاد بده:',
    '```json',
    '{',
    '  "action_type": "apply_price_adjustment",',
    '  "summary_fa": "خلاصه تغییرات قیمت برای تأیید نهایی",',
    '  "scopes": ["products", "price_lists", "product_bundles", "proforma_invoices"],',
    '  "bundle_discount_mode": "keep_ratio",',
    '  "update_price_list_profit_percentage": true,',
    '  "price_list_ids": [],',
    '  "proforma_invoice_ids": [],',
    '  "add_tags": ["بروزرسانی قیمت"],',
    '  "remove_tags": [],',
    '  "targets": [',
    '    { "product_id": "<id از catalog_products>", "mode": "percent_increase", "value": 20, "rounding_step": 1000 }',
    '  ]',
    '}',
    '```',
    '   - اگر فقط درباره نرخ یک محصول سؤال یا مقایسه باشد و هنوز تایید نهایی برای نوشتن در دیتابیس نباشد، به جای اجرای ناخواسته، ابتدا جدول پیش‌نمایش و سؤالات بالا را نشان بده.',
  ].join('\n'),
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    if (!orgId || ctx.grounding.freeChatMode) return null;

    const perms = ctx.authContext?.permissions;
    const plan = ctx.grounding.planContext;
    const tokens = extractSearchTokens(ctx.userMessage);

    const canProducts = canViewModuleWithPlan(plan, perms, 'products');
    const canPriceLists = canViewModuleWithPlan(plan, perms, 'price_lists');
    const canBundles = canViewModuleWithPlan(plan, perms, 'product_bundles');
    const canInvoices = canViewModuleWithPlan(plan, perms, 'invoices');

    const [products, priceLists, bundles, proformaInvoices, orgTags] = await Promise.all([
      canProducts
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'products', {
            org_id: `eq.${orgId}`,
            select: 'id,name,system_code,manual_code,product_type,category,goods_subgroup,product_category,service_subgroup,sell_price,buy_price,main_unit,status,tags',
            order: 'updated_at.desc',
            limit: 120,
          })
        : Promise.resolve([]),
      canPriceLists
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'price_lists', {
            org_id: `eq.${orgId}`,
            select: 'id,name,status,items,tags',
            order: 'updated_at.desc',
            limit: 20,
          })
        : Promise.resolve([]),
      canBundles
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'product_bundles', {
            org_id: `eq.${orgId}`,
            select: 'id,name,bundle_number,status,products,tags',
            order: 'updated_at.desc',
            limit: 40,
          })
        : Promise.resolve([]),
      canInvoices
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'invoices', {
            org_id: `eq.${orgId}`,
            status: 'eq.proforma',
            select: 'id,name,system_code,customer_id,status,invoice_date,global_discount_type,global_discount_value,total_invoice_amount,total_received_amount,remaining_balance,invoiceItems,tags',
            order: 'updated_at.desc',
            limit: 40,
          })
        : Promise.resolve([]),
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'tags', {
        org_id: `eq.${orgId}`,
        select: 'id,title,color',
        order: 'title.asc',
        limit: 80,
      }),
    ]);

    const scoreProduct = (p: any): number => {
      if (!tokens.length) return 0;
      const hay = [
        p?.name,
        p?.system_code,
        p?.manual_code,
        p?.category,
        p?.goods_subgroup,
        p?.product_category,
        p?.service_subgroup,
        Array.isArray(p?.tags) ? p.tags.map((t: any) => t?.title || t).join(' ') : '',
      ].join(' ').toLowerCase();
      return tokens.reduce((acc, tk) => (hay.includes(tk.toLowerCase()) ? acc + 1 : acc), 0);
    };

    const sortedProducts = [...products].sort((a, b) => scoreProduct(b) - scoreProduct(a));
    const matchedProducts = sortedProducts.filter((p) => scoreProduct(p) > 0);
    const activeCatalogProducts = (matchedProducts.length ? matchedProducts : sortedProducts).slice(0, 60);
    const catalogIds = new Set(activeCatalogProducts.map((p: any) => String(p.id)));

    const relevantBundles = bundles
      .map((b: any) => {
        const items = Array.isArray(b?.products) ? b.products : [];
        const hasMatch = items.some((row: any) => catalogIds.has(String(row?.product_id || '')));
        return { b, hasMatch };
      })
      .sort((x, y) => Number(y.hasMatch) - Number(x.hasMatch))
      .slice(0, 20)
      .map((x) => ({
        id: x.b.id,
        name: x.b.name,
        bundle_number: x.b.bundle_number || null,
        status: x.b.status,
        tags: x.b.tags || [],
        products_count: Array.isArray(x.b.products) ? x.b.products.length : 0,
        matched_items: (Array.isArray(x.b.products) ? x.b.products : []).filter((row: any) =>
          matchedProducts.length === 0 || catalogIds.has(String(row?.product_id || '')),
        ),
      }));

    const relevantProformas = proformaInvoices
      .map((inv: any) => {
        const items = Array.isArray(inv?.invoiceItems) ? inv.invoiceItems : [];
        const matchedItems = items.filter((row: any) =>
          matchedProducts.length === 0 || catalogIds.has(String(row?.product_id || '')),
        );
        return { inv, hasMatch: matchedItems.length > 0 };
      })
      .sort((x, y) => Number(y.hasMatch) - Number(x.hasMatch))
      .slice(0, 20)
      .map((x) => ({
        id: x.inv.id,
        name: x.inv.name,
        system_code: x.inv.system_code || null,
        status: x.inv.status,
        invoice_date: x.inv.invoice_date || null,
        total_invoice_amount: x.inv.total_invoice_amount,
        tags: x.inv.tags || [],
        items_count: Array.isArray(x.inv.invoiceItems) ? x.inv.invoiceItems.length : 0,
        contains_matched_product: x.hasMatch,
      }));

    const bundle: Record<string, any> = {
      pricing_permissions: {
        can_update_products: canProducts,
        can_update_price_lists: canPriceLists,
        can_update_product_bundles: canBundles,
        can_update_proforma_invoices: canInvoices,
      },
      catalog_products: activeCatalogProducts,
      matched_products_count: matchedProducts.length,
      price_lists: priceLists.map((pl: any) => ({
        id: pl.id,
        name: pl.name,
        status: pl.status,
        tags: pl.tags || [],
        items_count: Array.isArray(pl.items) ? pl.items.length : 0,
        matched_items: (Array.isArray(pl.items) ? pl.items : []).filter((it: any) =>
          matchedProducts.length === 0 || catalogIds.has(String(it?.product_id || '')),
        ).slice(0, 25),
      })),
      product_bundles: relevantBundles,
      open_proforma_invoices: relevantProformas,
      available_tags: orgTags.map((t: any) => t.title).filter(Boolean),
    };

    return bundle;
  },
};
