import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { htmlToPlainText } from '../../utils/htmlToPlainText';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import { loadProfilesWithCompat } from '../../utils/profileDirectory';
import {
  formatKnowledgeVisibilitySummary,
  normalizeKnowledgeVisibilityIds,
} from '../../utils/knowledgeVisibility';
import {
  AI_CUSTOMER_RESPONSE_GUIDE_DEFAULT_BODY,
  AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE,
  AI_CUSTOMER_RESPONSE_GUIDE_SYSTEM_KEY,
  AI_CUSTOMER_RESPONSE_GUIDE_TITLE,
  AI_INSTRUCTIONS_DEFAULT_BODY,
  AI_INSTRUCTIONS_DOCUMENT_TYPE,
  AI_INSTRUCTIONS_SYSTEM_KEY,
  AI_INSTRUCTIONS_TITLE,
  isAiCustomerResponseGuideConfigured,
  isAiInstructionsConfigured,
} from '../../utils/aiKnowledge';
import {
  buildBusinessModelCanvasDocumentContent,
  BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE,
  BUSINESS_MODEL_CANVAS_SYSTEM_KEY,
  BUSINESS_MODEL_CANVAS_TITLE,
  createEmptyBusinessModelCanvasSections,
  isBusinessModelCanvasDocument,
} from '../../utils/businessModelCanvas';
import KnowledgeDocumentEditor, { OrgDocumentForEditor } from './KnowledgeDocumentEditor';
import AiSparkleIcon from '../../components/ai/AiSparkleIcon';
import {
  embedKnowledgeDocumentChunks,
  rebuildKnowledgeDocumentChunks,
} from '../../utils/orgKnowledgeDocuments';

type OrgDocument = {
  id: string;
  title: string;
  body: string;
  body_html?: string | null;
  document_type?: string | null;
  status: 'active' | 'draft' | 'archived';
  use_for_ai?: boolean;
  updated_at?: string | null;
  metadata?: Record<string, any> | null;
  allowed_user_ids?: string[] | null;
  allowed_role_ids?: string[] | null;
};

type KnowledgeFormValues = {
  title: string;
  document_type: string;
  status: 'active' | 'draft' | 'archived';
  body: string;
  allowed_user_ids: string[];
  allowed_role_ids: string[];
};

const DEFAULT_FORM_VALUES: KnowledgeFormValues = {
  title: '',
  document_type: 'business_plan',
  status: 'active',
  body: '',
  allowed_user_ids: [],
  allowed_role_ids: [],
};

const DOCUMENT_SELECT_FIELDS = 'id, title, body, body_html, document_type, status, use_for_ai, updated_at, metadata, allowed_user_ids, allowed_role_ids';

const BASE_DOCUMENT_TYPE_OPTIONS = [
  { label: 'دستورهای هوش مصنوعی', value: AI_INSTRUCTIONS_DOCUMENT_TYPE },
  { label: AI_CUSTOMER_RESPONSE_GUIDE_TITLE, value: AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE },
  { label: BUSINESS_MODEL_CANVAS_TITLE, value: BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE },
  { label: 'بیزنس پلن', value: 'business_plan' },
  { label: 'توضیحات کسب و کار', value: 'business_overview' },
  { label: 'SOP / فرایندها', value: 'sop' },
  { label: 'سیاست‌ها', value: 'policy' },
  { label: 'عمومی', value: 'general' },
];

const STATUS_OPTIONS = [
  { label: 'فعال', value: 'active' },
  { label: 'پیش‌نویس', value: 'draft' },
  { label: 'آرشیو', value: 'archived' },
];

const AiKnowledgeTab: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<KnowledgeFormValues>();
  const [documents, setDocuments] = useState<OrgDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<OrgDocument | null>(null);
  const [editorDocument, setEditorDocument] = useState<OrgDocument | null>(null);
  const [rebuildingId, setRebuildingId] = useState<string | null>(null);
  const [embeddingSummaryByDocument, setEmbeddingSummaryByDocument] = useState<Record<string, { total: number; ready: number; failed: number; pending: number }>>({});
  const [visibilityUserOptions, setVisibilityUserOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [visibilityRoleOptions, setVisibilityRoleOptions] = useState<Array<{ label: string; value: string }>>([]);

  // مدیریت آپشن‌های داینامیک نوع سند
  const [customTypeOptions, setCustomTypeOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [typeSearch, setTypeSearch] = useState('');

  const allTypeOptions = useMemo(() => {
    const base = [...BASE_DOCUMENT_TYPE_OPTIONS, ...customTypeOptions];
    return base;
  }, [customTypeOptions]);

  const creatableTypeOptions = useMemo(
    () =>
      allTypeOptions.filter(
        (option) =>
          option.value !== AI_INSTRUCTIONS_DOCUMENT_TYPE
          && option.value !== AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE
          && option.value !== BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE
      ),
    [allTypeOptions]
  );

  // اضافه کردن آپشن‌های custom از اسناد موجود هنگام بارگذاری
  useEffect(() => {
    if (!documents.length) return;
    const existingValues = new Set(BASE_DOCUMENT_TYPE_OPTIONS.map((o) => o.value));
    const extras: Array<{ label: string; value: string }> = [];
    documents.forEach((doc) => {
      const val = String(doc.document_type || '').trim();
      if (val && !existingValues.has(val)) {
        existingValues.add(val);
        extras.push({ label: val, value: val });
      }
    });
    if (extras.length) setCustomTypeOptions(extras);
  }, [documents]);

  useEffect(() => {
    let active = true;
    const loadVisibilityOptions = async () => {
      try {
        const bootstrap = await fetchSessionBootstrap(supabase);
        const currentOrgId = String(bootstrap?.orgId || '').trim();
        if (!currentOrgId) return;
        const [profilesResult, rolesResult] = await Promise.all([
          loadProfilesWithCompat(supabase, {
            orgId: currentOrgId,
            limit: 500,
            cacheKey: `knowledge-visibility:profiles:${currentOrgId}`,
            orderByFullName: true,
          }),
          supabase
            .from('org_roles')
            .select('id, title')
            .eq('org_id', currentOrgId)
            .order('title', { ascending: true })
            .limit(200),
        ]);
        if (!active) return;
        if (profilesResult.error) throw profilesResult.error;
        if (rolesResult.error) throw rolesResult.error;
        setVisibilityUserOptions((profilesResult.data || []).map((user: any) => ({
          label: String(user?.full_name || user?.email || user?.mobile_1 || '').trim() || 'کاربر بدون نام',
          value: String(user.id),
        })));
        setVisibilityRoleOptions((rolesResult.data || []).map((role: any) => ({
          label: String(role?.title || '').trim() || 'نقش بدون نام',
          value: String(role.id),
        })));
      } catch (error) {
        console.warn('Could not load knowledge visibility options', error);
      }
    };
    void loadVisibilityOptions();
    return () => {
      active = false;
    };
  }, []);

  const sortedDocuments = useMemo(
    () =>
      [...documents].sort((a, b) => {
        const aType = String(a.document_type || '');
        const bType = String(b.document_type || '');
        const systemOrder = [AI_INSTRUCTIONS_DOCUMENT_TYPE, AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE, BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE];
        const aSystemIndex = systemOrder.indexOf(aType);
        const bSystemIndex = systemOrder.indexOf(bType);
        const aIsSystem = aSystemIndex >= 0;
        const bIsSystem = bSystemIndex >= 0;
        if (aIsSystem !== bIsSystem) return aIsSystem ? -1 : 1;
        if (aIsSystem && bIsSystem && aSystemIndex !== bSystemIndex) return aSystemIndex - bSystemIndex;
        return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
      }),
    [documents]
  );

  const ensureAiInstructionsDocument = async () => {
    const { data, error } = await supabase
      .from('org_documents')
      .select(DOCUMENT_SELECT_FIELDS)
      .eq('document_type', AI_INSTRUCTIONS_DOCUMENT_TYPE)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const existing = Array.isArray(data) ? (data[0] as OrgDocument | undefined) : undefined;
    if (existing) return existing;

    const { data: authData } = await supabase.auth.getUser();
    const { data: inserted, error: insertError } = await supabase
      .from('org_documents')
      .insert([
        {
          title: AI_INSTRUCTIONS_TITLE,
          body: AI_INSTRUCTIONS_DEFAULT_BODY,
          document_type: AI_INSTRUCTIONS_DOCUMENT_TYPE,
          status: 'active',
          use_for_ai: true,
          metadata: {
            system_key: AI_INSTRUCTIONS_SYSTEM_KEY,
            is_system_default: true,
            default_template: true,
          },
          created_by: authData?.user?.id || null,
          updated_by: authData?.user?.id || null,
          allowed_user_ids: [],
          allowed_role_ids: [],
        },
      ])
      .select(DOCUMENT_SELECT_FIELDS)
      .maybeSingle();
    if (insertError) throw insertError;
    const insertedDocument = inserted as OrgDocument | null;
    if (insertedDocument) await rebuildChunks(insertedDocument);
    return insertedDocument;
  };

  const ensureBusinessModelCanvasDocument = async () => {
    const { data, error } = await supabase
      .from('org_documents')
      .select(DOCUMENT_SELECT_FIELDS)
      .eq('document_type', BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const existing = Array.isArray(data) ? (data[0] as OrgDocument | undefined) : undefined;
    if (existing) return existing;

    const { data: authData } = await supabase.auth.getUser();
    const defaultContent = buildBusinessModelCanvasDocumentContent(createEmptyBusinessModelCanvasSections());
    const { data: inserted, error: insertError } = await supabase
      .from('org_documents')
      .insert([
        {
          title: BUSINESS_MODEL_CANVAS_TITLE,
          body: defaultContent.body,
          body_html: defaultContent.body_html,
          document_type: BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE,
          status: 'active',
          use_for_ai: true,
          metadata: {
            ...defaultContent.metadata,
            system_key: BUSINESS_MODEL_CANVAS_SYSTEM_KEY,
          },
          created_by: authData?.user?.id || null,
          updated_by: authData?.user?.id || null,
          allowed_user_ids: [],
          allowed_role_ids: [],
        },
      ])
      .select(DOCUMENT_SELECT_FIELDS)
      .maybeSingle();
    if (insertError) throw insertError;
    const insertedDocument = inserted as OrgDocument | null;
    if (insertedDocument) await rebuildChunks(insertedDocument);
    return insertedDocument;
  };

  const ensureCustomerResponseGuideDocument = async () => {
    const { data, error } = await supabase
      .from('org_documents')
      .select(DOCUMENT_SELECT_FIELDS)
      .eq('document_type', AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const existing = Array.isArray(data) ? (data[0] as OrgDocument | undefined) : undefined;
    if (existing) return existing;

    const { data: authData } = await supabase.auth.getUser();
    const { data: inserted, error: insertError } = await supabase
      .from('org_documents')
      .insert([
        {
          title: AI_CUSTOMER_RESPONSE_GUIDE_TITLE,
          body: AI_CUSTOMER_RESPONSE_GUIDE_DEFAULT_BODY,
          document_type: AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE,
          status: 'active',
          use_for_ai: true,
          metadata: {
            system_key: AI_CUSTOMER_RESPONSE_GUIDE_SYSTEM_KEY,
            is_system_default: true,
            default_template: true,
          },
          created_by: authData?.user?.id || null,
          updated_by: authData?.user?.id || null,
          allowed_user_ids: [],
          allowed_role_ids: [],
        },
      ])
      .select(DOCUMENT_SELECT_FIELDS)
      .maybeSingle();
    if (insertError) throw insertError;
    const insertedDocument = inserted as OrgDocument | null;
    if (insertedDocument) await rebuildChunks(insertedDocument);
    return insertedDocument;
  };

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      await ensureAiInstructionsDocument();
      await ensureCustomerResponseGuideDocument();
      await ensureBusinessModelCanvasDocument();
      const { data, error } = await supabase
        .from('org_documents')
        .select(DOCUMENT_SELECT_FIELDS)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const nextDocuments = (data || []) as OrgDocument[];
      setDocuments(nextDocuments);
      const ids = nextDocuments.map((item) => item.id).filter(Boolean);
      if (ids.length > 0) {
        const { data: chunkRows } = await supabase
          .from('document_chunks')
          .select('document_id, embedding_status')
          .in('document_id', ids);
        const summary: Record<string, { total: number; ready: number; failed: number; pending: number }> = {};
        (chunkRows || []).forEach((row: any) => {
          const documentId = String(row?.document_id || '');
          if (!documentId) return;
          const current = summary[documentId] || { total: 0, ready: 0, failed: 0, pending: 0 };
          current.total += 1;
          const status = String(row?.embedding_status || 'pending');
          if (status === 'ready') current.ready += 1;
          else if (status === 'failed') current.failed += 1;
          else current.pending += 1;
          summary[documentId] = current;
        });
        setEmbeddingSummaryByDocument(summary);
      } else {
        setEmbeddingSummaryByDocument({});
      }
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'خطا در دریافت دانش سازمان'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocuments();
  }, []);

  const rebuildChunks = async (doc: OrgDocument | OrgDocumentForEditor) => {
    await rebuildKnowledgeDocumentChunks(supabase, doc);
  };

  const embedDocumentChunks = async (doc: OrgDocument | OrgDocumentForEditor, showFeedback = false) => {
    try {
      const data = await embedKnowledgeDocumentChunks(supabase, doc);
      if (showFeedback && Number((data as any)?.processed || 0) > 0) {
        message.success(`${Number((data as any).processed || 0).toLocaleString('fa-IR')} بخش برای جستجوی هوشمند آماده شد.`);
      }
    } catch (error: any) {
      if (showFeedback) {
        message.warning(toFaErrorMessage(error, 'سند ذخیره شد، اما آماده‌سازی جستجوی هوشمند کامل نشد.'));
      } else {
        console.warn('AI document embedding failed', error);
      }
    }
  };

  const openCreateModal = () => {
    setEditingDocument(null);
    form.setFieldsValue(DEFAULT_FORM_VALUES);
    setModalOpen(true);
  };

  const openQuickEditModal = (doc: OrgDocument) => {
    const isSystemDocument = String(doc.document_type || '') === AI_INSTRUCTIONS_DOCUMENT_TYPE;
    const isCustomerGuideDocument = String(doc.document_type || '') === AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE;
    const isCanvasDocument = String(doc.document_type || '') === BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE;
    setEditingDocument(doc);
    form.setFieldsValue({
      title: isSystemDocument
        ? AI_INSTRUCTIONS_TITLE
        : isCustomerGuideDocument
        ? AI_CUSTOMER_RESPONSE_GUIDE_TITLE
        : isCanvasDocument
        ? BUSINESS_MODEL_CANVAS_TITLE
        : (doc.title || ''),
      body: doc.body || '',
      document_type: isSystemDocument
        ? AI_INSTRUCTIONS_DOCUMENT_TYPE
        : isCustomerGuideDocument
        ? AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE
        : isCanvasDocument
        ? BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE
        : (doc.document_type || 'general'),
      status: doc.status || 'active',
      allowed_user_ids: normalizeKnowledgeVisibilityIds(doc.allowed_user_ids),
      allowed_role_ids: normalizeKnowledgeVisibilityIds(doc.allowed_role_ids),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      if (!editingDocument?.id && [AI_INSTRUCTIONS_DOCUMENT_TYPE, AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE, BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE].includes(String(values.document_type || '').trim())) {
        throw new Error('این نوع سند به‌صورت سیستمی مدیریت می‌شود و از این بخش قابل ایجاد نیست.');
      }
      const isSystemDocument = editingDocument?.document_type === AI_INSTRUCTIONS_DOCUMENT_TYPE;
      const isCustomerGuideDocument = editingDocument?.document_type === AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE;
      const isCanvasDocument = editingDocument?.document_type === BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE;
      const payload = {
        title: isSystemDocument
          ? AI_INSTRUCTIONS_TITLE
          : isCustomerGuideDocument
          ? AI_CUSTOMER_RESPONSE_GUIDE_TITLE
          : isCanvasDocument
          ? BUSINESS_MODEL_CANVAS_TITLE
          : values.title.trim(),
        body: values.body.trim(),
        body_html: null,
        document_type: isSystemDocument
          ? AI_INSTRUCTIONS_DOCUMENT_TYPE
          : isCustomerGuideDocument
          ? AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE
          : isCanvasDocument
          ? BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE
          : (values.document_type || 'general'),
        status: values.status || 'active',
        allowed_user_ids: normalizeKnowledgeVisibilityIds(values.allowed_user_ids),
        allowed_role_ids: normalizeKnowledgeVisibilityIds(values.allowed_role_ids),
        updated_by: authData?.user?.id || null,
        metadata: isSystemDocument
          ? {
              ...(editingDocument?.metadata || {}),
              system_key: AI_INSTRUCTIONS_SYSTEM_KEY,
              is_system_default: true,
              default_template: !isAiInstructionsConfigured(values.body),
            }
          : isCustomerGuideDocument
          ? {
              ...(editingDocument?.metadata || {}),
              system_key: AI_CUSTOMER_RESPONSE_GUIDE_SYSTEM_KEY,
              is_system_default: true,
              default_template: !isAiCustomerResponseGuideConfigured(values.body),
            }
          : isCanvasDocument
          ? {
              ...(editingDocument?.metadata || {}),
              system_key: BUSINESS_MODEL_CANVAS_SYSTEM_KEY,
              is_system_default: true,
            }
          : (editingDocument?.metadata || {}),
      };

      let nextDocument: OrgDocument | null = null;
      if (editingDocument?.id) {
        const { data, error } = await supabase
          .from('org_documents')
          .update(payload)
          .eq('id', editingDocument.id)
          .select(DOCUMENT_SELECT_FIELDS)
          .maybeSingle();
        if (error) throw error;
        nextDocument = data as OrgDocument;
      } else {
        const { data, error } = await supabase
          .from('org_documents')
          .insert([{ ...payload, created_by: authData?.user?.id || null, use_for_ai: true }])
          .select(DOCUMENT_SELECT_FIELDS)
          .maybeSingle();
        if (error) throw error;
        nextDocument = data as OrgDocument;
      }

      if (nextDocument) {
        await rebuildChunks(nextDocument);
        await embedDocumentChunks(nextDocument);
      }
      message.success('دانش سازمان ذخیره شد.');
      setModalOpen(false);
      setEditingDocument(null);
      await fetchDocuments();
    } catch (error: any) {
      if (Array.isArray(error?.errorFields)) return;
      message.error(toFaErrorMessage(error, 'ذخیره دانش سازمان ناموفق بود'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    const targetDocument = documents.find((item) => item.id === documentId);
    if (
      targetDocument?.document_type === AI_INSTRUCTIONS_DOCUMENT_TYPE
      || targetDocument?.document_type === AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE
      || isBusinessModelCanvasDocument(targetDocument)
    ) {
      message.warning('رکوردهای سیستمی دانش سازمان قابل حذف نیستند.');
      return;
    }
    try {
      const { error } = await supabase.from('org_documents').delete().eq('id', documentId);
      if (error) throw error;
      message.success('سند حذف شد.');
      await fetchDocuments();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'حذف سند ناموفق بود'));
    }
  };

  const handleRebuild = async (doc: OrgDocument) => {
    try {
      setRebuildingId(doc.id);
      await rebuildChunks(doc);
      await embedDocumentChunks(doc, true);

      // نمایش اطلاعات chunk ها
      const { data: chunkData } = await supabase
        .from('document_chunks')
        .select('content')
        .eq('document_id', doc.id);

      const chunks = (chunkData || []) as Array<{ content: string }>;
      const totalChunkChars = chunks.reduce((sum, c) => sum + String(c.content || '').length, 0);
      const originalChars = String(doc.body || '').length;

      if (chunks.length === 0) {
        message.info('این سند برای هوش مصنوعی غیرفعال است (بازسازی انجام نشد).');
      } else {
        message.success(
          `بازسازی موفق — ${chunks.length} بخش (chunk) ساخته شد · ${totalChunkChars.toLocaleString('fa-IR')} کاراکتر برای هوش مصنوعی از ${originalChars.toLocaleString('fa-IR')} کاراکتر اصلی`
        );
      }
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'بازسازی chunkها ناموفق بود'));
    } finally {
      setRebuildingId(null);
    }
  };

  // رندر dropdown آپشن نوع سند با قابلیت افزودن
  const renderTypeDropdown = (menu: React.ReactNode) => (
    <>
      {menu}
      {typeSearch && !allTypeOptions.find((o) => o.value === typeSearch) && (
        <div
          className="px-3 py-2 cursor-pointer text-blue-600 hover:bg-blue-50 border-t border-gray-100 text-sm"
          onMouseDown={(e) => {
            e.preventDefault();
            const newOpt = { label: typeSearch, value: typeSearch };
            setCustomTypeOptions((prev) => [...prev, newOpt]);
            form.setFieldValue('document_type', typeSearch);
            setTypeSearch('');
          }}
        >
          + افزودن «{typeSearch}»
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="m-0 text-base font-bold text-gray-800 dark:text-gray-100">دانش سازمان</h3>
          <p className="m-0 mt-1 text-xs text-gray-500">
            روی هر ردیف کلیک کنید تا ویرایشگر کامل باز شود. اسناد فعال با تیک هوش مصنوعی برای دستیار استفاده می‌شوند.
          </p>
        </div>
        <Button type="primary" icon={<SaveOutlined />} onClick={openCreateModal}>
          سند جدید
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={sortedDocuments}
        locale={{ emptyText: <Empty description="هنوز سندی ثبت نشده است." /> }}
        pagination={{ pageSize: 8 }}
        onRow={(row) => ({
          onClick: (e) => {
            if ((e.target as HTMLElement).closest('.ant-btn, button, .ant-popover, .ant-popconfirm')) return;
            if (isBusinessModelCanvasDocument(row)) {
              navigate('/org-knowledge/business-model-canvas');
              return;
            }
            setEditorDocument(row);
          },
          style: { cursor: 'pointer' },
          title: isBusinessModelCanvasDocument(row) ? 'برای باز کردن صفحه اختصاصی کلیک کنید' : 'برای ویرایش کامل کلیک کنید',
        })}
        columns={[
          {
            title: 'عنوان',
            dataIndex: 'title',
            render: (value: string, row: OrgDocument) => (
              <div>
                <div className="font-medium">{value || '-'}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  <span>
                    {allTypeOptions.find((o) => o.value === row.document_type)?.label || row.document_type || 'general'}
                  </span>
                  {String(row.document_type || '') === AI_INSTRUCTIONS_DOCUMENT_TYPE ? (
                    <Tag color={isAiInstructionsConfigured(row.body) ? 'magenta' : 'gold'} className="!m-0">
                      {isAiInstructionsConfigured(row.body) ? 'تنظیم‌شده' : 'نیازمند تنظیم'}
                    </Tag>
                  ) : String(row.document_type || '') === AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE ? (
                    <Tag color={isAiCustomerResponseGuideConfigured(row.body) ? 'blue' : 'gold'} className="!m-0">
                      {isAiCustomerResponseGuideConfigured(row.body) ? 'تنظیم‌شده' : 'پیش‌فرض'}
                    </Tag>
                  ) : isBusinessModelCanvasDocument(row) ? (
                    <Tag color="cyan" className="!m-0">
                      صفحه اختصاصی
                    </Tag>
                  ) : null}
                </div>
              </div>
            ),
          },
          {
            title: 'وضعیت',
            dataIndex: 'status',
            width: 100,
            render: (value: OrgDocument['status']) => (
              <Tag color={value === 'active' ? 'green' : value === 'draft' ? 'gold' : 'default'}>
                {value === 'active' ? 'فعال' : value === 'draft' ? 'پیش‌نویس' : 'آرشیو'}
              </Tag>
            ),
          },
          {
            title: 'هوش مصنوعی',
            dataIndex: 'use_for_ai',
            width: 160,
            render: (value: boolean | undefined, row: OrgDocument) => {
              const active = value !== false && row.status === 'active';
              const summary = embeddingSummaryByDocument[row.id];
              const label = !active
                ? 'غیرفعال'
                : !summary || summary.total === 0
                ? 'بدون بخش'
                : summary.failed > 0
                ? 'خطا'
                : summary.pending > 0
                ? 'در حال آماده‌سازی'
                : 'آماده';
              const color = label === 'آماده' ? 'green' : label === 'خطا' ? 'red' : label === 'در حال آماده‌سازی' ? 'gold' : 'default';
              return (
                <Space size={4}>
                  <Tooltip title={active ? 'دستیار از این سند استفاده می‌کند' : 'غیرفعال برای دستیار'}>
                    <AiSparkleIcon className={`h-4 w-4 ${active ? 'text-blue-500' : 'text-gray-300'}`} />
                  </Tooltip>
                  <Tag color={color} className="!m-0 text-[10px]">{label}</Tag>
                </Space>
              );
            },
          },
          {
            title: 'قابل مشاهده برای',
            width: 180,
            render: (_: unknown, row: OrgDocument) => (
              <Tooltip title={formatKnowledgeVisibilitySummary(row.allowed_user_ids, row.allowed_role_ids, visibilityUserOptions, visibilityRoleOptions)}>
                <Typography.Text type="secondary" className="text-xs">
                  {formatKnowledgeVisibilitySummary(row.allowed_user_ids, row.allowed_role_ids, visibilityUserOptions, visibilityRoleOptions)}
                </Typography.Text>
              </Tooltip>
            ),
          },
          {
            title: 'حجم متن',
            dataIndex: 'body',
            width: 110,
            render: (value: string, row: OrgDocument) => {
              const plain = row.body_html ? htmlToPlainText(row.body_html) : (value || '');
              return (
                <Typography.Text type="secondary" className="text-xs">
                  {plain.length.toLocaleString('fa-IR')} کاراکتر
                </Typography.Text>
              );
            },
          },
          {
            title: 'عملیات',
            width: 240,
            render: (_: unknown, row: OrgDocument) => (
              <Space size="small" onClick={(e) => e.stopPropagation()}>
                {isBusinessModelCanvasDocument(row) ? (
                  <Button size="small" icon={<EditOutlined />} onClick={() => navigate('/org-knowledge/business-model-canvas')}>
                    باز کردن بوم
                  </Button>
                ) : (
                  <Button size="small" icon={<EditOutlined />} onClick={() => openQuickEditModal(row)}>
                    ویرایش سریع
                  </Button>
                )}
                <Tooltip title="بازسازی bunk‌های هوش مصنوعی از محتوای فعلی سند">
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={rebuildingId === row.id}
                    onClick={() => handleRebuild(row)}
                  >
                    بازسازی AI
                  </Button>
                </Tooltip>
                {String(row.document_type || '') === AI_INSTRUCTIONS_DOCUMENT_TYPE
                || String(row.document_type || '') === AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE
                || isBusinessModelCanvasDocument(row) ? null : (
                  <Popconfirm title="این سند حذف شود؟" onConfirm={() => handleDelete(row.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      {/* مودال ویرایش سریع */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="ذخیره"
        cancelText="انصراف"
        title={editingDocument ? 'ویرایش سریع سند دانش سازمان' : 'سند جدید دانش سازمان'}
        width={820}
      >
        <Form form={form} layout="vertical" initialValues={DEFAULT_FORM_VALUES}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Form.Item
              label="عنوان"
              name="title"
              className="md:col-span-2"
              rules={[{ required: true, message: 'عنوان را وارد کنید.' }]}
            >
              <Input disabled={editingDocument?.document_type === AI_INSTRUCTIONS_DOCUMENT_TYPE || editingDocument?.document_type === AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE || editingDocument?.document_type === BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE} />
            </Form.Item>
            <Form.Item label="نوع سند" name="document_type">
              <Select
                options={editingDocument ? allTypeOptions : creatableTypeOptions}
                disabled={editingDocument?.document_type === AI_INSTRUCTIONS_DOCUMENT_TYPE || editingDocument?.document_type === AI_CUSTOMER_RESPONSE_GUIDE_DOCUMENT_TYPE || editingDocument?.document_type === BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE}
                showSearch
                filterOption={(input, opt) =>
                  String(opt?.label || '').toLowerCase().includes(input.toLowerCase())
                }
                onSearch={setTypeSearch}
                dropdownRender={renderTypeDropdown}
                getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
                placeholder="نوع سند را انتخاب یا تایپ کنید"
              />
            </Form.Item>
            <Form.Item label="وضعیت" name="status">
              <Select
                options={STATUS_OPTIONS}
                getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
              />
            </Form.Item>
            <Form.Item label="قابل مشاهده برای اشخاص" name="allowed_user_ids" className="md:col-span-2">
              <Select
                mode="multiple"
                allowClear
                showSearch
                options={visibilityUserOptions}
                optionFilterProp="label"
                placeholder="همه اشخاص سازمان"
                maxTagCount="responsive"
                getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
              />
            </Form.Item>
            <Form.Item label="قابل مشاهده برای نقش‌ها" name="allowed_role_ids">
              <Select
                mode="multiple"
                allowClear
                showSearch
                options={visibilityRoleOptions}
                optionFilterProp="label"
                placeholder="همه نقش‌ها"
                maxTagCount="responsive"
                getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
              />
            </Form.Item>
          </div>
          <Form.Item
            label="متن"
            name="body"
            rules={[{ required: true, message: 'متن سند را وارد کنید.' }]}
          >
            <Input.TextArea
              rows={14}
              placeholder="بیزنس پلن، توضیحات کسب‌وکار، سیاست‌ها یا فرایندها..."
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ویرایشگر کامل fullscreen */}
      {editorDocument && (
        <KnowledgeDocumentEditor
          document={editorDocument}
          typeOptions={allTypeOptions}
          visibilityUserOptions={visibilityUserOptions}
          visibilityRoleOptions={visibilityRoleOptions}
          onClose={() => setEditorDocument(null)}
          onSaved={() => {
            setEditorDocument(null);
            void fetchDocuments();
          }}
          rebuildChunks={rebuildChunks}
        />
      )}
    </div>
  );
};

export default AiKnowledgeTab;
