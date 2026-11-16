/** Resolve historical commission snapshots only against payments of the same invoice.
 * Amount alone is usable only when it identifies exactly one cheque; never guess. */
export const resolveCommissionChequePayment = (snapshot: any, invoicePayments: any[]) => {
  const id = snapshot.cheque_id || snapshot.spent_cheque_id;
  const number = snapshot.cheque_number || snapshot.serial_no || snapshot.cheque_serial_no;
  const candidates = (invoicePayments || []).filter(payment => {
    if (String(payment.payment_type || '').toLowerCase() !== 'cheque') return false;
    if (id) return (payment.cheque_id || payment.spent_cheque_id) === id;
    if (number) return [payment.cheque_number,payment.serial_no,payment.cheque_serial_no].includes(number);
    const amount = Number(snapshot.amount);
    return Number.isFinite(amount) && amount > 0 && Number(payment.amount) === amount;
  });
  const identities = new Map<string, any>();
  candidates.forEach(payment => {
    const key = payment.cheque_id || payment.spent_cheque_id;
    if (key) identities.set(String(key), payment);
  });
  return identities.size === 1 ? [...identities.values()][0] : null;
};

export const getCommissionChequeDisplay = (payment: any, record?: any) => ({
  id: record?.id || payment.cheque_id || payment.spent_cheque_id,
  number: record?.serial_no || payment.cheque_number || payment.serial_no || payment.cheque_serial_no,
  dueDate: record?.due_date || payment.cheque_due_date || payment.due_date || payment.maturity_date,
  bankName: payment.cheque_bank_name || payment.bank_name,
  status: record?.status || payment.cheque_status || payment.status,
});
