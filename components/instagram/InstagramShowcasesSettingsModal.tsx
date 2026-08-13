import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Form, Image, Input, Modal, Popconfirm, Select, Space, Switch, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { getRecordTitle } from '../../utils/recordTitle';
import { MODULES } from '../../moduleRegistry';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type Account = { id: string; username: string };
type SourceRecord = { id: string; moduleId: 'products' | 'billboards'; title: string; image_url?: string | null; description?: string | null; sell_price?: number | null; price?: number | null; main_unit?: string | null };
type Showcase = { id: string; name: string; description?: string | null; account_id?: string | null; source_kind: string; source_id?: string | null; is_active: boolean; button_templates?: any[]; items?: any[] };

const BUTTON_ACTIONS = [
  { value: 'postback', label: 'ثبت رویداد و ادامهٔ گردش‌کار' },
  { value: 'send_message', label: 'ارسال متن آماده' },
  { value: 'field_value', label: 'نمایش مقدار فیلد محصول' },
  { value: 'request_human', label: 'درخواست اپراتور' },
  { value: 'open_url', label: 'باز کردن لینک' },
];

const InstagramShowcasesSettingsModal: React.FC<{ open: boolean; onClose: () => void; accounts: Account[]; defaultAccountId?: string | null }> = ({ open, onClose, accounts, defaultAccountId }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [showcases, setShowcases] = useState<Showcase[]>([]);
  const [records, setRecords] = useState<SourceRecord[]>([]);
  const [catalogs, setCatalogs] = useState<Array<{ id: string; title: string }>>([]);
  const [priceLists, setPriceLists] = useState<Array<{ id: string; name: string }>>([]);
  const [editing, setEditing] = useState<Showcase | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const invoke = useCallback(async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('instagram-boxapi', { body });
    if (error || data?.success === false) throw new Error(data?.message || error?.message || 'عملیات ویترین انجام نشد.');
    return data;
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, products, billboards, catalogRows, priceRows] = await Promise.all([
        invoke({ action: 'list_showcases' }),
        supabase.from('products').select('id,name,image_url,description,sell_price,main_unit').limit(100),
        supabase.from('billboards').select('id,address,image_url,description').limit(100),
        supabase.from('online_catalogs').select('id,title').eq('is_active', true).order('title').limit(100),
        supabase.from('price_lists').select('id,name').limit(100),
      ]);
      setShowcases(Array.isArray(data.showcases) ? data.showcases : []);
      const normalize = (rows: any[], moduleId: 'products' | 'billboards') => rows.map((row) => ({ ...row, moduleId, price: row.sell_price ?? null, title: getRecordTitle(row, MODULES[moduleId]) }));
      setRecords([...normalize(products.data || [], 'products'), ...normalize(billboards.data || [], 'billboards')]);
      setCatalogs((catalogRows.data || []) as Array<{ id: string; title: string }>);
      setPriceLists((priceRows.data || []) as Array<{ id: string; name: string }>);
    } catch (error) { message.error(toFaErrorMessage(error, 'بارگذاری ویترین‌ها ناموفق بود.')); }
    finally { setLoading(false); }
  }, [invoke, message]);
  useEffect(() => { if (open) void load(); }, [load, open]);

  const sourceKind = Form.useWatch('sourceKind', form) || 'manual';
  const selectedIds = Form.useWatch('recordIds', form) || [];
  const selectedRecords = useMemo(() => records.filter((record) => selectedIds.includes(`${record.moduleId}:${record.id}`)), [records, selectedIds]);
  const openCreate = () => { setEditing(null); form.setFieldsValue({ name: '', description: '', accountId: defaultAccountId || undefined, sourceKind: 'manual', sourceId: undefined, recordIds: [], buttons: [], isActive: true }); };
  const openEdit = (showcase: Showcase) => {
    setEditing(showcase);
    form.setFieldsValue({ name: showcase.name, description: showcase.description || '', accountId: showcase.account_id || undefined, sourceKind: showcase.source_kind, sourceId: showcase.source_id || undefined, recordIds: (showcase.items || []).map((item: any) => `${item.source_module_id}:${item.source_record_id}`), buttons: (showcase.button_templates || []).map((button: any) => ({ title: button.title, action_type: button.action_type === 'open_url' ? 'open_url' : button.action_type || 'postback', payloadText: button.payload?.text || button.payload?.field_key || button.payload?.url || '' })), isActive: showcase.is_active !== false });
  };
  const save = async () => {
    try {
      const value = await form.validateFields();
      setSaving(true);
      const items = selectedRecords.map((record) => ({ source_module_id: record.moduleId, source_record_id: record.id, snapshot: { title: record.title, image_url: record.image_url || null, description: record.description || null, price: record.sell_price ?? null, unit_name: record.main_unit || null } }));
      const buttonTemplates = (value.buttons || []).map((button: any, index: number) => ({
        key: `button_${index + 1}`,
        title: String(button.title || '').trim(),
        action_type: button.action_type,
        payload: button.action_type === 'open_url' ? { url: String(button.payloadText || '').trim() } : { text: String(button.payloadText || '').trim() },
      }));
      await invoke({ action: 'save_showcase', showcaseId: editing?.id, name: value.name, description: value.description, accountId: value.accountId, sourceKind: value.sourceKind, sourceId: value.sourceId, isActive: value.isActive, buttonTemplates, items: value.sourceKind === 'manual' ? items : [] });
      message.success('ویترین محصولات ذخیره شد.'); openCreate(); await load();
    } catch (error) { message.error(toFaErrorMessage(error, 'ذخیره ویترین ناموفق بود.')); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => { try { await invoke({ action: 'delete_showcase', showcaseId: id }); message.success('ویترین حذف شد.'); if (editing?.id === id) openCreate(); await load(); } catch (error) { message.error(toFaErrorMessage(error, 'حذف ویترین ناموفق بود.')); } };

  return <Modal open={open} onCancel={onClose} title="تنظیمات ویترین محصولات" width={1100} footer={null} destroyOnHidden>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10"><Button type="primary" block icon={<PlusOutlined />} onClick={openCreate}>ویترین جدید</Button><div className="mt-3 space-y-2">{showcases.length ? showcases.map((showcase) => <div key={showcase.id} className={`rounded-lg border p-2 ${editing?.id === showcase.id ? 'border-pink-400 bg-pink-50 dark:bg-pink-500/10' : 'border-slate-200 dark:border-white/10'}`}><button type="button" className="w-full text-right" onClick={() => openEdit(showcase)}><div className="font-medium">{showcase.name}</div><div className="mt-1 text-xs text-slate-500">{showcase.source_kind === 'manual' ? `${showcase.items?.length || 0} کالا یا خدمت` : showcase.source_kind === 'price_list' ? 'لیست قیمت' : 'کاتالوگ آنلاین'}</div></button><Popconfirm title="ویترین حذف شود؟" okText="حذف" cancelText="انصراف" onConfirm={() => void remove(showcase.id)}><Button className="mt-1" danger type="text" size="small" icon={<DeleteOutlined />}>حذف</Button></Popconfirm></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="ویترینی ساخته نشده است." />}</div></div>
      <div className="min-w-0"><Form form={form} layout="vertical" initialValues={{ sourceKind: 'manual', buttons: [], isActive: true }}><div className="grid grid-cols-1 gap-x-3 md:grid-cols-2"><Form.Item name="name" label="نام ویترین" rules={[{ required: true, message: 'نام ویترین را وارد کنید.' }]}><Input placeholder="مثلا محصولات پرفروش" /></Form.Item><Form.Item name="accountId" label="پیج پیش‌فرض"><Select allowClear options={accounts.map((account) => ({ value: account.id, label: `@${account.username}` }))} placeholder="برای همه پیج‌ها" /></Form.Item></div><Form.Item name="description" label="توضیح کوتاه"><Input.TextArea rows={2} /></Form.Item><div className="grid grid-cols-1 gap-x-3 md:grid-cols-2"><Form.Item name="sourceKind" label="منبع ویترین"><Select options={[{ value: 'manual', label: 'انتخاب کالا و خدمات' }, { value: 'price_list', label: 'لیست قیمت' }, { value: 'online_catalog', label: 'کاتالوگ آنلاین' }]} /></Form.Item><Form.Item name="isActive" label="وضعیت" valuePropName="checked"><Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" /></Form.Item></div>{sourceKind === 'manual' ? <Form.Item name="recordIds" label="کالاها و خدمات ویترین"><Select mode="multiple" showSearch optionFilterProp="label" options={records.map((record) => ({ value: `${record.moduleId}:${record.id}`, label: `${record.moduleId === 'billboards' ? 'تبلیغات محیطی' : 'کالا/خدمت'}: ${record.title}` }))} placeholder="کالاها و خدمات را انتخاب کنید" maxTagCount="responsive" /></Form.Item> : <Form.Item name="sourceId" label={sourceKind === 'price_list' ? 'لیست قیمت' : 'کاتالوگ آنلاین'} rules={[{ required: true, message: 'منبع ویترین را انتخاب کنید.' }]}><Select options={(sourceKind === 'price_list' ? priceLists.map((item) => ({ value: item.id, label: item.name })) : catalogs.map((item) => ({ value: item.id, label: item.title }))) } /></Form.Item>}<div className="rounded-xl border border-slate-200 p-3 dark:border-white/10"><div className="mb-2 font-medium">دکمه‌های هر کارت <span className="text-xs text-slate-500">(حداکثر ۳)</span></div><Form.List name="buttons">{(fields, { add, remove: removeButton }) => <div className="space-y-2">{fields.map((field) => <div key={field.key} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1.2fr_1.4fr_auto]"><Form.Item name={[field.name, 'title']} rules={[{ required: true, message: 'عنوان لازم است.' }]}><Input placeholder="عنوان" /></Form.Item><Form.Item name={[field.name, 'action_type']} rules={[{ required: true, message: 'اقدام لازم است.' }]}><Select options={BUTTON_ACTIONS} placeholder="عملکرد" /></Form.Item><Form.Item name={[field.name, 'payloadText']}><Input placeholder="لینک، متن یا کلید رویداد" /></Form.Item><Button danger type="text" onClick={() => removeButton(field.name)}>حذف</Button></div>)}{fields.length < 3 ? <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ action_type: 'postback' })}>افزودن دکمه</Button> : null}</div>}</Form.List></div>{sourceKind === 'manual' && selectedRecords.length ? <div className="mt-4"><div className="mb-2 font-medium">پیش‌نمایش کارت‌های ویترین</div><div className="flex gap-3 overflow-x-auto pb-2">{selectedRecords.map((record) => <Card key={`${record.moduleId}:${record.id}`} className="w-48 shrink-0" cover={record.image_url ? <Image preview={false} height={120} src={record.image_url} className="object-cover" /> : undefined}><Card.Meta title={record.title} description={<><div>{record.price ? `${Number(record.price).toLocaleString('fa-IR')} ریال` : 'قیمت ثبت نشده'}</div>{record.main_unit ? <Tag>{record.main_unit}</Tag> : null}</>} /></Card>)}</div></div> : null}<Space className="mt-5"><Button type="primary" loading={saving} onClick={() => void save()}>ذخیره ویترین</Button><Button onClick={openCreate}>انصراف از ویرایش</Button></Space></Form></div>
    </div>
  </Modal>;
};

export default InstagramShowcasesSettingsModal;
