import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, InputNumber, Modal, Spin, Table, Typography } from 'antd';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { getRecordTitle } from '../../utils/recordTitle';
import { formatPersianPrice, safeJalaliFormat } from '../../utils/persianNumberFormatter';
import {
  autoAllocateInvoiceExcess,
  InvoiceAllocationAmount,
  InvoiceAllocationCandidate,
  InvoicePaymentAllocationModule,
} from '../../utils/invoicePaymentAllocation';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

interface Props {
  open: boolean;
  moduleId: InvoicePaymentAllocationModule;
  sourceInvoiceId?: string | null;
  partyId: string;
  excessAmount: number;
  onCancel: () => void;
  onConfirm: (allocations: InvoiceAllocationAmount[]) => void;
}

const InvoicePaymentAllocationModal: React.FC<Props> = ({
  open,
  moduleId,
  sourceInvoiceId,
  partyId,
  excessAmount,
  onCancel,
  onConfirm,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<InvoiceAllocationCandidate[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const partyField = moduleId === 'invoices' ? 'customer_id' : 'supplier_id';
  const actionLabel = moduleId === 'invoices' ? 'دریافت' : 'پرداخت';

  useEffect(() => {
    if (!open || !partyId) return;
    let active = true;
    setLoading(true);
    void (async () => {
      const query = supabase
        .from(moduleId)
        .select('id,name,system_code,invoice_date,total_invoice_amount,total_received_amount,remaining_balance,status')
        .eq(partyField, partyId)
        .gt('remaining_balance', 0)
        .neq('status', 'canceled')
        .order('invoice_date', { ascending: true })
        .order('created_at', { ascending: true });
      if (sourceInvoiceId) query.neq('id', sourceInvoiceId);
      const { data, error } = await query;
      if (error) throw error;
      const nextCandidates = (data || []).map((row: any) => ({
        id: String(row.id),
        title: getRecordTitle(row, MODULES[moduleId], { fallback: '[بدون عنوان]' }),
        invoiceDate: row.invoice_date || null,
        totalAmount: Number(row.total_invoice_amount) || 0,
        paidAmount: Number(row.total_received_amount) || 0,
        remainingAmount: Math.max(0, Number(row.remaining_balance) || 0),
      }));
      if (!active) return;
      setCandidates(nextCandidates);
      setAllocations(Object.fromEntries(
        autoAllocateInvoiceExcess(excessAmount, nextCandidates).map((item) => [item.invoiceId, item.amount])
      ));
    })().catch((error) => {
      if (active) message.error(toFaErrorMessage(error, 'بارگذاری فاکتورهای قابل تخصیص ناموفق بود.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [excessAmount, moduleId, open, partyField, partyId, sourceInvoiceId, message]);

  const allocatedAmount = useMemo(
    () => Object.values(allocations).reduce((sum, amount) => sum + (Number(amount) || 0), 0),
    [allocations]
  );
  const unallocatedAmount = Math.max(0, Math.round((excessAmount - allocatedAmount) * 100) / 100);

  return (
    <Modal
      open={open}
      width={920}
      title={`تخصیص اضافه‌${actionLabel}`}
      okText="تایید و ثبت"
      cancelText="بازگشت و اصلاح مبلغ"
      onCancel={onCancel}
      okButtonProps={{ disabled: loading || unallocatedAmount !== 0 || allocatedAmount <= 0 }}
      onOk={() => onConfirm(
        Object.entries(allocations)
          .filter(([, amount]) => Number(amount) > 0)
          .map(([invoiceId, amount]) => ({ invoiceId, amount: Number(amount) }))
      )}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        message={`مبلغ ثبت‌شده برای ${actionLabel} بیشتر از جمع کل فاکتور است.`}
        description={`مبلغ اضافه ${formatPersianPrice(excessAmount)} است. آن را بین فاکتورهای باز همین ${moduleId === 'invoices' ? 'مشتری' : 'تامین‌کننده'} تخصیص دهید.`}
        className="mb-4"
      />
      {loading ? <div className="py-10 text-center"><Spin /></div> : (
        <Table
          rowKey="id"
          dataSource={candidates}
          pagination={false}
          scroll={{ x: 760, y: 360 }}
          locale={{ emptyText: 'فاکتور بازی برای تخصیص وجود ندارد' }}
          columns={[
            { title: 'فاکتور', dataIndex: 'title', width: 220 },
            {
              title: 'تاریخ',
              dataIndex: 'invoiceDate',
              width: 110,
              render: (value) => value ? safeJalaliFormat(value, 'YYYY/MM/DD') : '-',
            },
            { title: 'جمع فاکتور', dataIndex: 'totalAmount', width: 130, render: (value) => formatPersianPrice(value) },
            { title: `${actionLabel}‌شده`, dataIndex: 'paidAmount', width: 130, render: (value) => formatPersianPrice(value) },
            { title: 'مانده', dataIndex: 'remainingAmount', width: 130, render: (value) => formatPersianPrice(value) },
            {
              title: 'مبلغ تخصیص',
              width: 160,
              render: (_, row) => (
                <InputNumber
                  className="w-full persian-number"
                  min={0}
                  max={row.remainingAmount}
                  value={allocations[row.id] || 0}
                  onChange={(value) => setAllocations((prev) => ({
                    ...prev,
                    [row.id]: Math.max(0, Number(value) || 0),
                  }))}
                />
              ),
            },
          ]}
        />
      )}
      <div className="mt-4 flex flex-wrap gap-6">
        <Typography.Text>جمع تخصیص: <b>{formatPersianPrice(allocatedAmount)}</b></Typography.Text>
        <Typography.Text type={unallocatedAmount > 0 ? 'danger' : 'success'}>
          تخصیص‌نیافته: <b>{formatPersianPrice(unallocatedAmount)}</b>
        </Typography.Text>
      </div>
    </Modal>
  );
};

export default InvoicePaymentAllocationModal;
