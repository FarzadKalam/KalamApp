import { RowCalculationType, SummaryCalculationType, BlockType } from '../types';

const PAYMENT_INCLUDED_STATUSES = new Set(['received', 'paid', 'approved', 'cleared']);
const normalizePaymentStatus = (value: any) => String(value || '').trim().toLowerCase();
const normalizeInvoiceGlobalDiscountType = (value: any): 'percent' | 'amount' =>
    String(value || '').trim().toLowerCase() === 'percent' ? 'percent' : 'amount';

const resolveInvoiceGlobalDiscountAmount = (subtotal: number, type: 'percent' | 'amount', rawValue: any) => {
    const safeSubtotal = Math.max(0, Number(subtotal) || 0);
    if (safeSubtotal <= 0) return 0;
    const value = Math.max(0, Number(rawValue) || 0);
    const rawAmount = type === 'percent'
        ? (safeSubtotal * Math.min(100, value)) / 100
        : value;
    return Math.min(safeSubtotal, rawAmount);
};

export const calculateRow = (row: any, type: RowCalculationType = RowCalculationType.SIMPLE_MULTIPLY) => {
    const lengthVal = parseFloat(row.length);
    const widthVal = parseFloat(row.width);
    const areaUsage = Number.isFinite(lengthVal) && Number.isFinite(widthVal) ? lengthVal * widthVal : null;
    const qty = parseFloat(row.quantity)
        || parseFloat(row.usage)
        || (areaUsage !== null ? areaUsage : 0)
        || parseFloat(row.qty)
        || parseFloat(row.stock)
        || 0;
    const price = parseFloat(row.unit_price) || parseFloat(row.buy_price) || parseFloat(row.price) || 0;
    
    let baseTotal = qty * price;

    // محاسبات فاکتور
    if (type === RowCalculationType.INVOICE_ROW) {
        // اصلاح مهم: مالیات به عنوان درصد در نظر گرفته می‌شود
        // مثال: اگر vat = 9 باشد، یعنی 9 درصد
        let discountInput = parseFloat(row.discount) || 0;
        let vatInput = parseFloat(row.vat) || 0;

        const discountType = row.discount_type || 'amount';
        const vatType = row.vat_type || 'percent';

        const discountAmount = discountType === 'percent'
            ? baseTotal * (discountInput / 100)
            : discountInput;

        const afterDiscount = baseTotal - discountAmount;

        const vatAmount = vatType === 'percent'
            ? afterDiscount * (vatInput / 100)
            : vatInput;

        return afterDiscount + vatAmount;
    }

    // محاسبات ساده (BOM)
    return baseTotal;
};

export const calculateSummary = (data: any, blocks: any[], summaryConfig: any) => {
    const type = summaryConfig?.calculationType || SummaryCalculationType.SUM_ALL_ROWS;

    // حالت فاکتور
    if (type === SummaryCalculationType.INVOICE_FINANCIALS) {
        const invoiceBlock = blocks.find((b: any) => b.rowCalculationType === RowCalculationType.INVOICE_ROW)
            || blocks.find((b: any) => b.id === 'invoiceItems')
            || blocks.find((b: any) => b.id === 'items')
            || blocks.find((b: any) => b.type === BlockType.TABLE && b.id !== 'payments');
        const itemBlockId = invoiceBlock?.id || 'invoiceItems';
        const items = data[itemBlockId] || [];
        const itemRowCalculationType = invoiceBlock?.rowCalculationType || RowCalculationType.SIMPLE_MULTIPLY;
        
        const subtotalInvoice = items.reduce((sum: number, item: any) => {
            return sum + (parseFloat(item.total_price) || calculateRow(item, itemRowCalculationType));
        }, 0);
        const globalDiscountType = normalizeInvoiceGlobalDiscountType(data?.global_discount_type);
        const globalDiscountAmount = resolveInvoiceGlobalDiscountAmount(
            subtotalInvoice,
            globalDiscountType,
            data?.global_discount_value
        );
        const totalInvoice = Math.max(0, subtotalInvoice - globalDiscountAmount);

        const paymentBlock = blocks.find((b: any) => b.id === 'payments');
        const payments = data[paymentBlock?.id || 'payments'] || [];
        const hasStatusColumn = payments.some((item: any) => item && Object.prototype.hasOwnProperty.call(item, 'status'));
        
        const totalReceived = payments.reduce((sum: number, item: any) => {
            const normalizedStatus = normalizePaymentStatus(item?.status);
            if (hasStatusColumn && normalizedStatus && !PAYMENT_INCLUDED_STATUSES.has(normalizedStatus)) return sum;
            return sum + Math.abs(parseFloat(item?.amount) || 0);
        }, 0);

        return {
            total: totalInvoice,
            received: totalReceived,
            remaining: totalInvoice - totalReceived
        };
    }

    // حالت پیش‌فرض (BOM)
    let grandTotal = 0;
    blocks.forEach((block: any) => {
        if (block.type === BlockType.TABLE) {
            const rows = data[block.id] || [];
            if (Array.isArray(rows)) {
                rows.forEach((row: any) => {
                    grandTotal += (parseFloat(row.total_price) || calculateRow(row, block.rowCalculationType));
                });
            }
        }

        if (block.type === BlockType.GRID_TABLE) {
            const grids = data[block.id] || [];
            if (Array.isArray(grids)) {
                grids.forEach((grid: any) => {
                    const pieces = grid?.pieces || [];
                    if (Array.isArray(pieces)) {
                        pieces.forEach((piece: any) => {
                            grandTotal += parseFloat(piece?.total_cost) || parseFloat(piece?.cost_per_item) || 0;
                        });
                    }
                });
            }
        }
    });

    return { total: grandTotal };
};
