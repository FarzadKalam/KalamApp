export type ChequePaymentStatusInput = {
  operationType: string;
  paymentStatus: string;
  currentChequeStatus?: string | null;
  wasSpentByThisPayment?: boolean;
};

export const shouldMarkChequeAsSpent = ({ operationType, paymentStatus }: Pick<ChequePaymentStatusInput, 'operationType' | 'paymentStatus'>) =>
  String(operationType || '').trim().toLowerCase() === 'payment'
  && String(paymentStatus || '').trim().toLowerCase() !== 'pending';

export const resolveChequeStatusForPayment = ({
  operationType,
  paymentStatus,
  currentChequeStatus,
  wasSpentByThisPayment = false,
}: ChequePaymentStatusInput) => {
  const currentStatus = String(currentChequeStatus || 'new').trim() || 'new';
  if (shouldMarkChequeAsSpent({ operationType, paymentStatus })) return 'paid';
  if (wasSpentByThisPayment && currentStatus === 'paid') return 'new';
  return currentStatus;
};
