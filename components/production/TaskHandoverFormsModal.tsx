import React, { useMemo } from 'react';
import { Badge, Button, Empty, Modal, Table, Tabs, Tag } from 'antd';
import { CheckOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

export type StageHandoverSummaryRow = {
  productId: string;
  productName: string;
  productCode?: string;
  unit?: string;
  sourceQty: number;
  orderQty: number;
  deliveredQty: number;
};

export type StageHandoverFormListRow = {
  id: string;
  title: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  giverConfirmed?: boolean;
  receiverConfirmed?: boolean;
};

interface TaskHandoverFormsModalProps {
  open: boolean;
  loading?: boolean;
  taskName: string;
  sourceStageName: string;
  summaries: StageHandoverSummaryRow[];
  forms: StageHandoverFormListRow[];
  selectedFormId: string | null;
  onSelectForm: (formId: string) => void;
  onCreateForm: () => void;
  onOpenSelectedForm: () => void;
  onClose: () => void;
}

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toQty = (value: number) => {
  const rounded = Math.round((toNumber(value) || 0) * 1000) / 1000;
  return toPersianNumber(rounded.toLocaleString('en-US'));
};

const TaskHandoverFormsModal: React.FC<TaskHandoverFormsModalProps> = ({
  open,
  loading = false,
  taskName,
  sourceStageName,
  summaries,
  forms,
  selectedFormId,
  onSelectForm,
  onCreateForm,
  onOpenSelectedForm,
  onClose,
}) => {
  const totalShortage = useMemo(
    () =>
      summaries.reduce((sum, item) => {
        const shortage = Math.max(0, toNumber(item.orderQty) - toNumber(item.deliveredQty));
        return sum + shortage;
      }, 0),
    [summaries]
  );

  const totalSurplus = useMemo(
    () =>
      summaries.reduce((sum, item) => {
        const surplus = Math.max(0, toNumber(item.deliveredQty) - toNumber(item.orderQty));
        return sum + surplus;
      }, 0),
    [summaries]
  );

  const commonColumns = [
    {
      title: 'محصول',
      dataIndex: 'productName',
      key: 'productName',
      width: 220,
      render: (value: string, record: StageHandoverSummaryRow) => (
        <div className="flex flex-col">
          <span className="font-medium">{value || '-'}</span>
          <span className="text-[11px] text-gray-500">{record.productCode || '-'}</span>
        </div>
      ),
    },
    {
      title: 'واحد',
      dataIndex: 'unit',
      key: 'unit',
      width: 110,
      render: (value: string) => value || '-',
    },
  ];

  return (
    <Modal
      title="فرم‌های تحویل کالا"
      open={open}
      onCancel={onClose}
      width="min(1080px, calc(100vw - 24px))"
      footer={null}
      destroyOnClose
      styles={{ body: { maxHeight: '74vh', overflowY: 'auto' } }}
    >
      <div className="space-y-4">
        <div className="text-sm text-gray-700">
          مدیریت تحویل‌های مرحله <span className="font-black text-[#8b5e3c]">"{taskName}"</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="text-xs text-red-700">جمع کسری مرحله</div>
            <div className="text-base font-black text-red-700">{toQty(totalShortage)}</div>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="text-xs text-green-700">جمع مازاد مرحله</div>
            <div className="text-base font-black text-green-700">{toQty(totalSurplus)}</div>
          </div>
        </div>

        <Tabs
          size="small"
          items={[
            {
              key: 'from_source',
              label: (
                <span>
                  مقدار تحویل شده از <span className="font-black text-[#8b5e3c]">{sourceStageName}</span>
                </span>
              ),
              children: (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="productId"
                  dataSource={summaries}
                  scroll={{ x: true }}
                  columns={[
                    ...commonColumns,
                    {
                      title: 'مقدار دریافتی',
                      dataIndex: 'sourceQty',
                      key: 'sourceQty',
                      width: 150,
                      render: (value: number) => toQty(value),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'order_amount',
              label: 'مقدار ثبت شده در سفارش تولید',
              children: (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="productId"
                  dataSource={summaries}
                  scroll={{ x: true }}
                  columns={[
                    ...commonColumns,
                    {
                      title: 'مقدار سفارش',
                      dataIndex: 'orderQty',
                      key: 'orderQty',
                      width: 150,
                      render: (value: number) => toQty(value),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'to_next',
              label: 'مقدار تحویل شده به مرحله بعدی',
              children: (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="productId"
                  dataSource={summaries}
                  scroll={{ x: true }}
                  columns={[
                    ...commonColumns,
                    {
                      title: 'مقدار تحویل شده',
                      dataIndex: 'deliveredQty',
                      key: 'deliveredQty',
                      width: 150,
                      render: (value: number) => toQty(value),
                    },
                    {
                      title: 'اختلاف با مقدار سفارش',
                      key: 'diff',
                      width: 170,
                      render: (_: any, row: StageHandoverSummaryRow) => {
                        const diff = toNumber(row.deliveredQty) - toNumber(row.orderQty);
                        const cls = diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-700' : 'text-gray-700';
                        return <span className={cls}>{toQty(diff)}</span>;
                      },
                    },
                  ]}
                />
              ),
            },
          ]}
        />

        <div className="rounded-xl border border-gray-200">
          <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
            <div className="font-semibold text-sm">لیست فرم‌های تحویل کالا</div>
            <div className="flex items-center gap-2">
              <Button icon={<PlusOutlined />} onClick={onCreateForm}>
                فرم جدید
              </Button>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={onOpenSelectedForm}
                disabled={!selectedFormId}
                loading={loading}
              >
                باز کردن فرم
              </Button>
            </div>
          </div>

          {forms.length === 0 ? (
            <div className="p-6">
              <Empty description="فرمی برای این مرحله ثبت نشده است." />
            </div>
          ) : (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={forms}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedFormId ? [selectedFormId] : [],
                onChange: (keys) => {
                  const key = keys?.[0];
                  if (key) onSelectForm(String(key));
                },
              }}
              columns={[
                {
                  title: 'فرم',
                  dataIndex: 'title',
                  key: 'title',
                  width: 220,
                  render: (value: string) => value || '-',
                },
                {
                  title: 'تحویل‌دهنده',
                  key: 'giverConfirmed',
                  width: 130,
                  render: (_: any, record: StageHandoverFormListRow) =>
                    record.giverConfirmed ? <Tag color="green">تایید شده</Tag> : <Tag color="orange">در انتظار</Tag>,
                },
                {
                  title: 'تحویل‌گیرنده',
                  key: 'receiverConfirmed',
                  width: 130,
                  render: (_: any, record: StageHandoverFormListRow) =>
                    record.receiverConfirmed ? <Tag color="green">تایید شده</Tag> : <Tag color="orange">در انتظار</Tag>,
                },
                {
                  title: 'آخرین بروزرسانی',
                  dataIndex: 'updatedAt',
                  key: 'updatedAt',
                  render: (value: string | null | undefined) => value ? toPersianNumber(String(value)) : '-',
                },
                {
                  title: '',
                  key: 'actions',
                  width: 80,
                  render: (_: any, record: StageHandoverFormListRow) => (
                    <Button
                      type="text"
                      icon={<CheckOutlined />}
                      onClick={() => {
                        onSelectForm(record.id);
                        onOpenSelectedForm();
                      }}
                    />
                  ),
                },
              ]}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default TaskHandoverFormsModal;

