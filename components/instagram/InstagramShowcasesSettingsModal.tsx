import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Form, Image, Input, Modal, Popconfirm, Select, Space, Switch } from 'antd';
import { DeleteOutlined, InfoCircleOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { getRecordTitle } from '../../utils/recordTitle';
import { MODULES } from '../../moduleRegistry';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type Account = { id: string; username: string };
type SourceRecord = { id: string; moduleId: 'products' | 'billboards'; title: string; image_url?: string | null; description?: string | null; sell_price?: number | null; price?: number | null; main_unit?: string | null };
type Showcase = { id: string; name: string; description?: string | null; account_id?: string | null; source_kind: string; source_id?: string | null; is_active: boolean; presentation?: { image_url?: string | null }; button_templates?: any[]; items?: any[] };

const BUTTON_ACTIONS = [
  { value: 'postback', label: 'ثبت انتخاب برای گردش‌کار' },
  { value: 'send_message', label: 'ثبت درخواست پاسخ خودکار' },
  { value: 'field_value', label: 'ثبت درخواست نمایش اطلاعات محصول' },
  { value: 'request_human', label: 'ثبت درخواست ارجاع به اپراتور' },
  { value: 'open_url', label: 'باز کردن لینک' },
];

const BUTTON_ACTION_HELP: Record<string, string> = {
  postback: 'با کلیک کاربر، یک رویداد ثبت می‌شود تا گردش‌کارهای همین پیج بتوانند واکنش نشان دهند.',
  send_message: 'با کلیک کاربر، درخواست پاسخ خودکار ثبت می‌شود؛ متن پاسخ را در گردش‌کارهای اینستاگرام تعیین کنید.',
  field_value: 'با کلیک کاربر، درخواست نمایش اطلاعات محصول ثبت می‌شود؛ نمایش نهایی را در گردش‌کارهای اینستاگرام تعیین کنید.',
  request_human: 'با کلیک کاربر، درخواست رسیدگی اپراتور ثبت می‌شود؛ می‌توانید آن را به فعالیت یا اعلان تبدیل کنید.',
  open_url: 'کاربر مستقیماً به آدرس اینترنتی واردشده منتقل می‌شود.',
};

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
  const previewName = Form.useWatch('name', form) || 'نام پیام دکمه‌دار';
  const previewDescription = Form.useWatch('description', form) || 'متن پیام اینجا نمایش داده می‌شود.';
  const previewImageUrl = Form.useWatch('imageUrl', form) || '';
  const previewButtons = Form.useWatch('buttons', form) || [];
  const selectedRecords = useMemo(() => records.filter((record) => selectedIds.includes(`${record.moduleId}:${record.id}`)), [records, selectedIds]);
  const openCreate = () => { setEditing(null); form.setFieldsValue({ name: '', description: '', imageUrl: '', accountId: defaultAccountId || undefined, sourceKind: 'manual', sourceId: undefined, recordIds: [], buttons: [], isActive: true }); };
  const openEdit = (showcase: Showcase) => {
    setEditing(showcase);
    form.setFieldsValue({ name: showcase.name, description: showcase.description || '', imageUrl: showcase.presentation?.image_url || '', accountId: showcase.account_id || undefined, sourceKind: showcase.source_kind, sourceId: showcase.source_id || undefined, recordIds: (showcase.items || []).map((item: any) => `${item.source_module_id}:${item.source_record_id}`), buttons: (showcase.button_templates || []).map((button: any) => ({ title: button.title, action_type: button.action_type === 'open_url' ? 'open_url' : button.action_type || 'postback', payloadText: button.payload?.text || button.payload?.field_key || button.payload?.url || '' })), isActive: showcase.is_active !== false });
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
      await invoke({ action: 'save_showcase', showcaseId: editing?.id, name: value.name, description: value.description, imageUrl: value.imageUrl, accountId: value.accountId, sourceKind: value.sourceKind, sourceId: value.sourceId, isActive: value.isActive, buttonTemplates, items: value.sourceKind === 'manual' ? items : [] });
      message.success('ویترین محصولات ذخیره شد.'); openCreate(); await load();
    } catch (error) { message.error(toFaErrorMessage(error, 'ذخیره ویترین ناموفق بود.')); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => { try { await invoke({ action: 'delete_showcase', showcaseId: id }); message.success('ویترین حذف شد.'); if (editing?.id === id) openCreate(); await load(); } catch (error) { message.error(toFaErrorMessage(error, 'حذف ویترین ناموفق بود.')); } };

  return <Modal open={open} onCancel={onClose} title="تنظیمات پیام‌های دکمه‌دار" width={1360} footer={null} destroyOnHidden>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_310px]" dir="rtl">
      <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10"><Button type="primary" block icon={<PlusOutlined />} loading={loading} onClick={openCreate}>پیام دکمه‌دار جدید</Button><div className="mt-3 space-y-2">{showcases.length ? showcases.map((showcase) => <div key={showcase.id} className={`rounded-lg border p-2 ${editing?.id === showcase.id ? 'border-pink-400 bg-pink-50 dark:bg-pink-500/10' : 'border-slate-200 dark:border-white/10'}`}><button type="button" className="w-full text-right" onClick={() => openEdit(showcase)}><div className="font-medium">{showcase.name}</div><div className="mt-1 text-xs text-slate-500">{showcase.source_kind === 'manual' ? `${showcase.items?.length || 0} کالا یا خدمت` : showcase.source_kind === 'price_list' ? 'لیست قیمت' : 'کاتالوگ آنلاین'}</div></button><Popconfirm title="پیام دکمه‌دار حذف شود؟" okText="حذف" cancelText="انصراف" onConfirm={() => void remove(showcase.id)}><Button className="mt-1" danger type="text" size="small" icon={<DeleteOutlined />}>حذف</Button></Popconfirm></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="پیام دکمه‌داری ساخته نشده است." />}</div></div>
      <div className="min-w-0"><Form form={form} layout="vertical" initialValues={{ sourceKind: 'manual', buttons: [], isActive: true }}><div className="grid grid-cols-1 gap-x-3 md:grid-cols-2"><Form.Item name="name" label="نام پیام دکمه‌دار" rules={[{ required: true, message: 'نام پیام دکمه‌دار را وارد کنید.' }]}><Input placeholder="مثلا معرفی محصولات پرفروش" /></Form.Item><Form.Item name="accountId" label="پیج پیش‌فرض"><Select allowClear options={accounts.map((account) => ({ value: account.id, label: `@${account.username}` }))} placeholder="برای همه پیج‌ها" /></Form.Item></div><Form.Item name="description" label="متن پیام"><Input.TextArea rows={2} /></Form.Item><Form.Item name="imageUrl" label="تصویر پیام"><Input prefix={<PictureOutlined />} placeholder="نشانی مستقیم تصویر HTTPS (اختیاری)" /><div className="mt-1 text-xs text-slate-500">در ارسال نهایی، تصویر در کارت رسمی پیام اینستاگرام نمایش داده می‌شود.</div></Form.Item><div className="grid grid-cols-1 gap-x-3 md:grid-cols-2"><Form.Item name="sourceKind" label="منبع اطلاعات پیام"><Select options={[{ value: 'manual', label: 'انتخاب کالا و خدمات' }, { value: 'price_list', label: 'لیست قیمت' }, { value: 'online_catalog', label: 'کاتالوگ آنلاین' }]} /></Form.Item><Form.Item name="isActive" label="وضعیت" valuePropName="checked"><Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" /></Form.Item></div>{sourceKind === 'manual' ? <Form.Item name="recordIds" label="کالاها و خدمات پیام"><Select mode="multiple" showSearch optionFilterProp="label" options={records.map((record) => ({ value: `${record.moduleId}:${record.id}`, label: `${record.moduleId === 'billboards' ? 'تبلیغات محیطی' : 'کالا/خدمت'}: ${record.title}` }))} placeholder="کالاها و خدمات را انتخاب کنید" maxTagCount="responsive" /></Form.Item> : <Form.Item name="sourceId" label={sourceKind === 'price_list' ? 'لیست قیمت' : 'کاتالوگ آنلاین'} rules={[{ required: true, message: 'منبع پیام را انتخاب کنید.' }]}><Select options={(sourceKind === 'price_list' ? priceLists.map((item) => ({ value: item.id, label: item.name })) : catalogs.map((item) => ({ value: item.id, label: item.title }))) } /></Form.Item>}<div className="rounded-xl border border-slate-200 p-3 dark:border-white/10"><div className="mb-2 font-medium">دکمه‌های پیام <span className="text-xs text-slate-500">(حداکثر ۳)</span></div><div className="mb-3 flex gap-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-white/[0.04] dark:text-slate-300"><InfoCircleOutlined className="mt-0.5" /><span>دکمه‌های غیرلینکی انتخاب کاربر را به‌صورت رویداد ثبت می‌کنند؛ واکنش نهایی‌شان را در «گردش‌کارهای اینستاگرام» تعیین کنید.</span></div><Form.List name="buttons">{(fields, { add, remove: removeButton }) => <div className="space-y-2">{fields.map((field) => <div key={field.key} className="rounded-lg border border-slate-100 p-2 dark:border-white/[0.08]"><div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1.2fr_1.4fr_auto]"><Form.Item name={[field.name, 'title']} rules={[{ required: true, message: 'عنوان لازم است.' }]}><Input placeholder="عنوان دکمه" /></Form.Item><Form.Item name={[field.name, 'action_type']} rules={[{ required: true, message: 'اقدام لازم است.' }]}><Select options={BUTTON_ACTIONS} placeholder="پس از کلیک چه شود؟" /></Form.Item><Form.Item name={[field.name, 'payloadText']}><Input placeholder="برای لینک: نشانی؛ برای سایر موارد: توضیح کوتاه" /></Form.Item><Button danger type="text" onClick={() => removeButton(field.name)}>حذف</Button></div><Form.Item noStyle shouldUpdate={(prev, current) => prev.buttons?.[field.name]?.action_type !== current.buttons?.[field.name]?.action_type}>{() => <div className="text-[11px] text-slate-500">{BUTTON_ACTION_HELP[form.getFieldValue(['buttons', field.name, 'action_type']) || 'postback']}</div>}</Form.Item></div>)}{fields.length < 3 ? <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ action_type: 'postback' })}>افزودن دکمه</Button> : null}</div>}</Form.List></div><Space className="mt-5"><Button type="primary" loading={saving} onClick={() => void save()}>ذخیره پیام دکمه‌دار</Button><Button onClick={openCreate}>انصراف از ویرایش</Button></Space></Form></div>
      <aside className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/[0.1] dark:bg-white/[0.035]"><div className="mb-3 font-semibold">پیش‌نمایش واقعی پیام</div><div className="rounded-[1.6rem] bg-[#e9eef1] p-3 shadow-inner dark:bg-[#0d1214]"><div className="rounded-2xl bg-white p-2.5 text-right text-slate-800 shadow-sm dark:bg-[#232b2e] dark:text-white">{previewImageUrl ? <Image preview={false} src={previewImageUrl} className="mb-2 !max-h-44 !w-full rounded-xl object-cover" /> : null}<div className="font-semibold">{previewName}</div><div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{previewDescription}</div>{previewButtons.filter((button: any) => String(button?.title || '').trim()).map((button: any, index: number) => <div key={`${button.title}-${index}`} className="mt-2 rounded-xl border border-[rgba(var(--brand-500-rgb),0.22)] px-3 py-2 text-center text-sm font-medium text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-200-rgb))]">{button.title}</div>)}</div>{selectedRecords.length ? <div className="mt-3 text-xs text-slate-500">{selectedRecords.length.toLocaleString('fa-IR')} کارت محصول/خدمت نیز در پیام نهایی قرار می‌گیرد.</div> : null}</div></aside>
    </div>
  </Modal>;
};

export default InstagramShowcasesSettingsModal;
