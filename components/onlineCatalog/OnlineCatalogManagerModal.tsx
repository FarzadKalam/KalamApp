import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Checkbox, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { CopyOutlined, EditOutlined, LinkOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import { getFieldLabelFa } from '../../utils/fieldLabel';
import { safeJalaliFormat } from '../../utils/persianNumberFormatter';
import {
  buildOnlineCatalogPublicUrl,
  getOnlineCatalogModuleTitle,
  listOnlineCatalogs,
  saveOnlineCatalog,
  setOnlineCatalogActive,
  type OnlineCatalogModuleId,
  type OnlineCatalogRow,
} from '../../utils/onlineCatalog';
import { hasOnlineCatalogFeature } from '../../utils/onlineCatalogs';

type Props = {
  open: boolean;
  moduleId: OnlineCatalogModuleId;
  sourceRecordIds?: string[];
  onCancel: () => void;
  onSaved?: () => void | Promise<void>;
};

const OnlineCatalogManagerModal: React.FC<Props> = ({ open, moduleId, sourceRecordIds = [], onCancel, onSaved }) => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<OnlineCatalogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<OnlineCatalogRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'phone'>('desktop');
  const [form] = Form.useForm();
  const presentation = Form.useWatch('presentation', form) || {};
  const moduleConfig = MODULES[moduleId];
  const displayFields = useMemo(() => (moduleConfig?.fields || []).filter((field: any) =>
    field?.type !== 'json' && field?.type !== 'image' && field?.nature !== 'system' && field?.printable !== false
  ), [moduleConfig]);

  const load = async () => {
    setLoading(true);
    try { setRows(await listOnlineCatalogs(supabase, moduleId)); }
    catch (error: any) { message.error(String(error?.message || 'بارگذاری کاتالوگ‌ها ناموفق بود.')); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void hasOnlineCatalogFeature().then((enabled: boolean) => {
      if (cancelled) return;
      setFeatureEnabled(enabled);
      void load();
      if (!enabled) message.warning('فعال‌سازی و ایجاد کاتالوگ آنلاین به ویژگی پلن نیاز دارد.');
    }).catch(() => {
      if (!cancelled) setFeatureEnabled(false);
    });
    return () => { cancelled = true; };
  }, [open, moduleId]);

  const openEditor = (row?: OnlineCatalogRow | null) => {
    setEditing(row || null);
    form.setFieldsValue({
      title: row?.title || getOnlineCatalogModuleTitle(moduleId),
      public_description: row?.public_description || '',
      internal_description: row?.internal_description || '',
      template_id: row?.template_id || 'catalog_grid',
      is_active: row?.is_active !== false,
      display_field_keys: row?.display_field_keys || displayFields.slice(0, 6).map((field: any) => field.key),
      tags: Array.isArray(row?.tags) ? row.tags.map((item: any) => String(item?.label || item || '')) : [],
      presentation: row?.presentation || {},
    });
    setEditorOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await saveOnlineCatalog(supabase, {
        ...(editing || {}), module_id: moduleId, title: values.title,
        public_description: values.public_description, internal_description: values.internal_description,
        template_id: values.template_id, is_active: featureEnabled ? values.is_active : editing?.is_active !== false,
        display_field_keys: values.display_field_keys || [], tags: (values.tags || []).map((label: string) => ({ label })),
        presentation: values.presentation || {},
        source_record_ids: editing?.source_record_ids?.length ? editing.source_record_ids : sourceRecordIds,
      });
      message.success('کاتالوگ ذخیره شد.');
      setEditorOpen(false);
      await load();
      await onSaved?.();
    } catch (error: any) { message.error(String(error?.message || 'ذخیره کاتالوگ ناموفق بود.')); }
    finally { setSaving(false); }
  };

  const copyLink = async (row: OnlineCatalogRow) => {
    const url = await buildOnlineCatalogPublicUrl(supabase, row.public_token);
    await navigator.clipboard.writeText(url);
    message.success('لینک کاتالوگ کپی شد.');
  };

  const openLink = async (row: OnlineCatalogRow) => {
    const url = await buildOnlineCatalogPublicUrl(supabase, row.public_token);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return <>
    <Modal open={open} onCancel={onCancel} footer={null} width={960} destroyOnHidden title={`کاتالوگ‌های آنلاین «${getOnlineCatalogModuleTitle(moduleId)}»`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Typography.Text type="secondary">کاتالوگ‌ها با دادهٔ زندهٔ رکوردهای انتخاب‌شده نمایش داده می‌شوند.</Typography.Text><Space><Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>تازه‌سازی</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)} disabled={!sourceRecordIds.length || !featureEnabled}>ایجاد کاتالوگ جدید</Button></Space></div>
      <Table rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 8 }} locale={{ emptyText: <Empty description="کاتالوگی ثبت نشده است" /> }} columns={[
        { title: 'عنوان', dataIndex: 'title', render: (value: string, row: OnlineCatalogRow) => <div><div className="font-semibold">{value}</div><div className="mt-1 flex flex-wrap gap-1">{row.tags.map((tag: any, index: number) => <Tag key={`${index}-${tag?.label || tag}`} color="blue">{String(tag?.label || tag)}</Tag>)}</div></div> },
        { title: 'وضعیت', dataIndex: 'is_active', render: (value: boolean, row: OnlineCatalogRow) => <Switch size="small" checked={value} disabled={!featureEnabled} checkedChildren="فعال" unCheckedChildren="غیرفعال" onChange={(next) => void setOnlineCatalogActive(supabase, row.id, next).then(load).catch(() => message.error('تغییر وضعیت کاتالوگ ناموفق بود.'))} /> },
        { title: 'تعداد رکورد', dataIndex: 'record_count', render: (value: number) => value.toLocaleString('fa-IR') },
        { title: 'آخرین به‌روزرسانی', dataIndex: 'last_refreshed_at', render: (value: string) => safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '—' },
        { title: 'عملیات', key: 'actions', render: (_: unknown, row: OnlineCatalogRow) => <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEditor(row)}>ویرایش</Button><Button size="small" icon={<LinkOutlined />} onClick={() => void openLink(row)} disabled={!row.is_active}>مشاهده</Button><Button size="small" icon={<CopyOutlined />} onClick={() => void copyLink(row)}>کپی لینک</Button></Space> },
      ]} />
    </Modal>
    <Modal open={editorOpen} onCancel={() => setEditorOpen(false)} onOk={() => void submit()} okText="ذخیره" cancelText="انصراف" confirmLoading={saving} width={860} destroyOnHidden title={editing ? 'ویرایش کاتالوگ آنلاین' : 'ایجاد کاتالوگ آنلاین'}>
      <Form form={form} layout="vertical"><Form.Item name="title" label="عنوان کاتالوگ" rules={[{ required: true, message: 'عنوان کاتالوگ را وارد کنید.' }]}><Input /></Form.Item><Form.Item name="template_id" label="قالب نمایش"><Select options={[{ value: 'catalog_grid', label: 'قالب شبکه‌ای' }, { value: 'catalog_fullpage', label: 'قالب تمام‌صفحه' }]} /></Form.Item><Form.Item name="public_description" label="توضیحات قابل‌نمایش"><Input.TextArea rows={3} /></Form.Item><Form.Item name="internal_description" label="توضیحات داخلی"><Input.TextArea rows={2} /></Form.Item><Form.Item name="display_field_keys" label="فیلدهای قابل‌نمایش"><Select mode="multiple" options={displayFields.map((field: any) => ({ value: field.key, label: getFieldLabelFa(field, { moduleId, fallback: field.labels?.fa || field.key }) }))} /></Form.Item><Form.Item name="tags" label="برچسب‌ها"><Select mode="tags" tokenSeparators={[',']} placeholder="برچسب‌ها را وارد کنید" /></Form.Item><Form.Item name={['presentation', 'organization_intro']} label="متن معرفی سازمان"><Input.TextArea rows={3} /></Form.Item><Form.Item name={['presentation', 'advisor_name']} label="نام مشاور شما"><Input /></Form.Item><div className="mb-2 font-semibold">کارت‌های ویژگی (حداکثر ۴ مورد)</div><Form.List name={['presentation', 'feature_cards']}>{(fields, { add, remove }) => <>{fields.map((field) => <div key={field.key} className="mb-2 flex gap-2"><Form.Item {...field} name={[field.name, 'icon']} className="mb-0" style={{ width: 90 }}><Input placeholder="آیکون" /></Form.Item><Form.Item {...field} name={[field.name, 'title']} className="mb-0 flex-1"><Input placeholder="عنوان" /></Form.Item><Form.Item {...field} name={[field.name, 'subtitle']} className="mb-0 flex-1"><Input placeholder="زیرعنوان" /></Form.Item><Button danger onClick={() => remove(field.name)}>حذف</Button></div>)}<Button onClick={() => fields.length < 4 && add({})} disabled={fields.length >= 4}>افزودن کارت ویژگی</Button></>}</Form.List><div className="mb-2 mt-3 font-semibold">بخشی از مشتریان ما</div><Form.List name={['presentation', 'customers']}>{(fields, { add, remove }) => <>{fields.map((field) => <div key={field.key} className="mb-2 flex gap-2"><Form.Item {...field} name={[field.name, 'name']} className="mb-0 flex-1"><Input placeholder="نام مشتری" /></Form.Item><Form.Item {...field} name={[field.name, 'logo_url']} className="mb-0 flex-1"><Input placeholder="لینک لوگو" /></Form.Item><Button danger onClick={() => remove(field.name)}>حذف</Button></div>)}<Button onClick={() => add({})}>افزودن مشتری</Button></>}</Form.List><Form.Item name="is_active" valuePropName="checked" className="mt-3"><Checkbox>کاتالوگ فعال باشد</Checkbox></Form.Item></Form>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="mb-2 flex justify-between"><span className="font-semibold">پیش‌نمایش کاتالوگ</span><Space><Button size="small" type={previewMode === 'desktop' ? 'primary' : 'default'} onClick={() => setPreviewMode('desktop')}>نمایشگر</Button><Button size="small" type={previewMode === 'phone' ? 'primary' : 'default'} onClick={() => setPreviewMode('phone')}>گوشی</Button></Space></div><div className={`mx-auto overflow-hidden rounded-2xl bg-white p-3 shadow-inner transition-all ${previewMode === 'phone' ? 'max-w-[280px]' : 'max-w-full'}`}><div className="rounded-xl bg-[rgb(var(--brand-600-rgb,37,99,235))] p-4 text-white"><div className="text-lg font-black">{form.getFieldValue('title') || getOnlineCatalogModuleTitle(moduleId)}</div><div className="mt-1 text-xs opacity-80">{form.getFieldValue('public_description') || 'معرفی کوتاه کاتالوگ'}</div></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{(Array.isArray(presentation.feature_cards) ? presentation.feature_cards : []).map((card: any, index: number) => <div key={index} className="rounded-xl bg-slate-50 p-2 text-center"><div className="font-bold">{card?.icon || '★'} {card?.title || 'ویژگی'}</div><div className="text-[10px] text-slate-500">{card?.subtitle}</div></div>)}</div></div></div>
    </Modal>
  </>;
};

export default OnlineCatalogManagerModal;
