import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Checkbox, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography, Upload } from 'antd';
import { CopyOutlined, EditOutlined, LinkOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../../utils/storageClient';
import { isUploadCanceledError, uploadFileWithProgress } from '../../utils/uploadFileWithProgress';
import { getFieldLabelFa } from '../../utils/fieldLabel';
import { fetchDynamicOptionsByCategory } from '../../utils/referenceData';
import { safeJalaliFormat } from '../../utils/persianNumberFormatter';
import { ONLINE_CATALOG_ICON_OPTIONS } from '../../utils/onlineCatalogIcons';
import { hasOnlineCatalogFeature } from '../../utils/onlineCatalogs';
import {
  getOrCreateShortOnlineCatalogUrl,
  getOnlineCatalogModuleTitle,
  getOnlineCatalogDisplayFields,
  listOnlineCatalogs,
  saveOnlineCatalog,
  setOnlineCatalogActive,
  type OnlineCatalogModuleId,
  type OnlineCatalogRow,
} from '../../utils/onlineCatalog';

type Props = {
  open: boolean;
  moduleId: OnlineCatalogModuleId;
  sourceRecordIds?: string[];
  onCancel: () => void;
  onSaved?: () => void | Promise<void>;
};

type CatalogTag = { value: string; label: string; color?: string | null };

const OnlineCatalogManagerModal: React.FC<Props> = ({ open, moduleId, sourceRecordIds = [], onCancel, onSaved }) => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<OnlineCatalogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<OnlineCatalogRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'phone'>('desktop');
  const [catalogTagOptions, setCatalogTagOptions] = useState<CatalogTag[]>([]);
  const [form] = Form.useForm();
  const presentation = Form.useWatch('presentation', form) || {};
  const displayFields = useMemo(() => getOnlineCatalogDisplayFields(moduleId), [moduleId]);

  const load = async () => {
    setLoading(true);
    try { setRows(await listOnlineCatalogs(supabase, moduleId)); }
    catch (error: any) { message.error(String(error?.message || 'بارگذاری کاتالوگ‌ها ناموفق بود.')); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void hasOnlineCatalogFeature().then((enabled) => {
      if (cancelled) return;
      setFeatureEnabled(enabled);
      void load();
      if (!enabled) message.warning('فعال‌سازی و ایجاد کاتالوگ آنلاین به ویژگی پلن نیاز دارد.');
    }).catch(() => { if (!cancelled) setFeatureEnabled(false); });
    void supabase.from('tags').select('id,title,color').order('title', { ascending: true }).then(({ data }) => {
      if (!cancelled) setCatalogTagOptions((data || []).map((tag: any) => ({ value: String(tag.id), label: String(tag.title || ''), color: tag.color || null })));
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
      tags: Array.isArray(row?.tags) ? row.tags.map((item: any) => String(item?.id || item?.value || '')).filter(Boolean) : [],
      presentation: { images_enabled: row?.presentation?.images_enabled !== false, ...(row?.presentation || {}) },
    });
    setEditorOpen(true);
  };

  const uploadCustomerLogo = async (file: File, index: number) => {
    try {
      const extension = String(file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `online-catalog/customers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      await uploadFileWithProgress({ client: fileStorageClient, bucket: FILE_STORAGE_BUCKET, path, file, upsert: false, label: file.name, detail: 'لوگوی مشتری کاتالوگ آنلاین' });
      const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(path);
      form.setFieldValue(['presentation', 'customers', index, 'logo_url'], data.publicUrl);
      message.success('لوگوی مشتری بارگذاری شد.');
    } catch (error) {
      if (!isUploadCanceledError(error)) message.error('بارگذاری لوگوی مشتری ناموفق بود.');
    }
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const selectedKeys = Array.isArray(values.display_field_keys) ? values.display_field_keys.map(String) : [];
      const fieldMeta = await Promise.all(selectedKeys.map(async (key: string) => {
        const field = displayFields.find((item: any) => String(item.key) === key);
        if (!field) return null;
        const dynamicOptions = field.dynamicOptionsCategory
          ? await fetchDynamicOptionsByCategory(supabase, field.dynamicOptionsCategory).catch(() => [])
          : [];
        return {
          key,
          labels: field.labels || {},
          type: field.type,
          options: Array.isArray(field.options) && field.options.length ? field.options : dynamicOptions,
        };
      }));
      await saveOnlineCatalog(supabase, {
        ...(editing || {}),
        module_id: moduleId,
        title: values.title,
        public_description: values.public_description,
        internal_description: values.internal_description,
        template_id: values.template_id,
        is_active: featureEnabled ? values.is_active : editing?.is_active !== false,
        display_field_keys: values.display_field_keys || [],
        tags: (values.tags || []).map((id: string) => {
          const tag = catalogTagOptions.find((item) => item.value === id);
          return tag ? { id: tag.value, title: tag.label, color: tag.color || null } : null;
        }).filter(Boolean),
        presentation: { ...(values.presentation || {}), field_meta: fieldMeta.filter(Boolean) },
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
    const url = await getOrCreateShortOnlineCatalogUrl(supabase, row);
    await navigator.clipboard.writeText(url);
    message.success('لینک کاتالوگ کپی شد.');
  };

  const openLink = async (row: OnlineCatalogRow) => {
    const url = await getOrCreateShortOnlineCatalogUrl(supabase, row);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return <>
    <Modal open={open} onCancel={onCancel} footer={null} width={960} destroyOnHidden title={`کاتالوگ‌های آنلاین «${getOnlineCatalogModuleTitle(moduleId)}»`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Typography.Text type="secondary">کاتالوگ‌ها با دادهٔ زندهٔ رکوردهای انتخاب‌شده نمایش داده می‌شوند.</Typography.Text><Space><Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>تازه‌سازی</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)} disabled={!sourceRecordIds.length || !featureEnabled}>ایجاد کاتالوگ جدید</Button></Space></div>
      <Table rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 8 }} locale={{ emptyText: <Empty description="کاتالوگی ثبت نشده است" /> }} columns={[
        { title: 'عنوان', dataIndex: 'title', render: (value: string, row: OnlineCatalogRow) => <div><div className="font-semibold">{value}</div><div className="mt-1 flex flex-wrap gap-1">{row.tags.map((tag: any, index: number) => <Tag key={`${index}-${tag?.id || tag}`} color={tag?.color || 'blue'}>{String(tag?.title || tag?.label || tag)}</Tag>)}</div></div> },
        { title: 'وضعیت', dataIndex: 'is_active', render: (value: boolean, row: OnlineCatalogRow) => <Switch size="small" checked={value} disabled={!featureEnabled} checkedChildren="فعال" unCheckedChildren="غیرفعال" onChange={(next) => void setOnlineCatalogActive(supabase, row.id, next).then(load).catch(() => message.error('تغییر وضعیت کاتالوگ ناموفق بود.'))} /> },
        { title: 'تعداد رکورد', dataIndex: 'record_count', render: (value: number) => value.toLocaleString('fa-IR') },
        { title: 'آخرین به‌روزرسانی', dataIndex: 'last_refreshed_at', render: (value: string) => safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '—' },
        { title: 'عملیات', key: 'actions', render: (_: unknown, row: OnlineCatalogRow) => <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEditor(row)}>ویرایش</Button><Button size="small" icon={<LinkOutlined />} onClick={() => void openLink(row)} disabled={!row.is_active}>مشاهده</Button><Button size="small" icon={<CopyOutlined />} onClick={() => void copyLink(row)}>کپی لینک</Button></Space> },
      ]} />
    </Modal>
    <Modal open={editorOpen} onCancel={() => setEditorOpen(false)} onOk={() => void submit()} okText="ذخیره" cancelText="انصراف" confirmLoading={saving} width={900} destroyOnHidden title={editing ? 'ویرایش کاتالوگ آنلاین' : 'ایجاد کاتالوگ آنلاین'}>
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="عنوان کاتالوگ" rules={[{ required: true, message: 'عنوان کاتالوگ را وارد کنید.' }]}><Input /></Form.Item>
        <Form.Item name="template_id" label="قالب نمایش"><Select options={[{ value: 'catalog_grid', label: 'قالب شبکه‌ای' }, { value: 'catalog_fullpage', label: 'قالب اسلایدی' }]} /></Form.Item>
        <Form.Item name="public_description" label="توضیحات قابل‌نمایش"><Input.TextArea rows={3} /></Form.Item>
        <Form.Item name="internal_description" label="توضیحات داخلی"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="display_field_keys" label="فیلدهای قابل‌نمایش هر ردیف"><Select mode="multiple" options={displayFields.map((field: any) => ({ value: field.key, label: getFieldLabelFa(field, { moduleId, fallback: field.labels?.fa || field.title || field.key }) }))} /></Form.Item>
        <Form.Item name={['presentation', 'images_enabled']} valuePropName="checked"><Checkbox>تصاویر فعال باشند</Checkbox></Form.Item>
        <Form.Item name="tags" label="برچسب‌ها"><Select mode="multiple" showSearch optionFilterProp="label" options={catalogTagOptions} placeholder="برچسب‌های پروژه را انتخاب کنید" /></Form.Item>
        <Form.Item name={['presentation', 'organization_intro']} label="متن معرفی سازمان"><Input.TextArea rows={3} /></Form.Item>
        <Form.Item name={['presentation', 'advisor_name']} label="نام مشاور شما"><Input /></Form.Item>
        <div className="mb-2 font-semibold">کارت‌های ویژگی (حداکثر ۴ مورد)</div>
        <Form.List name={['presentation', 'feature_cards']}>{(fields, { add, remove }) => <>{fields.map((field) => <div key={field.key} className="mb-2 flex flex-wrap gap-2"><Form.Item {...field} name={[field.name, 'icon']} className="mb-0" style={{ width: 170 }}><Select showSearch optionFilterProp="label" options={ONLINE_CATALOG_ICON_OPTIONS} placeholder="انتخاب آیکون" /></Form.Item><Form.Item {...field} name={[field.name, 'title']} className="mb-0 flex-1"><Input placeholder="عنوان" /></Form.Item><Form.Item {...field} name={[field.name, 'subtitle']} className="mb-0 flex-1"><Input placeholder="زیرعنوان" /></Form.Item><Button danger onClick={() => remove(field.name)}>حذف</Button></div>)}<Button onClick={() => fields.length < 4 && add({ icon: 'star' })} disabled={fields.length >= 4}>افزودن کارت ویژگی</Button></>}</Form.List>
        <div className="mb-2 mt-3 font-semibold">بخشی از مشتریان ما</div>
        <Form.List name={['presentation', 'customers']}>{(fields, { add, remove }) => <>{fields.map((field) => <div key={field.key} className="mb-2 flex flex-wrap items-center gap-2"><Form.Item {...field} name={[field.name, 'name']} className="mb-0 flex-1"><Input placeholder="نام مشتری" /></Form.Item><Form.Item {...field} name={[field.name, 'logo_url']} hidden><Input /></Form.Item><Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { void uploadCustomerLogo(file, field.name); return false; }}><Button>بارگذاری لوگو</Button></Upload><Button danger onClick={() => remove(field.name)}>حذف</Button></div>)}<Button onClick={() => add({})}>افزودن مشتری</Button></>}</Form.List>
        <Form.Item name="is_active" valuePropName="checked" className="mt-3"><Checkbox disabled={!featureEnabled}>کاتالوگ فعال باشد</Checkbox></Form.Item>
      </Form>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="mb-2 flex justify-between"><span className="font-semibold">پیش‌نمایش کاتالوگ</span><Space><Button size="small" type={previewMode === 'desktop' ? 'primary' : 'default'} onClick={() => setPreviewMode('desktop')}>نمایشگر</Button><Button size="small" type={previewMode === 'phone' ? 'primary' : 'default'} onClick={() => setPreviewMode('phone')}>گوشی</Button></Space></div><div className={`mx-auto overflow-hidden rounded-2xl bg-white p-3 shadow-inner ${previewMode === 'phone' ? 'max-w-[280px]' : 'max-w-full'}`}><div className="rounded-xl bg-[rgb(var(--brand-600-rgb,37,99,235))] p-4 text-white"><div className="text-lg font-black">{form.getFieldValue('title') || getOnlineCatalogModuleTitle(moduleId)}</div><div className="mt-1 text-xs opacity-80">{form.getFieldValue('public_description') || 'معرفی کوتاه کاتالوگ'}</div></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{(Array.isArray(presentation.feature_cards) ? presentation.feature_cards : []).map((card: any, index: number) => <div key={index} className="rounded-xl bg-slate-50 p-2 text-center"><div className="text-xl">{ONLINE_CATALOG_ICON_OPTIONS.find((item) => item.value === card?.icon)?.icon || '★'}</div><div className="font-bold">{card?.title || 'ویژگی'}</div><div className="text-[10px] text-slate-500">{card?.subtitle}</div></div>)}</div></div></div>
    </Modal>
  </>;
};

export default OnlineCatalogManagerModal;
