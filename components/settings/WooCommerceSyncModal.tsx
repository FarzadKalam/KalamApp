import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Modal, Popconfirm, Radio, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type SyncModule = 'products' | 'customers' | 'invoices';
type SyncPolicy = Record<SyncModule, string>;
type SyncRow = {
  key: string;
  localId: string | null;
  externalId: string | null;
  systemName: string | null;
  siteName: string | null;
  siteCode: string;
  status: 'linked' | 'candidate' | 'site_only' | 'system_only' | 'missing_site' | 'unverified';
  candidateId?: string | null;
  candidateName?: string | null;
  remoteType?: string;
};
type Connection = {
  id: string;
  name: string;
  sync_policy?: SyncPolicy;
};
type Props = {
  connection: Connection | null;
  onClose: () => void;
  onPolicySaved: (connection: Connection) => void;
  call: (body: Record<string, unknown>) => Promise<any>;
};

const policyOptions = [
  { value: 'manual', label: 'تأیید دستی اختلاف‌ها' },
  { value: 'taze', label: 'تازه سیستم مرجع باشد' },
  { value: 'woocommerce', label: 'فروشگاه مرجع باشد' },
];
const moduleLabels: Record<SyncModule, string> = {
  products: 'کالاها و خدمات', customers: 'مشتریان', invoices: 'فاکتورها و سفارش‌ها',
};

const WooCommerceSyncModal: React.FC<Props> = ({ connection, onClose, onPolicySaved, call }) => {
  const { message } = App.useApp();
  const [module, setModule] = useState<SyncModule>('products');
  const [scope, setScope] = useState<'site' | 'system'>('site');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SyncRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState<SyncPolicy>({ products: 'manual', customers: 'manual', invoices: 'manual' });

  useEffect(() => {
    setPolicy(connection?.sync_policy || { products: 'manual', customers: 'manual', invoices: 'manual' });
    setModule('products'); setScope('site'); setPage(1); setRows([]);
  }, [connection?.id]);

  const refresh = useCallback(async () => {
    if (!connection) return;
    setLoading(true);
    try {
      const result = await call({ action: 'preview_sync', id: connection.id, module, scope, page });
      setRows(result.rows || []);
    } catch (error) {
      message.error(toFaErrorMessage(error, 'بررسی رکوردهای فروشگاه ناموفق بود.'));
    } finally { setLoading(false); }
  }, [call, connection, module, scope, page, message]);

  useEffect(() => { void refresh(); }, [refresh]);

  const savePolicy = async () => {
    if (!connection) return;
    setBusy(true);
    try {
      const result = await call({ action: 'save_sync_policy', id: connection.id, policy });
      onPolicySaved(result.connection);
      message.success('مرجع همگام‌سازی ذخیره شد.');
    } catch (error) { message.error(toFaErrorMessage(error, 'ذخیرهٔ تنظیمات ناموفق بود.')); }
    finally { setBusy(false); }
  };

  const sync = async (row: SyncRow, direction: 'from_site' | 'to_site') => {
    if (!connection) return;
    setBusy(true);
    try {
      const result = await call({ action: 'sync_record', id: connection.id, module, direction,
        localId: row.localId, externalId: row.externalId });
      if (result.result?.warning) message.warning(result.result.warning);
      else message.success('رکورد همگام شد.');
      await refresh();
    } catch (error) { message.error(toFaErrorMessage(error, 'همگام‌سازی رکورد ناموفق بود.')); }
    finally { setBusy(false); }
  };

  const link = async (row: SyncRow) => {
    if (!connection || !row.candidateId || !row.externalId) return;
    setBusy(true);
    try {
      await call({ action: 'link_matching_record', id: connection.id, module,
        localId: row.candidateId, externalId: row.externalId });
      message.success('رکوردهای هم‌کد به هم متصل شدند.');
      await refresh();
    } catch (error) { message.error(toFaErrorMessage(error, 'اتصال رکوردها ناموفق بود.')); }
    finally { setBusy(false); }
  };

  const unlink = async (row: SyncRow) => {
    if (!connection || !row.localId || !row.externalId) return;
    setBusy(true);
    try {
      await call({ action: 'unlink_record', id: connection.id, module,
        localId: row.localId, externalId: row.externalId });
      message.success('اتصال رکوردها جدا شد.');
      await refresh();
    } catch (error) { message.error(toFaErrorMessage(error, 'جداکردن رکوردها ناموفق بود.')); }
    finally { setBusy(false); }
  };

  const receiveOrders = async () => {
    if (!connection) return;
    setBusy(true);
    try {
      const result = await call({ action: 'sync_orders', id: connection.id, page });
      if (result.failed?.length) message.warning(`${result.imported} سفارش وارد شد؛ ${result.failed.length} سفارش نیاز به بررسی دارد.`);
      else message.success(`${result.imported} سفارش بررسی و در فاکتورها ثبت شد.`);
      await refresh();
    } catch (error) { message.error(toFaErrorMessage(error, 'دریافت سفارش‌ها ناموفق بود.')); }
    finally { setBusy(false); }
  };

  return <Modal title={`همگام‌سازی ${connection?.name || ''}`} open={!!connection} onCancel={onClose}
    footer={null} width={980} destroyOnClose>
    <div dir="rtl">
      <Alert className="mb-4" type="info" showIcon
        message="مرجع اطلاعات را برای هر بخش جداگانه انتخاب کنید"
        description="در اختلاف‌ها، جابه‌جایی اطلاعات فقط با اقدام صریح شما انجام می‌شود. سفارش‌های دریافتی با منبع فروش «فروشگاه وردپرسی» به فاکتور تبدیل می‌شوند؛ مبلغ فقط برای فروشگاه ریالی یا تومانی قابل تبدیل است." />
      <Tabs activeKey={module} onChange={(value) => { setModule(value as SyncModule); setPage(1); setRows([]); }}
        items={(Object.keys(moduleLabels) as SyncModule[]).map((key) => ({ key, label: moduleLabels[key] }))} />
      <Space wrap className="mb-4">
        <Typography.Text>مرجع {moduleLabels[module]}:</Typography.Text>
        <Select style={{ minWidth: 240 }} options={policyOptions} value={policy[module]}
          onChange={(value) => setPolicy((current) => ({ ...current, [module]: value }))} />
        <Button onClick={() => void savePolicy()} loading={busy}>ذخیرهٔ مرجع</Button>
      </Space>
      {module === 'products' && <Alert className="mb-4" type="warning" showIcon
        message="موجودی فروشگاه هنگام ارسال از تازه سیستم به‌روز می‌شود؛ دریافت موجودی سایت در دفتر انبار اعمال نمی‌شود." />}
      {module === 'invoices' && <Alert className="mb-4" type="warning" showIcon
        message="سفارش‌های سایت به فاکتور «ایجاد شده» وارد می‌شوند؛ فاکتور تازه سیستم پس از اتصال کالاها به سفارش پرداخت‌نشده تبدیل می‌شود. فاکتورهای دارای پرداخت، مالیات یا تخفیف کلی برای ارسال نیاز به نگاشت تکمیلی دارند." />}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Radio.Group value={scope} onChange={(event) => { setScope(event.target.value); setPage(1); setRows([]); }}
          options={[{ label: 'رکوردهای سایت', value: 'site' }, { label: 'رکوردهای تازه سیستم', value: 'system' }]} optionType="button" />
        <Space>
          {module === 'invoices' && scope === 'site' && <Button disabled={busy} onClick={() => void receiveOrders()}>دریافت سفارش‌های این صفحه</Button>}
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refresh()}>بازخوانی</Button>
        </Space>
      </div>
      <Table<SyncRow> rowKey="key" size="small" loading={loading} dataSource={rows} scroll={{ x: 700 }}
        pagination={{ current: page, pageSize: 25, total: rows.length === 25 ? page * 25 + 1 : (page - 1) * 25 + rows.length,
          showSizeChanger: false, onChange: setPage, showTotal: () => 'هر صفحه حداکثر ۲۵ رکورد' }}
        columns={[
          { title: 'در سایت', dataIndex: 'siteName', render: (value: string | null) => value || <Typography.Text type="secondary">—</Typography.Text> },
          { title: 'در تازه سیستم', render: (_, row) => row.systemName || (row.candidateName
            ? <Typography.Text type="warning">احتمالاً: {row.candidateName}</Typography.Text>
            : <Typography.Text type="secondary">—</Typography.Text>) },
          { title: 'کد/ایمیل', dataIndex: 'siteCode', render: (value: string) => value || '—' },
          { title: 'وضعیت', render: (_, row) => <Tag color={row.status === 'linked' ? 'green' : row.status === 'missing_site' ? 'red' : 'gold'}>
            {row.status === 'linked' ? 'در هر دو طرف' : row.status === 'missing_site' ? 'در سایت پیدا نشد'
              : row.candidateId ? 'هم‌کد؛ تأیید لازم' : row.status === 'system_only' ? 'با این کد در سایت نیست'
                : row.status === 'site_only' ? 'در تازه سیستم نیست' : 'نگاشت نشده؛ وجود نامشخص'}</Tag> },
          { title: 'عملیات', render: (_, row) => module === 'invoices' ? <Space wrap>
            {row.localId && !row.externalId && <Button size="small" disabled={busy}
              onClick={() => void sync(row, 'to_site')}>ایجاد سفارش در سایت</Button>}
          </Space> : <Space wrap>
            {row.candidateId && <Button size="small" disabled={busy} onClick={() => void link(row)}>اتصال هم‌کدها</Button>}
            {row.externalId && !row.candidateId && <Button size="small" disabled={busy || row.remoteType === 'variable'}
              onClick={() => void sync(row, 'from_site')}>دریافت از سایت</Button>}
            {row.localId && !row.candidateId && row.status !== 'missing_site' && <Button size="small" disabled={busy}
              onClick={() => void sync(row, 'to_site')}>ارسال به سایت</Button>}
            {row.localId && row.externalId && <Popconfirm title="اتصال این دو رکورد جدا شود؟"
              description="اطلاعات در هیچ‌یک از دو طرف حذف نمی‌شود." okText="بله، جدا شود" cancelText="انصراف"
              onConfirm={() => void unlink(row)}>
              <Button size="small" disabled={busy}>جداکردن</Button>
            </Popconfirm>}
          </Space> },
        ]} />
    </div>
  </Modal>;
};

export default WooCommerceSyncModal;
