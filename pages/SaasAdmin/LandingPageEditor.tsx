import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App, Button, Card, ColorPicker, Drawer, Dropdown, Empty, Input, Modal, Popconfirm,
  Select, Space, Spin, Switch, Tag, Tooltip, Upload,
} from 'antd';
import {
  BgColorsOutlined, DeleteOutlined, DownOutlined, EditOutlined, EyeOutlined, GlobalOutlined,
  LayoutOutlined, PictureOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, UpOutlined,
} from '@ant-design/icons';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../../supabaseClient';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../../utils/storageClient';
import { SECTION_REGISTRY, SECTION_TYPES, type EditorField } from '../../components/publicSite/sectionRegistry';
import { DEFAULT_HOME_SECTIONS } from '../../components/publicSite/defaultLandingConfig';
import LandingRenderer from '../../components/publicSite/LandingRenderer';
import { resolveLandingPalette, type LandingTheme } from '../../components/publicSite/BrandScope';
import { ICON_OPTIONS } from '../../components/publicSite/iconMap';
import { BRAND_PALETTE_PRESETS, DEFAULT_PALETTE_KEY, type BrandingPaletteKey } from '../../theme/brandTheme';
import type { LandingSection, SectionType } from '../../components/publicSite/types';
import { DEFAULT_ENAMAD_TRUST_HTML } from '../../utils/publicSiteTrustSeals';

const SLUG = 'home';
const makeId = () => Math.random().toString(36).slice(2, 10);

const getDefaultProps = (type: SectionType): Record<string, any> => {
  const fromDefault = DEFAULT_HOME_SECTIONS.find((s) => s.type === type);
  return fromDefault ? JSON.parse(JSON.stringify(fromDefault.props)) : {};
};

// ──────────────────────────────────────────────────
// آپلود تصویر (بازاستفاده الگوی BlockEditor)
// ──────────────────────────────────────────────────
const ImageInput: React.FC<{ value?: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [uploading, setUploading] = useState(false);
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `cms/landing/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await fileStorageClient.storage.from(FILE_STORAGE_BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } finally {
      setUploading(false);
    }
    return false;
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Upload accept="image/*" showUploadList={false} beforeUpload={handleUpload} disabled={uploading}>
          <Button icon={uploading ? <Spin size="small" /> : <PictureOutlined />}>{value ? 'تغییر تصویر' : 'آپلود تصویر'}</Button>
        </Upload>
        {value && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange('')} />}
      </div>
      {value && <img src={value} alt="" className="max-h-32 rounded-lg object-cover" />}
      <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="یا آدرس URL تصویر..." dir="ltr" />
    </div>
  );
};

// آپلود مدیا (تصویر / گیف / ویدیو)
const isVideoUrl = (url?: string) => !!url && /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(url);
const MediaInput: React.FC<{ value?: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [uploading, setUploading] = useState(false);
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `cms/landing/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await fileStorageClient.storage.from(FILE_STORAGE_BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } finally {
      setUploading(false);
    }
    return false;
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Upload accept="image/*,video/*" showUploadList={false} beforeUpload={handleUpload} disabled={uploading}>
          <Button icon={uploading ? <Spin size="small" /> : <PictureOutlined />}>{value ? 'تغییر مدیا' : 'آپلود تصویر / گیف / ویدیو'}</Button>
        </Upload>
        {value && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange('')} />}
      </div>
      {value && (isVideoUrl(value)
        ? <video src={value} muted loop autoPlay playsInline className="max-h-40 rounded-lg" />
        : <img src={value} alt="" className="max-h-40 rounded-lg object-cover" />)}
      <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="یا آدرس URL مدیا..." dir="ltr" />
    </div>
  );
};

// ──────────────────────────────────────────────────
// رندر تک‌فیلد بر اساس شِمای EditorField
// ──────────────────────────────────────────────────
const FieldInput: React.FC<{ field: EditorField; value: any; onChange: (v: any) => void }> = ({ field, value, onChange }) => {
  if (field.type === 'text') return <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.label} />;
  if (field.type === 'url') return <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.label} dir="ltr" />;
  if (field.type === 'textarea') return <Input.TextArea value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.label} rows={3} />;
  if (field.type === 'image') return <ImageInput value={value} onChange={onChange} />;
  if (field.type === 'media') return <MediaInput value={value} onChange={onChange} />;
  if (field.type === 'icon') {
    return (
      <Select
        showSearch
        allowClear
        value={value || undefined}
        onChange={(v) => onChange(v ?? '')}
        placeholder="کلید آیکن یا URL تصویر"
        options={ICON_OPTIONS}
        style={{ width: '100%' }}
        dropdownRender={(menu) => (
          <>
            {menu}
            <div className="border-t border-gray-100 p-2 dark:border-white/10">
              <Input size="small" placeholder="یا URL تصویر (مثل /assets/...)" value={value?.startsWith('http') || value?.startsWith('/') ? value : ''} onChange={(e) => onChange(e.target.value)} dir="ltr" />
            </div>
          </>
        )}
      />
    );
  }
  if (field.type === 'tone') {
    return (
      <Select
        value={value ?? 'light'}
        onChange={onChange}
        style={{ width: '100%' }}
        options={[
          { value: 'light', label: 'روشن' },
          { value: 'soft', label: 'خاکستری ملایم' },
          { value: 'dark', label: 'تیره' },
          { value: 'brand', label: 'برند (گرادینت)' },
        ]}
      />
    );
  }
  if (field.type === 'cta') {
    const cta = value ?? { label: '', href: '' };
    return (
      <div className="grid grid-cols-2 gap-2">
        <Input value={cta.label ?? ''} onChange={(e) => onChange({ ...cta, label: e.target.value })} placeholder="متن دکمه" />
        <Input value={cta.href ?? ''} onChange={(e) => onChange({ ...cta, href: e.target.value })} placeholder="لینک" dir="ltr" />
      </div>
    );
  }
  if (field.type === 'string-list') {
    const list: string[] = Array.isArray(value) ? value : [];
    const update = (i: number, v: string) => onChange(list.map((it, idx) => (idx === i ? v : it)));
    return (
      <div className="space-y-2">
        {list.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input value={item} onChange={(e) => update(i, e.target.value)} placeholder={field.itemLabel ?? 'مورد'} />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(list.filter((_, idx) => idx !== i))} />
          </div>
        ))}
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => onChange([...list, ''])}>افزودن {field.itemLabel ?? 'مورد'}</Button>
      </div>
    );
  }
  if (field.type === 'comparison') {
    const rows: Array<{ feature: string; values: Array<boolean | string> }> = Array.isArray(value) ? value : [];
    const toText = () =>
      rows
        .map((r) => [r.feature, ...r.values.map((v) => (v === true ? '+' : v === false ? '-' : String(v)))].join(' | '))
        .join('\n');
    const parse = (text: string) =>
      text
        .split('\n')
        .map((line) => line.split('|').map((c) => c.trim()))
        .filter((cells) => cells[0])
        .map((cells) => ({
          feature: cells[0],
          values: cells.slice(1).map((c) => (c === '+' || c === '✓' ? true : c === '-' || c === '✗' || c === '×' ? false : c)),
        }));
    return (
      <div className="space-y-1">
        <Input.TextArea defaultValue={toText()} onBlur={(e) => onChange(parse(e.target.value))} rows={8} dir="rtl" style={{ fontFamily: 'monospace' }} />
        <div className="text-xs text-gray-400 dark:text-gray-500">هر خط: ویژگی | مقدار ستون۱ | مقدار ستون۲ ... — برای تیک «+» و برای ضربدر «-» و غیر این‌ها متن نمایش داده می‌شود.</div>
      </div>
    );
  }
  if (field.type === 'item-list') {
    const list: any[] = Array.isArray(value) ? value : [];
    const updateItem = (i: number, patch: any) => onChange(list.map((it, idx) => (idx === i ? patch : it)));
    const move = (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      onChange(arrayMove(list, i, j));
    };
    return (
      <div className="space-y-3">
        {list.map((item, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-dark-border dark:bg-white/5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500">{field.itemLabel ?? 'آیتم'} {(i + 1).toLocaleString('fa-IR')}</span>
              <div className="flex gap-1">
                <Button size="small" type="text" icon={<UpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                <Button size="small" type="text" icon={<DownOutlined />} disabled={i === list.length - 1} onClick={() => move(i, 1)} />
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(list.filter((_, idx) => idx !== i))} />
              </div>
            </div>
            <div className="space-y-2">
              {field.fields.map((sub) => (
                <div key={sub.key}>
                  <div className="mb-1 text-xs font-bold text-gray-500 dark:text-gray-400">{sub.label}</div>
                  <FieldInput field={sub} value={item?.[sub.key]} onChange={(v) => updateItem(i, { ...item, [sub.key]: v })} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange([...list, {}])}>افزودن {field.itemLabel ?? 'آیتم'}</Button>
      </div>
    );
  }
  return null;
};

// ──────────────────────────────────────────────────
// ردیف سکشن (قابل جابجایی)
// ──────────────────────────────────────────────────
const SectionRow: React.FC<{
  section: LandingSection;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  dragHandle?: React.HTMLAttributes<HTMLDivElement>;
}> = ({ section, onToggle, onEdit, onDelete, dragHandle }) => {
  const def = SECTION_REGISTRY[section.type];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <div {...dragHandle} className="cursor-grab select-none px-1 text-lg text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400" title="جابجایی">⠿</div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-black text-gray-900 dark:text-gray-100">{def?.labelFa ?? section.type}</span>
          {!section.enabled && <Tag color="default">خاموش</Tag>}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500">{def?.description}</div>
      </div>
      <Switch checked={section.enabled} onChange={onToggle} checkedChildren="فعال" unCheckedChildren="خاموش" />
      <Tooltip title="ویرایش محتوا"><Button icon={<EditOutlined />} onClick={onEdit}>ویرایش</Button></Tooltip>
      <Popconfirm title="حذف این سکشن؟" onConfirm={onDelete} okText="بله" cancelText="نه">
        <Button type="text" danger icon={<DeleteOutlined />} />
      </Popconfirm>
    </div>
  );
};

const SortableSectionRow: React.FC<React.ComponentProps<typeof SectionRow>> = (props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.section.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="mb-2">
      <SectionRow {...props} dragHandle={{ ...attributes, ...listeners }} />
    </div>
  );
};

// ──────────────────────────────────────────────────
// پنل تنظیمات تم/پالت رنگی
// ──────────────────────────────────────────────────
const COLOR_KEYS: Array<{ key: 'primary' | 'secondary' | 'accentPink'; label: string }> = [
  { key: 'primary', label: 'رنگ اصلی' },
  { key: 'secondary', label: 'رنگ ثانویه' },
  { key: 'accentPink', label: 'رنگ تأکید' },
];

const ThemePanel: React.FC<{ theme: LandingTheme | null; onChange: (t: LandingTheme | null) => void }> = ({ theme, onChange }) => {
  const resolved =
    resolveLandingPalette(theme) ?? BRAND_PALETTE_PRESETS[theme?.paletteKey ?? DEFAULT_PALETTE_KEY].palette;
  const setCustom = (key: 'primary' | 'secondary' | 'accentPink', hex: string) =>
    onChange({ ...(theme ?? {}), custom: { ...(theme?.custom ?? {}), [key]: hex } });
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-200">پالت آماده</div>
        <Select
          style={{ width: '100%' }}
          value={theme?.paletteKey ?? '__none'}
          onChange={(v) => (v === '__none' ? onChange(theme?.custom ? { custom: theme.custom } : null) : onChange({ ...(theme ?? {}), paletteKey: v as BrandingPaletteKey }))}
          options={[
            { value: '__none', label: 'پیش‌فرض سیستم' },
            ...Object.entries(BRAND_PALETTE_PRESETS).map(([key, p]) => ({ value: key, label: p.label })),
          ]}
        />
      </div>
      <div>
        <div className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-200">رنگ‌های اختصاصی (اختیاری — روی پالت اعمال می‌شود)</div>
        <div className="grid grid-cols-3 gap-3">
          {COLOR_KEYS.map(({ key, label }) => (
            <div key={key} className="flex flex-col items-start gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
              <ColorPicker
                value={resolved[key]}
                onChange={(_, hex) => setCustom(key, hex)}
                format="hex"
                showText
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">پیش‌نمایش:</span>
        <div className="flex gap-1.5">
          {COLOR_KEYS.map(({ key }) => (
            <span key={key} className="h-6 w-6 rounded-full border border-black/10" style={{ background: resolved[key] }} title={resolved[key]} />
          ))}
        </div>
        <div className="flex-1" />
        <Button size="small" onClick={() => onChange(null)}>حذف تم اختصاصی</Button>
      </div>
      <div className="text-xs text-gray-400 dark:text-gray-500">تم انتخابی فقط روی صفحه اصلی سایت اعمال می‌شود و رنگ‌های برند پنل را تغییر نمی‌دهد.</div>
    </div>
  );
};

// ──────────────────────────────────────────────────
// صفحه ادیتور
// ──────────────────────────────────────────────────
export default function LandingPageEditor() {
  const { message } = App.useApp();
  const [sections, setSections] = useState<LandingSection[]>([]);
  const [theme, setTheme] = useState<LandingTheme | null>(null);
  const [footer, setFooter] = useState<Record<string, string>>({});
  const [rowId, setRowId] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.from('cms_landing_pages').select('*').eq('slug', SLUG).maybeSingle();
        if (cancelled) return;
        if (data) {
          setRowId(data.id);
          setPublished(!!data.is_published);
          setTheme((data.theme as LandingTheme) ?? null);
          const savedFooter = (data.footer as Record<string, string>) ?? {};
          setFooter({
            ...savedFooter,
            enamadTrustHtml: savedFooter.enamadTrustHtml?.trim() || DEFAULT_ENAMAD_TRUST_HTML,
          });
          const list = Array.isArray(data.sections) && data.sections.length > 0 ? data.sections : DEFAULT_HOME_SECTIONS;
          setSections(JSON.parse(JSON.stringify(list)));
        } else {
          setSections(JSON.parse(JSON.stringify(DEFAULT_HOME_SECTIONS)));
        }
      } catch {
        setSections(JSON.parse(JSON.stringify(DEFAULT_HOME_SECTIONS)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const editingSection = useMemo(() => sections.find((s) => s.id === editingId) ?? null, [sections, editingId]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSections((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const addSection = (type: SectionType) => {
    setSections((prev) => [...prev, { id: makeId(), type, enabled: true, props: getDefaultProps(type) }]);
    message.success(`سکشن «${SECTION_REGISTRY[type].labelFa}» اضافه شد.`);
  };

  const updateProps = (id: string, props: Record<string, any>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, props } : s)));

  const save = async (publish?: boolean) => {
    setSaving(true);
    try {
      const nextPublished = publish ?? published;
      const payload = {
        slug: SLUG,
        title: 'صفحه اصلی',
        sections,
        theme,
        footer,
        is_published: nextPublished,
        published_at: nextPublished ? new Date().toISOString() : null,
      };
      let res;
      if (rowId) {
        res = await supabase.from('cms_landing_pages').update(payload).eq('id', rowId).select('id').single();
      } else {
        res = await supabase.from('cms_landing_pages').insert(payload).select('id').single();
      }
      if (res.error) throw res.error;
      setRowId(res.data.id);
      setPublished(nextPublished);
      message.success(publish ? 'صفحه منتشر شد!' : 'ذخیره شد.');
    } catch (e: any) {
      message.error(e?.message ?? 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Spin size="large" /></div>;

  return (
    <div className="min-h-screen bg-gray-100 pb-16 text-gray-900 dark:bg-dark-bg dark:text-gray-100" dir="rtl">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-6 py-3 dark:border-dark-border dark:bg-dark-surface">
        <GlobalOutlined className="text-lg" />
        <span className="font-black">ویرایشگر صفحه اصلی سایت</span>
        <Tag color={published ? 'green' : 'default'}>{published ? 'منتشرشده' : 'پیش‌نویس'}</Tag>
        <div className="flex-1" />
        <Space wrap>
          <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>پیش‌نمایش</Button>
          <Popconfirm title="بازنشانی به طرح پیش‌فرض؟ تغییرات ذخیره‌نشده از بین می‌رود." onConfirm={() => setSections(JSON.parse(JSON.stringify(DEFAULT_HOME_SECTIONS)))} okText="بله" cancelText="نه">
            <Button icon={<ReloadOutlined />}>بازنشانی پیش‌فرض</Button>
          </Popconfirm>
          <Button icon={<SaveOutlined />} onClick={() => save(false)} loading={saving}>ذخیره</Button>
          <Button type="primary" icon={<GlobalOutlined />} onClick={() => save(true)} loading={saving}>{published ? 'ذخیره و انتشار' : 'انتشار'}</Button>
        </Space>
      </div>

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <Card className="shadow-sm" title={<span className="flex items-center gap-2"><BgColorsOutlined /> تنظیمات تم و رنگ صفحه</span>}>
          <ThemePanel theme={theme} onChange={setTheme} />
        </Card>

        <Card className="shadow-sm" title={<span className="flex items-center gap-2"><LayoutOutlined /> تنظیمات فوتر سایت</span>}>
          {(() => {
            const setField = (k: string, v: string) => setFooter((prev) => ({ ...prev, [k]: v }));
            const fields: Array<{ key: string; label: string; area?: boolean; ltr?: boolean; ph?: string }> = [
              { key: 'tagline', label: 'متن زیر لوگو', area: true },
              { key: 'phone', label: 'تلفن (نمایش)' },
              { key: 'phoneHref', label: 'لینک تلفن (مثلاً tel:+982112345678)', ltr: true },
              { key: 'email', label: 'ایمیل', ltr: true },
              { key: 'address', label: 'آدرس', area: true },
              { key: 'copyright', label: 'متن کپی‌رایت' },
              { key: 'enamadTrustHtml', label: 'کد HTML اینماد', area: true, ltr: true, ph: 'کد رسمی اینماد شامل لینک و تصویر را اینجا وارد کنید' },
              { key: 'zarinpalTrustHtml', label: 'کد HTML نشان زرین‌پال', area: true, ltr: true, ph: 'کد رسمی نشان زرین‌پال شامل لینک و تصویر را اینجا وارد کنید' },
            ];
            return (
              <div className="grid gap-4 md:grid-cols-2">
                {fields.map((fld) => (
                  <div key={fld.key} className={fld.area ? 'md:col-span-2' : ''}>
                    <div className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-200">{fld.label}</div>
                    {fld.area ? (
                      <Input.TextArea value={footer[fld.key] ?? ''} onChange={(e) => setField(fld.key, e.target.value)} rows={2} placeholder={fld.ph} />
                    ) : (
                      <Input value={footer[fld.key] ?? ''} onChange={(e) => setField(fld.key, e.target.value)} dir={fld.ltr ? 'ltr' : 'rtl'} placeholder={fld.ph} />
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
          <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">کدهای اینماد و نشان زرین‌پال فقط در فوتر سایت عمومی نمایش داده می‌شوند. صفحات حریم خصوصی، شرایط استفاده، قوانین و SLA از بخش «صفحات سایت» در مدیریت محتوا ویرایش می‌شوند.</div>
        </Card>

        <Card className="shadow-sm" title="سکشن‌های صفحه" extra={
          <Dropdown
            trigger={['click']}
            menu={{ items: SECTION_TYPES.map((t) => ({ key: t, label: SECTION_REGISTRY[t].labelFa, onClick: () => addSection(t) })) }}
          >
            <Button type="primary" icon={<PlusOutlined />}>افزودن سکشن</Button>
          </Dropdown>
        }>
          {sections.length === 0 ? (
            <Empty description="سکشنی وجود ندارد" />
          ) : (
            <DndContext sensors={editingSection ? [] : sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {sections.map((section) => (
                  <SortableSectionRow
                    key={section.id}
                    section={section}
                    onToggle={() => setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, enabled: !s.enabled } : s)))}
                    onEdit={() => setEditingId(section.id)}
                    onDelete={() => setSections((prev) => prev.filter((s) => s.id !== section.id))}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </Card>
      </div>

      {/* Drawer ویرایش محتوای سکشن */}
      <Drawer
        open={!!editingSection}
        onClose={() => setEditingId(null)}
        destroyOnHidden
        afterOpenChange={(open) => {
          if (!open) document.querySelectorAll<HTMLElement>('.ant-drawer-mask').forEach((mask) => { mask.style.pointerEvents = 'none'; });
        }}
        title={editingSection ? `ویرایش: ${SECTION_REGISTRY[editingSection.type].labelFa}` : ''}
        width={520}
        styles={{ body: { direction: 'rtl' } }}
      >
        {editingSection && (
          <div className="space-y-4">
            {SECTION_REGISTRY[editingSection.type].editor.map((field) => (
              <div key={field.key}>
                <div className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-200">{field.label}</div>
                <FieldInput
                  field={field}
                  value={editingSection.props?.[field.key]}
                  onChange={(v) => updateProps(editingSection.id, { ...editingSection.props, [field.key]: v })}
                />
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {/* پیش‌نمایش */}
      <Modal open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null} width="90%" style={{ top: 20 }} styles={{ body: { padding: 0, maxHeight: '85vh', overflow: 'auto' } }}>
        <div dir="rtl"><LandingRenderer previewSections={sections} previewTheme={theme} /></div>
      </Modal>
    </div>
  );
}
