export const getInvoiceAmounts = (row: any) => {
  const qty = parseFloat(row.quantity) || 0;
  const price = parseFloat(row.unit_price) || 0;
  const baseTotal = qty * price;
  const discountInput = parseFloat(row.discount) || 0;
  const vatInput = parseFloat(row.vat) || 0;
  const discountType = row.discount_type || 'amount';
  const vatType = row.vat_type || 'percent';
  const discountAmount = discountType === 'percent' ? baseTotal * (discountInput / 100) : discountInput;
  const afterDiscount = baseTotal - discountAmount;
  const vatAmount = vatType === 'percent' ? afterDiscount * (vatInput / 100) : vatInput;
  return { discountAmount, vatAmount };
};
