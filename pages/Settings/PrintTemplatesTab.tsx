import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Checkbox,
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  List,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Modal,
  Tooltip,
  Typography,
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import PrintTemplateEditor from '../../components/moduleShow/PrintTemplateEditor';
import PrintTemplateToolbar from '../../components/moduleShow/PrintTemplateToolbar';
import {
  buildDefaultTemplatesForModule,
  buildDefaultFooterTemplateForModule,
  buildDefaultHeaderTemplateForModule,
  buildDefaultTemplateForModule,
  getModuleTitle,
  getSystemTemplateFieldOptions,
  getPrintTemplateVariables,
  loadPrintTemplatesStore,
  materializeSystemTemplateForCopy,
  mergeTemplatesWithDefaults,
  savePrintTemplatesStore,
  type PrintTemplateVariableOption,
  type StoredPrintTemplate,
} from '../../utils/printTemplates/store';
import { buildListPrintableFields } from '../../utils/listPrintExport';

const createTemplateId = () => `tpl_${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();
const DEFAULT_PAGE_MARGINS = { top: 12, right: 10, bottom: 12, left: 10 } as const;
const HEADER_HEIGHT_FALLBACK = 84;
const FOOTER_HEIGHT_FALLBACK = 62;
const HEADER_HEIGHT_MIN = 42;
const HEADER_HEIGHT_MAX = 220;
const FOOTER_HEIGHT_MIN = 28;
const FOOTER_HEIGHT_MAX = 160;

const getPageFrame = (paperSize: 'A4' | 'A5' | 'A6' = 'A4', orientation: 'portrait' | 'landscape' = 'portrait') => {
  const base =
    paperSize === 'A6'
      ? { w: 105, h: 148 }
      : paperSize === 'A5'
        ? { w: 148, h: 210 }
        : { w: 210, h: 297 };
  const width = orientation === 'landscape' ? base.h : base.w;
  const height = orientation === 'landscape' ? base.w : base.h;
  return {
    width: `${width}mm`,
    minHeight: `${height}mm`,
    label: `${paperSize} - ${orientation === 'landscape' ? 'افقی' : 'عمودی'}`,
  };
};

const PrintTemplatesTab: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsRowId, setSettingsRowId] = useState<string | null>(null);
  const [provider, setProvider] = useState('tiptap');
  const [templatesByModule, setTemplatesByModule] = useState<Record<string, StoredPrintTemplate[]>>({});
  const [selectedModuleId, setSelectedModuleId] = useState<string>('invoices');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<StoredPrintTemplate | null>(null);
  const [systemFieldsModalOpen, setSystemFieldsModalOpen] = useState(false);
  const [systemFieldsEditingTemplate, setSystemFieldsEditingTemplate] = useState<StoredPrintTemplate | null>(null);
  const [systemFieldsSearch, setSystemFieldsSearch] = useState('');
  const [systemFieldKeysDraft, setSystemFieldKeysDraft] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<'header' | 'body' | 'footer'>('body');
  const [headerEditor, setHeaderEditor] = useState<any | null>(null);
  const [bodyEditor, setBodyEditor] = useState<any | null>(null);
  const [footerEditor, setFooterEditor] = useState<any | null>(null);
  const resizeStateRef = useRef<{ section: 'header' | 'footer'; startY: number; startHeight: number } | null>(null);

  const moduleOptions = useMemo(
    () =>
      Object.values(MODULES).map((module) => ({
        value: module.id,
        label: module.titles.fa,
      })),
    []
  );

  const selectedTemplates = templatesByModule[selectedModuleId] || [];
  const currentScope = systemFieldsEditingTemplate?.scope || editingTemplate?.scope || 'record';
  const variableOptions: PrintTemplateVariableOption[] = useMemo(
    () => getPrintTemplateVariables(selectedModuleId),
    [selectedModuleId]
  );
  const systemFieldOptions = useMemo(
    () =>
      currentScope === 'list'
        ? buildListPrintableFields(MODULES[selectedModuleId])
            .map((field) => ({
              key: field.key,
              label: field.label,
              group: 'ستون‌های لیست',
              kind: 'record' as const,
            }))
        : getSystemTemplateFieldOptions(selectedModuleId),
    [currentScope, selectedModuleId]
  );
  const filteredSystemFieldOptions = useMemo(() => {
    const q = systemFieldsSearch.trim().toLowerCase();
    if (!q) return systemFieldOptions;
    return systemFieldOptions.filter(
      (item) => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q) || item.key.toLowerCase().includes(q)
    );
  }, [systemFieldOptions, systemFieldsSearch]);
  const groupedSystemFieldOptions = useMemo(() => {
    const groups = new Map<string, typeof filteredSystemFieldOptions>();
    filteredSystemFieldOptions.forEach((item) => {
      groups.set(item.group, [...(groups.get(item.group) || []), item]);
    });
    return Array.from(groups.entries());
  }, [filteredSystemFieldOptions]);
  const editingPageFrame = useMemo(
    () => getPageFrame(editingTemplate?.paperSize || 'A4', editingTemplate?.orientation || 'portrait'),
    [editingTemplate?.orientation, editingTemplate?.paperSize]
  );

  const activeEditor = useMemo(() => {
    if (activeSection === 'header' && editingTemplate?.showHeader !== false && headerEditor) return headerEditor;
    if (activeSection === 'footer' && editingTemplate?.showFooter !== false && footerEditor) return footerEditor;
    return bodyEditor || headerEditor || footerEditor || null;
  }, [activeSection, bodyEditor, editingTemplate?.showFooter, editingTemplate?.showHeader, footerEditor, headerEditor]);

  const activeSectionLabel = useMemo(() => {
    if (activeSection === 'header' && editingTemplate?.showHeader !== false) return 'سربرگ';
    if (activeSection === 'footer' && editingTemplate?.showFooter !== false) return 'پاورقی';
    return 'بدنه';
  }, [activeSection, editingTemplate?.showFooter, editingTemplate?.showHeader]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeStateRef.current) return;
      const { section, startY, startHeight } = resizeStateRef.current;
      const delta = event.clientY - startY;
      const nextHeight =
        section === 'header'
          ? Math.min(HEADER_HEIGHT_MAX, Math.max(HEADER_HEIGHT_MIN, startHeight + delta))
          : Math.min(FOOTER_HEIGHT_MAX, Math.max(FOOTER_HEIGHT_MIN, startHeight - delta));

      setEditingTemplate((prev) => {
        if (!prev) return prev;
        return section === 'header'
          ? { ...prev, headerHeight: nextHeight }
          : { ...prev, footerHeight: nextHeight };
      });
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    };

    const handlePointerUp = () => {
      resizeStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const startSectionResize = (section: 'header' | 'footer', event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizeStateRef.current = {
      section,
      startY: event.clientY,
      startHeight:
        section === 'header'
          ? Number(editingTemplate?.headerHeight || HEADER_HEIGHT_FALLBACK)
          : Number(editingTemplate?.footerHeight || FOOTER_HEIGHT_FALLBACK),
    };
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const loaded = await loadPrintTemplatesStore();
      setSettingsRowId(loaded.rowId);
      setProvider(loaded.provider);

      const next = { ...loaded.templatesByModule };
      Object.keys(MODULES).forEach((moduleId) => {
        next[moduleId] = mergeTemplatesWithDefaults(moduleId, next[moduleId] || []);
      });
      setTemplatesByModule(next);
    } catch (err: any) {
      message.error(String(err?.message || 'خواندن قالب‌های چاپ ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const persistTemplates = async (nextState: Record<string, StoredPrintTemplate[]>) => {
    setSaving(true);
    try {
      const saveResult = await savePrintTemplatesStore({
        rowId: settingsRowId,
        provider,
        templatesByModule: nextState,
      });
      setSettingsRowId(saveResult.rowId || settingsRowId);
      setTemplatesByModule(nextState);

      if (saveResult.storage === 'local') {
        const normalizedError = String(saveResult.errorMessage || '').toLowerCase();
        const requiresMigration =
          saveResult.errorCode === '23514' ||
          normalizedError.includes('integration_settings_connection_type_check') ||
          normalizedError.includes('print_templates');

        if (requiresMigration) {
          message.error('ذخیره دیتابیسی قالب چاپ هنوز فعال نیست. ابتدا SQL مربوط به `print_templates` را در Supabase اجرا کنید.');
        } else {
          message.warning(`ذخیره دیتابیسی انجام نشد و قالب فعلا محلی ذخیره شد.${saveResult.errorMessage ? ` دلیل: ${saveResult.errorMessage}` : ''}`);
        }
      } else {
        message.success('قالب چاپ ذخیره شد.');
      }
      return true;
    } catch (err: any) {
      message.error(String(err?.message || 'ذخیره قالب چاپ ناموفق بود.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openNewTemplate = () => {
    const now = nowIso();
    const singularTitle = getModuleTitle(selectedModuleId, 'singular') || getModuleTitle(selectedModuleId) || '';

    setEditingTemplate({
      id: createTemplateId(),
      moduleId: selectedModuleId,
      scope: 'record',
      title: `قالب جدید ${singularTitle}`.trim(),
      description: '',
      headerHtml: buildDefaultHeaderTemplateForModule(selectedModuleId),
      contentHtml: buildDefaultTemplateForModule(selectedModuleId),
      footerHtml: buildDefaultFooterTemplateForModule(),
      isActive: true,
      showHeader: true,
      showFooter: true,
      headerHeight: HEADER_HEIGHT_FALLBACK,
      footerHeight: FOOTER_HEIGHT_FALLBACK,
      pageMarginTop: DEFAULT_PAGE_MARGINS.top,
      pageMarginRight: DEFAULT_PAGE_MARGINS.right,
      pageMarginBottom: DEFAULT_PAGE_MARGINS.bottom,
      pageMarginLeft: DEFAULT_PAGE_MARGINS.left,
      paperSize: selectedModuleId === 'products' ? 'A6' : 'A4',
      orientation: 'portrait',
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    });
    setActiveSection('body');
    setEditorOpen(true);
  };

  const openEditTemplate = (template: StoredPrintTemplate) => {
    setEditingTemplate({
      ...template,
      moduleId: selectedModuleId,
      headerHtml: template.headerHtml || buildDefaultHeaderTemplateForModule(selectedModuleId),
      footerHtml: template.footerHtml || buildDefaultFooterTemplateForModule(),
      showHeader: template.showHeader !== false,
      showFooter: template.showFooter !== false,
      headerHeight: template.headerHeight || HEADER_HEIGHT_FALLBACK,
      footerHeight: template.footerHeight || FOOTER_HEIGHT_FALLBACK,
      pageMarginTop: template.pageMarginTop ?? DEFAULT_PAGE_MARGINS.top,
      pageMarginRight: template.pageMarginRight ?? DEFAULT_PAGE_MARGINS.right,
      pageMarginBottom: template.pageMarginBottom ?? DEFAULT_PAGE_MARGINS.bottom,
      pageMarginLeft: template.pageMarginLeft ?? DEFAULT_PAGE_MARGINS.left,
      orientation: template.orientation || 'portrait',
    });
    setActiveSection('body');
    setEditorOpen(true);
  };

  const openSystemFieldsEditor = (template: StoredPrintTemplate) => {
    const allKeys = systemFieldOptions.map((item) => item.key);
    const selectedKeys =
      Array.isArray(template.selectedFieldKeys) && template.selectedFieldKeys.length > 0
        ? template.selectedFieldKeys
        : allKeys;
    setSystemFieldsEditingTemplate(template);
    setSystemFieldKeysDraft(selectedKeys);
    setSystemFieldsSearch('');
    setSystemFieldsModalOpen(true);
  };

  const saveSystemFieldsEditor = async () => {
    if (!systemFieldsEditingTemplate) return;
    const current = templatesByModule[selectedModuleId] || [];
    const nextModuleTemplates = current.map((template) =>
      template.id === systemFieldsEditingTemplate.id
        ? {
            ...template,
            selectedFieldKeys: Array.from(new Set(systemFieldKeysDraft.map((value) => String(value || '').trim()).filter(Boolean))),
            updatedAt: nowIso(),
          }
        : template
    );
    const nextState = {
      ...templatesByModule,
      [selectedModuleId]: nextModuleTemplates,
    };
    const ok = await persistTemplates(nextState);
    if (ok) {
      setSystemFieldsModalOpen(false);
      setSystemFieldsEditingTemplate(null);
      setSystemFieldsSearch('');
      setSystemFieldKeysDraft([]);
    }
  };

  const toggleSystemFieldKey = (key: string, checked: boolean) => {
    setSystemFieldKeysDraft((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return Array.from(next);
    });
  };

  const handleDeleteTemplate = async (templateId: string) => {
    const current = templatesByModule[selectedModuleId] || [];
    const nextModuleTemplates = current.filter((template) => template.id !== templateId);
    const nextState = {
      ...templatesByModule,
      [selectedModuleId]: nextModuleTemplates,
    };
    await persistTemplates(nextState);
  };

  const handleCopyTemplate = async (template: StoredPrintTemplate) => {
    const current = templatesByModule[selectedModuleId] || [];
    const systemDefault =
      template.isSystem === true
        ? buildDefaultTemplatesForModule(selectedModuleId).find((item) => item.id === template.id) || null
        : null;
    const sourceTemplate = template.isSystem === true
      ? materializeSystemTemplateForCopy(selectedModuleId, systemDefault || template)
      : template;
    const normalizeTitle = (value: string) => value.trim().replace(/\s+/g, ' ');
    const baseTitle = normalizeTitle(`${sourceTemplate.title} (کپی)`);
    let nextTitle = baseTitle;
    let counter = 2;
    while (
      current.some(
        (item) =>
          normalizeTitle(String(item.title || '')).localeCompare(nextTitle, 'fa', {
            sensitivity: 'base',
          }) === 0
      )
    ) {
      nextTitle = `${baseTitle} ${counter}`;
      counter += 1;
    }

    const copiedTemplate: StoredPrintTemplate = {
      ...sourceTemplate,
      id: createTemplateId(),
      title: nextTitle,
      isSystem: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      moduleId: selectedModuleId,
    };

    const nextState = {
      ...templatesByModule,
      [selectedModuleId]: [copiedTemplate, ...current],
    };
    await persistTemplates(nextState);
  };

  const saveEditorChanges = async () => {
    if (!editingTemplate) return;

    const current = templatesByModule[selectedModuleId] || [];
    const normalizedTitle = String(editingTemplate.title || '')
      .trim()
      .replace(/\s+/g, ' ');
    const hasDuplicateTitle = current.some(
      (item) =>
        item.id !== editingTemplate.id &&
        String(item.title || '')
          .trim()
          .replace(/\s+/g, ' ')
          .localeCompare(normalizedTitle, 'fa', { sensitivity: 'base' }) === 0
    );
    if (hasDuplicateTitle) {
      message.error('یک قالب دیگر با همین نام در این ماژول ثبت شده است.');
      return;
    }

    const exists = current.some((item) => item.id === editingTemplate.id);
    const updatedTemplate: StoredPrintTemplate = {
      ...editingTemplate,
      moduleId: selectedModuleId,
      updatedAt: nowIso(),
      createdAt: editingTemplate.createdAt || nowIso(),
      title: normalizedTitle || 'قالب بدون عنوان',
      headerHtml: String(editingTemplate.headerHtml || '').trim() || buildDefaultHeaderTemplateForModule(selectedModuleId),
      contentHtml: String(editingTemplate.contentHtml || '').trim() || buildDefaultTemplateForModule(selectedModuleId),
      footerHtml: String(editingTemplate.footerHtml || '').trim() || buildDefaultFooterTemplateForModule(),
      orientation: editingTemplate.orientation || 'portrait',
      isSystem: editingTemplate.isSystem === true,
      showHeader: editingTemplate.showHeader !== false,
      showFooter: editingTemplate.showFooter !== false,
      headerHeight: Number(editingTemplate.headerHeight || HEADER_HEIGHT_FALLBACK),
      footerHeight: Number(editingTemplate.footerHeight || FOOTER_HEIGHT_FALLBACK),
      pageMarginTop: Number(editingTemplate.pageMarginTop ?? DEFAULT_PAGE_MARGINS.top),
      pageMarginRight: Number(editingTemplate.pageMarginRight ?? DEFAULT_PAGE_MARGINS.right),
      pageMarginBottom: Number(editingTemplate.pageMarginBottom ?? DEFAULT_PAGE_MARGINS.bottom),
      pageMarginLeft: Number(editingTemplate.pageMarginLeft ?? DEFAULT_PAGE_MARGINS.left),
    };

    const nextModuleTemplates = exists
      ? current.map((item) => (item.id === updatedTemplate.id ? updatedTemplate : item))
      : [updatedTemplate, ...current];

    const nextState = {
      ...templatesByModule,
      [selectedModuleId]: nextModuleTemplates,
    };

    const ok = await persistTemplates(nextState);
    if (ok) {
      setEditorOpen(false);
      setEditingTemplate(null);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto py-2">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <Card
          className="rounded-2xl border border-slate-200 dark:border-slate-800 dark:bg-[#111827]"
          bodyStyle={{ padding: 12 }}
          title={<span className="font-bold">ماژول‌ها</span>}
        >
          <List
            dataSource={moduleOptions}
            locale={{ emptyText: 'ماژولی یافت نشد' }}
            renderItem={(item) => {
              const isActive = selectedModuleId === item.value;
              const count = (templatesByModule[item.value] || []).length;
              return (
                <List.Item
                  onClick={() => setSelectedModuleId(item.value)}
                  className={`border rounded-2xl transition-colors ${
                    isActive
                      ? 'shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-leather-300 dark:hover:border-leather-700'
                  }`}
                  style={{
                    cursor: 'pointer',
                    padding: '12px 14px',
                    marginBottom: 8,
                    background: isActive ? 'rgba(var(--brand-500-rgb), 0.10)' : undefined,
                    borderColor: isActive ? 'rgba(var(--brand-500-rgb), 0.6)' : undefined,
                  }}
                >
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className={isActive ? 'font-semibold text-leather-700 dark:text-leather-300' : 'dark:text-slate-200'}>
                      {item.label}
                    </span>
                    <Tag color={isActive ? 'gold' : 'default'}>{count}</Tag>
                  </div>
                </List.Item>
              );
            }}
          />
        </Card>

        <Card
          className="rounded-2xl border border-slate-200 dark:border-slate-800 dark:bg-[#111827]"
          bodyStyle={{ padding: 14 }}
          title={
            <div className="flex items-center gap-2">
              <FileTextOutlined />
              <span>قالب‌های چاپ {MODULES[selectedModuleId]?.titles?.fa || ''}</span>
            </div>
          }
          extra={
            <Space>
              <Button icon={<PlusOutlined />} type="primary" onClick={openNewTemplate} className="bg-leather-600">
                قالب جدید
              </Button>
            </Space>
          }
        >
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <Spin />
            </div>
          ) : selectedTemplates.length === 0 ? (
            <Empty description="برای این ماژول هنوز قالبی ثبت نشده است." />
          ) : (
            <List
              dataSource={selectedTemplates}
              renderItem={(item) => (
                <List.Item
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3 mb-2"
                  actions={[
                    <Tooltip key="copy" title={String(item?.id || '').includes('_catalog_a4_portrait') ? 'کپی برای این قالب سیستمی غیرفعال است' : 'کپی قالب'}>
                      <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined />}
                        disabled={String(item?.id || '').includes('_catalog_a4_portrait')}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (String(item?.id || '').includes('_catalog_a4_portrait')) return;
                          handleCopyTemplate(item);
                        }}
                      />
                    </Tooltip>,
                    <Tooltip key="edit" title="ویرایش">
                      <Button
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (item.isSystem) {
                            openSystemFieldsEditor(item);
                            return;
                          }
                          openEditTemplate(item);
                        }}
                      />
                    </Tooltip>,
                    <Tooltip key="delete" title={item.isSystem ? 'حذف قالب سیستمی غیرفعال است' : 'حذف'}>
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={item.isSystem === true}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (item.isSystem) return;
                          handleDeleteTemplate(item.id);
                        }}
                      />
                    </Tooltip>,
                  ]}
                >
                  <div
                    className="w-full cursor-pointer"
                    onClick={() => (item.isSystem ? openSystemFieldsEditor(item) : openEditTemplate(item))}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Typography.Text strong>{item.title}</Typography.Text>
                      {item.isSystem ? <Tag color="processing">سیستمی</Tag> : null}
                      <Tag color={(item.scope || 'record') === 'list' ? 'gold' : 'cyan'}>
                        {(item.scope || 'record') === 'list' ? 'جدولی' : 'رکوردی'}
                      </Tag>
                      <Tag color={item.isActive ? 'green' : 'default'}>{item.isActive ? 'فعال' : 'غیرفعال'}</Tag>
                      <Tag>{item.paperSize || 'A4'}</Tag>
                      <Tag>{item.orientation === 'landscape' ? 'افقی' : 'عمودی'}</Tag>
                      <Tag color={item.showHeader === false ? 'default' : 'blue'}>{item.showHeader === false ? 'بدون سربرگ' : 'با سربرگ'}</Tag>
                      <Tag color={item.showFooter === false ? 'default' : 'purple'}>{item.showFooter === false ? 'بدون پاورقی' : 'با پاورقی'}</Tag>
                    </div>
                    <Typography.Text type="secondary" className="text-xs">
                      {item.description || 'بدون توضیح'}
                    </Typography.Text>
                  </div>
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>

      <Drawer
        title="ویرایشگر قالب چاپ"
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        width="95vw"
        zIndex={2200}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setEditorOpen(false)}>بستن</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveEditorChanges} className="bg-leather-600">
              ذخیره قالب
            </Button>
          </Space>
        }
      >
        {!editingTemplate ? null : (
          <Card className="rounded-3xl border border-slate-200 dark:border-slate-800 dark:bg-[#0f172a]">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 mb-4">
              <Input
                value={editingTemplate.title}
                onChange={(e) => setEditingTemplate((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                placeholder="عنوان قالب"
              />
              <Select
                value={editingTemplate.paperSize || 'A4'}
                options={[
                  { label: 'A4', value: 'A4' },
                  { label: 'A5', value: 'A5' },
                  { label: 'A6', value: 'A6' },
                ]}
                onChange={(value) =>
                  setEditingTemplate((prev) => (prev ? { ...prev, paperSize: value as 'A4' | 'A5' | 'A6' } : prev))
                }
              />
              <Select
                value={editingTemplate.orientation || 'portrait'}
                options={[
                  { label: 'عمودی', value: 'portrait' },
                  { label: 'افقی', value: 'landscape' },
                ]}
                onChange={(value) =>
                  setEditingTemplate((prev) => (prev ? { ...prev, orientation: value as 'portrait' | 'landscape' } : prev))
                }
              />
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/60 dark:bg-white/[0.03]">
                <span className="text-sm text-slate-500 dark:text-slate-300">فعال</span>
                <Switch
                  checked={editingTemplate.isActive}
                  onChange={(checked) => setEditingTemplate((prev) => (prev ? { ...prev, isActive: checked } : prev))}
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/60 dark:bg-white/[0.03]">
                <span className="text-sm text-slate-500 dark:text-slate-300">سربرگ</span>
                <Switch
                  checked={editingTemplate.showHeader !== false}
                  onChange={(checked) => {
                    setEditingTemplate((prev) => (prev ? { ...prev, showHeader: checked } : prev));
                    if (!checked && activeSection === 'header') setActiveSection('body');
                  }}
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/60 dark:bg-white/[0.03]">
                <span className="text-sm text-slate-500 dark:text-slate-300">پاورقی</span>
                <Switch
                  checked={editingTemplate.showFooter !== false}
                  onChange={(checked) => {
                    setEditingTemplate((prev) => (prev ? { ...prev, showFooter: checked } : prev));
                    if (!checked && activeSection === 'footer') setActiveSection('body');
                  }}
                />
              </div>
            </div>

            <Input
              className="mb-4"
              value={editingTemplate.description || ''}
              onChange={(e) => setEditingTemplate((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
              placeholder="توضیح کوتاه قالب"
            />

            <div className="sticky top-0 z-30 mb-4 pb-2">
              <PrintTemplateToolbar
                editor={activeEditor}
                variableOptions={variableOptions}
                activeSectionLabel={activeSectionLabel}
                pageMargins={{
                  top: Number(editingTemplate.pageMarginTop ?? DEFAULT_PAGE_MARGINS.top),
                  right: Number(editingTemplate.pageMarginRight ?? DEFAULT_PAGE_MARGINS.right),
                  bottom: Number(editingTemplate.pageMarginBottom ?? DEFAULT_PAGE_MARGINS.bottom),
                  left: Number(editingTemplate.pageMarginLeft ?? DEFAULT_PAGE_MARGINS.left),
                }}
                onChangePageMargins={(nextMargins) =>
                  setEditingTemplate((prev) =>
                    prev
                      ? {
                          ...prev,
                          pageMarginTop: nextMargins.top,
                          pageMarginRight: nextMargins.right,
                          pageMarginBottom: nextMargins.bottom,
                          pageMarginLeft: nextMargins.left,
                        }
                      : prev
                  )
                }
              />
            </div>

            <div className="rounded-[28px] border border-slate-200/80 dark:border-slate-800 bg-gradient-to-b from-[#faf7f2] via-[#f8fafc] to-[#f1f5f9] dark:from-[#0b1120] dark:via-[#111827] dark:to-[#0f172a] p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">{editingPageFrame.label}</div>
              <div
                className="mx-auto rounded-[24px] border border-slate-300/70 dark:border-slate-700 bg-white overflow-hidden shadow-[0_24px_60px_rgba(15,23,42,0.18)] flex flex-col"
                style={{
                  width: `min(100%, ${editingPageFrame.width})`,
                  minHeight: editingPageFrame.minHeight,
                  boxSizing: 'border-box',
                  paddingTop: `${Number(editingTemplate.pageMarginTop ?? DEFAULT_PAGE_MARGINS.top)}mm`,
                  paddingRight: `${Number(editingTemplate.pageMarginRight ?? DEFAULT_PAGE_MARGINS.right)}mm`,
                  paddingBottom: `${Number(editingTemplate.pageMarginBottom ?? DEFAULT_PAGE_MARGINS.bottom)}mm`,
                  paddingLeft: `${Number(editingTemplate.pageMarginLeft ?? DEFAULT_PAGE_MARGINS.left)}mm`,
                }}
              >
                {editingTemplate.showHeader !== false ? (
                  <section
                    className={`relative flex-none border-b border-dashed border-slate-300/80 ${activeSection === 'header' ? 'ring-1 ring-[rgba(var(--brand-500-rgb),0.32)]' : ''}`}
                    onClick={() => setActiveSection('header')}
                    style={{ height: editingTemplate.headerHeight || HEADER_HEIGHT_FALLBACK }}
                  >
                    <div className="pointer-events-none absolute top-2 right-4 z-10 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
                      سربرگ
                    </div>
                    <PrintTemplateEditor
                      key={`${editingTemplate.id}-header`}
                      value={editingTemplate.headerHtml || ''}
                      onChange={(html) => setEditingTemplate((prev) => (prev ? { ...prev, headerHtml: html } : prev))}
                      placeholder="سربرگ هر برگه را اینجا تنظیم کنید..."
                      minHeight={HEADER_HEIGHT_MIN}
                      fixedHeight={Number(editingTemplate.headerHeight || HEADER_HEIGHT_FALLBACK)}
                      contentPadding="8px 10px"
                      onEditorReady={setHeaderEditor}
                      onFocusSection={() => setActiveSection('header')}
                    />
                    <button
                      type="button"
                      className="absolute bottom-[-9px] left-1/2 -translate-x-1/2 z-10 h-4 w-20 rounded-full border border-slate-300 bg-white shadow-sm cursor-ns-resize touch-none"
                      onPointerDown={(event) => startSectionResize('header', event)}
                      title="تغییر ارتفاع سربرگ"
                      style={{ touchAction: 'none', userSelect: 'none' }}
                    >
                      <span className="block mx-auto mt-[6px] h-[2px] w-8 rounded-full bg-slate-400" />
                    </button>
                  </section>
                ) : null}

                <section
                  className={`relative flex-1 ${activeSection === 'body' ? 'ring-1 ring-inset ring-[rgba(var(--brand-500-rgb),0.24)]' : ''}`}
                  onClick={() => setActiveSection('body')}
                >
                  <div className="pointer-events-none absolute top-2 right-4 z-10 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
                    بدنه
                  </div>
                  <PrintTemplateEditor
                    key={`${editingTemplate.id}-body`}
                    value={editingTemplate.contentHtml}
                    onChange={(html) => setEditingTemplate((prev) => (prev ? { ...prev, contentHtml: html } : prev))}
                    placeholder="متن و جدول‌های اصلی سند را اینجا طراحی کنید..."
                    minHeight={editingTemplate.showHeader !== false || editingTemplate.showFooter !== false ? 460 : 640}
                    onEditorReady={setBodyEditor}
                    onFocusSection={() => setActiveSection('body')}
                  />
                </section>

                {editingTemplate.showFooter !== false ? (
                  <section
                    className={`relative flex-none border-t border-dashed border-slate-300/80 ${activeSection === 'footer' ? 'ring-1 ring-[rgba(var(--brand-500-rgb),0.32)]' : ''}`}
                    onClick={() => setActiveSection('footer')}
                    style={{ height: editingTemplate.footerHeight || FOOTER_HEIGHT_FALLBACK }}
                  >
                    <button
                      type="button"
                      className="absolute top-[-9px] left-1/2 -translate-x-1/2 z-10 h-4 w-20 rounded-full border border-slate-300 bg-white shadow-sm cursor-ns-resize touch-none"
                      onPointerDown={(event) => startSectionResize('footer', event)}
                      title="تغییر ارتفاع پاورقی"
                      style={{ touchAction: 'none', userSelect: 'none' }}
                    >
                      <span className="block mx-auto mt-[6px] h-[2px] w-8 rounded-full bg-slate-400" />
                    </button>
                    <div className="pointer-events-none absolute top-2 right-4 z-10 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
                      پاورقی
                    </div>
                    <PrintTemplateEditor
                      key={`${editingTemplate.id}-footer`}
                      value={editingTemplate.footerHtml || ''}
                      onChange={(html) => setEditingTemplate((prev) => (prev ? { ...prev, footerHtml: html } : prev))}
                      placeholder="پاورقی هر برگه را اینجا تنظیم کنید..."
                      minHeight={FOOTER_HEIGHT_MIN}
                      fixedHeight={Number(editingTemplate.footerHeight || FOOTER_HEIGHT_FALLBACK)}
                      contentPadding="8px 10px"
                      onEditorReady={setFooterEditor}
                      onFocusSection={() => setActiveSection('footer')}
                    />
                  </section>
                ) : null}
              </div>
            </div>
          </Card>
        )}
      </Drawer>

      <Modal
        title={`تنظیم فیلدهای قالب سیستمی${systemFieldsEditingTemplate ? ` - ${systemFieldsEditingTemplate.title}` : ''}`}
        open={systemFieldsModalOpen}
        onCancel={() => {
          setSystemFieldsModalOpen(false);
          setSystemFieldsEditingTemplate(null);
          setSystemFieldsSearch('');
          setSystemFieldKeysDraft([]);
        }}
        onOk={saveSystemFieldsEditor}
        okText="ذخیره"
        cancelText="انصراف"
        confirmLoading={saving}
        width={860}
        destroyOnHidden
      >
        <div className="flex flex-col gap-3">
          <Input
            value={systemFieldsSearch}
            onChange={(e) => setSystemFieldsSearch(e.target.value)}
            placeholder="جست‌وجوی فیلد یا گروه"
            allowClear
          />
          <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-slate-50/70 dark:bg-slate-900/40">
            <Checkbox
              checked={systemFieldKeysDraft.length === systemFieldOptions.length && systemFieldOptions.length > 0}
              indeterminate={
                systemFieldKeysDraft.length > 0 &&
                systemFieldKeysDraft.length < systemFieldOptions.length
              }
              onChange={(e) =>
                setSystemFieldKeysDraft(
                  e.target.checked ? systemFieldOptions.map((item) => item.key) : []
                )
              }
            >
              انتخاب همه
            </Checkbox>
            <Typography.Text type="secondary">
              {`انتخاب‌شده: ${systemFieldKeysDraft.length} از ${systemFieldOptions.length}`}
            </Typography.Text>
          </div>

          <div className="max-h-[52vh] overflow-auto border border-slate-200 dark:border-slate-700 rounded-2xl p-3 bg-white/70 dark:bg-slate-900/30">
            {groupedSystemFieldOptions.length === 0 ? (
              <Empty description="فیلدی پیدا نشد" />
            ) : (
              <Space direction="vertical" size={12} className="w-full">
                {groupedSystemFieldOptions.map(([groupName, items]) => {
                  const groupKeys = items.map((item) => item.key);
                  const groupSelectedCount = groupKeys.filter((key) => systemFieldKeysDraft.includes(key)).length;
                  const groupAllSelected = groupSelectedCount === groupKeys.length && groupKeys.length > 0;
                  const groupIndeterminate = groupSelectedCount > 0 && groupSelectedCount < groupKeys.length;
                  return (
                    <Card
                      key={groupName}
                      size="small"
                      className="rounded-xl border border-slate-200 dark:border-slate-700"
                      bodyStyle={{ padding: 10 }}
                      title={
                        <div className="flex items-center justify-between gap-2">
                          <Checkbox
                            checked={groupAllSelected}
                            indeterminate={groupIndeterminate}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSystemFieldKeysDraft((prev) => {
                                const next = new Set(prev);
                                groupKeys.forEach((key) => {
                                  if (checked) next.add(key);
                                  else next.delete(key);
                                });
                                return Array.from(next);
                              });
                            }}
                          >
                            {groupName}
                          </Checkbox>
                          <Tag>{`${groupSelectedCount}/${groupKeys.length}`}</Tag>
                        </div>
                      }
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {items.map((item) => (
                          <Checkbox
                            key={item.key}
                            checked={systemFieldKeysDraft.includes(item.key)}
                            onChange={(e) => toggleSystemFieldKey(item.key, e.target.checked)}
                          >
                            <div className="inline-flex items-center gap-2">
                              <span>{item.label}</span>
                              <Typography.Text type="secondary" className="text-[11px]">
                                {item.kind === 'table' ? 'جدولی' : 'رکورد'}
                              </Typography.Text>
                            </div>
                          </Checkbox>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </Space>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PrintTemplatesTab;

