import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Drawer, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { EditOutlined, PlusOutlined, ReloadOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { SAAS_FEATURE_OPTIONS, SAAS_MODULE_GROUPS, SAAS_QUOTA_OPTIONS } from '../../utils/saasOfferingCatalog';

const { Title, Text } = Typography;
const formatIrt = (value: unknown) => `${Number(value || 0).toLocaleString('fa-IR')} تومان`;
const moduleOptions = SAAS_MODULE_GROUPS.flatMap((group) => group.modules);
const quotaOptions = SAAS_QUOTA_OPTIONS;

const SaasAdminCatalogItems: React.FC = () => {
  const { message } = App.useApp();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();
  const kind = Form.useWatch('item_kind', form) || 'quota';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_saas_catalog_items');
      if (error) throw error;
      setItems(Array.isArray(data) ? data : []);
    } catch (error: any) { message.error(error?.message || 'دریافت فهرست افزونه‌ها ناموفق بود.'); }
    finally { setLoading(false); }
  }, [message]);
  useEffect(() => { void load(); }, [load]);

  const edit = (item?: any) => {
    setEditing(item || null);
    form.resetFields();
    form.setFieldsValue(item || { item_kind: 'quota', billing_cycle: 'one_time', quantity: 1, price_irt: 0, is_active: false, is_public: true, sort_order: 100 });
    setOpen(true);
  };
  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const { error } = await supabase.rpc('admin_upsert_saas_catalog_item', { p_item: values });
      if (error) throw error;
      message.success('افزونه فروشگاه ذخیره شد.');
      setOpen(false); void load();
    } catch (error: any) {
      if (!error?.errorFields) message.error(error?.message || 'ذخیره افزونه ناموفق بود.');
    } finally { setSaving(false); }
  };
  const entitlementOptions = kind === 'module' ? moduleOptions : kind === 'feature' ? SAAS_FEATURE_OPTIONS : quotaOptions;

  return <div className="p-4 md:p-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Title level={4} className="!mb-0"><ShoppingCartOutlined /> افزونه‌های فروشگاه</Title><Text type="secondary">قیمت و وضعیت خرید آنلاین ماژول‌ها، امکانات و سهمیه‌ها</Text></div><Space><Button icon={<ReloadOutlined />} onClick={() => void load()}>بارگذاری</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>افزودن افزونه</Button></Space></div>
    <Card className="rounded-2xl"><Table loading={loading} rowKey="id" dataSource={items} scroll={{ x: 760 }} pagination={{ pageSize: 20 }} columns={[
      { title: 'عنوان', dataIndex: 'title', render: (value, row) => <div><div className="font-bold">{value}</div><Text type="secondary" className="text-xs">{row.code}</Text></div> },
      { title: 'نوع', dataIndex: 'item_kind', render: (value) => <Tag>{value === 'module' ? 'ماژول' : value === 'feature' ? 'امکان' : 'سهمیه'}</Tag> },
      { title: 'چرخه پرداخت', dataIndex: 'billing_cycle', render: (value) => <Tag color={value === 'monthly' ? 'purple' : 'default'}>{value === 'monthly' ? 'ماهانه' : 'یک‌باره'}</Tag> },
      { title: 'مقدار', dataIndex: 'quantity' }, { title: 'قیمت', dataIndex: 'price_irt', render: formatIrt },
      { title: 'وضعیت', render: (_, row) => <Space>{row.is_active ? <Tag color="green">فعال</Tag> : <Tag>غیرفعال</Tag>}{row.is_public ? <Tag color="blue">نمایش مشتری</Tag> : null}</Space> },
      { title: '', render: (_, row) => <Button size="small" icon={<EditOutlined />} onClick={() => edit(row)}>ویرایش</Button> },
    ]} /></Card>
    <Drawer title={editing ? 'ویرایش افزونه فروشگاه' : 'افزونه جدید فروشگاه'} open={open} onClose={() => setOpen(false)} width="min(540px, 100vw)" footer={<div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>انصراف</Button><Button type="primary" loading={saving} onClick={() => void save()}>ذخیره</Button></div>}>
      <Form form={form} layout="vertical"><Form.Item name="code" label="کد پایدار" rules={[{ required: true, message: 'کد الزامی است.' }]}><Input disabled={!!editing} placeholder="مثال: sms_1000" /></Form.Item><Form.Item name="title" label="عنوان" rules={[{ required: true, message: 'عنوان الزامی است.' }]}><Input /></Form.Item><Form.Item name="description" label="توضیح"><Input.TextArea rows={3} /></Form.Item><Form.Item name="item_kind" label="نوع" rules={[{ required: true }]}><Select options={[{ value: 'module', label: 'ماژول' }, { value: 'feature', label: 'امکان' }, { value: 'quota', label: 'سهمیه' }]} /></Form.Item><Form.Item name="entitlement_code" label="موردی که فعال می‌شود" rules={[{ required: true, message: 'مورد را انتخاب کنید.' }]}><Select showSearch optionFilterProp="label" options={entitlementOptions.map((item) => ({ value: item.id, label: item.label }))} /></Form.Item><Form.Item name="billing_cycle" label="روش دریافت هزینه" rules={[{ required: true }]} extra="اقلام ماهانه هر ۳۰ روز تمدید و نخست از کیف پول سازمان کسر می‌شوند."><Select options={[{ value: 'one_time', label: 'یک‌باره' }, { value: 'monthly', label: 'ماهانه (هر ۳۰ روز)' }]} /></Form.Item><div className="grid grid-cols-2 gap-3"><Form.Item name="quantity" label="مقدار" rules={[{ required: true }]}><InputNumber min={1} className="w-full" /></Form.Item><Form.Item name="price_irt" label="قیمت (تومان)" rules={[{ required: true }]}><InputNumber min={0} className="w-full" /></Form.Item><Form.Item name="sort_order" label="ترتیب نمایش"><InputNumber className="w-full" /></Form.Item></div><Form.Item name="is_active" label="برای خرید فعال باشد" valuePropName="checked"><Switch /></Form.Item><Form.Item name="is_public" label="به مشتری نمایش داده شود" valuePropName="checked"><Switch /></Form.Item></Form>
    </Drawer>
  </div>;
};

export default SaasAdminCatalogItems;
