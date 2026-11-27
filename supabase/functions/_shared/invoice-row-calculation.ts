export const calculateInvoiceRowAmount = (row: Record<string, any>) => {
  const length = parseFloat(row.length);
  const width = parseFloat(row.width);
  const area = Number.isFinite(length) && Number.isFinite(width) ? length * width : 0;
  const quantity = parseFloat(row.quantity) || parseFloat(row.usage) || area
    || parseFloat(row.qty) || parseFloat(row.stock) || 0;
  const price = parseFloat(row.unit_price) || parseFloat(row.buy_price) || parseFloat(row.price) || 0;
  const gross = quantity * price;
  const discount = parseFloat(row.discount) || 0;
  const taxable = gross - (row.discount_type === 'percent' ? gross * (discount / 100) : discount);
  const tax = parseFloat(row.vat) || 0;
  return taxable + ((row.vat_type || 'percent') === 'percent' ? taxable * (tax / 100) : tax);
};
