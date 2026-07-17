import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Empty,
  Select,
  Space,
  Spin,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowRightOutlined,
  DownloadOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  PrinterOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { loadProfilesWithCompat } from '../utils/profileDirectory';
import {
  formatKnowledgeVisibilitySummary,
  normalizeKnowledgeVisibilityIds,
} from '../utils/knowledgeVisibility';
import RecordFilesManager from '../components/RecordFilesManager';
import AdaptiveIdentityPicker from '../components/AdaptiveIdentityPicker';
import AiSparkleIcon from '../components/ai/AiSparkleIcon';
import {
  buildBusinessModelCanvasDocumentContent,
  BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE,
  BUSINESS_MODEL_CANVAS_SECTIONS,
  BUSINESS_MODEL_CANVAS_SYSTEM_KEY,
  BUSINESS_MODEL_CANVAS_TITLE,
  createEmptyBusinessModelCanvasSections,
  extractBusinessModelCanvasSections,
  hasBusinessModelCanvasContent,
  type BusinessModelCanvasSectionKey,
  type BusinessModelCanvasSections,
} from '../utils/businessModelCanvas';
import {
  embedKnowledgeDocumentChunks,
  rebuildKnowledgeDocumentChunks,
  type OrgKnowledgeDocumentLike,
} from '../utils/orgKnowledgeDocuments';
import {
  buildBusinessModelCanvasPrintHtml,
  downloadKnowledgePrintPdf,
  loadKnowledgePrintCompanyInfo,
  printKnowledgeHtml,
} from '../utils/orgKnowledgePrint';

type OrgDocument = OrgKnowledgeDocumentLike & {
  updated_at?: string | null;
};

const DOCUMENT_SELECT_FIELDS = 'id, title, body, body_html, document_type, status, use_for_ai, updated_at, metadata, allowed_user_ids, allowed_role_ids';

const STATUS_OPTIONS = [
  { label: 'فعال', value: 'active' },
  { label: 'پیش‌نویس', value: 'draft' },
  { label: 'آرشیو', value: 'archived' },
];

const sectionOrder = BUSINESS_MODEL_CANVAS_SECTIONS.map((section) => section.key);

const splitLines = (value: string) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

const sectionValueMap = (sections: BusinessModelCanvasSections) =>
  sectionOrder.reduce<Record<BusinessModelCanvasSectionKey, string>>((acc, key) => {
    acc[key] = sections[key].join('\n');
    return acc;
  }, {} as Record<BusinessModelCanvasSectionKey, string>);

const topRowSectionGroups: BusinessModelCanvasSectionKey[][] = [
  ['key_partners'],
  ['key_activities', 'key_resources'],
  ['value_propositions'],
  ['customer_relationships', 'channels'],
  ['customer_segments'],
];

const bottomRowSectionGroups: BusinessModelCanvasSectionKey[][] = [
  ['cost_structure'],
  ['revenue_streams'],
];

const OrgKnowledgeBusinessModelCanvasPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();

  const [document, setDocument] = useState<OrgDocument | null>(null);
  const [sectionTexts, setSectionTexts] = useState<Record<BusinessModelCanvasSectionKey, string>>(
    sectionValueMap(createEmptyBusinessModelCanvasSections())
  );
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>('active');
  const [useForAi, setUseForAi] = useState(true);
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [allowedRoleIds, setAllowedRoleIds] = useState<string[]>([]);
  const [visibilityUserOptions, setVisibilityUserOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [visibilityRoleOptions, setVisibilityRoleOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);

  const sections = useMemo<BusinessModelCanvasSections>(() => {
    const next = createEmptyBusinessModelCanvasSections();
    sectionOrder.forEach((key) => {
      next[key] = splitLines(sectionTexts[key]);
    });
    return next;
  }, [sectionTexts]);

  const completionCount = useMemo(
    () => BUSINESS_MODEL_CANVAS_SECTIONS.filter((section) => sections[section.key].length > 0).length,
    [sections]
  );

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
    const content = buildBusinessModelCanvasDocumentContent(createEmptyBusinessModelCanvasSections());
    const { data: inserted, error: insertError } = await supabase
      .from('org_documents')
      .insert([
        {
          title: BUSINESS_MODEL_CANVAS_TITLE,
          body: content.body,
          body_html: content.body_html,
          document_type: BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE,
          status: 'active',
          use_for_ai: true,
          metadata: {
            ...content.metadata,
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
    if (insertedDocument) {
      await rebuildKnowledgeDocumentChunks(supabase, insertedDocument);
      try {
        await embedKnowledgeDocumentChunks(supabase, insertedDocument);
      } catch (error) {
        console.warn('Business model canvas initial embedding failed', error);
      }
    }
    return insertedDocument;
  };

  const loadVisibilityOptions = async () => {
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
  };

  const hydrateFromDocument = (nextDocument: OrgDocument) => {
    const nextSections = extractBusinessModelCanvasSections(nextDocument.metadata);
    setDocument(nextDocument);
    setSectionTexts(sectionValueMap(nextSections));
    setStatus(nextDocument.status || 'active');
    setUseForAi(nextDocument.use_for_ai !== false);
    setAllowedUserIds(normalizeKnowledgeVisibilityIds(nextDocument.allowed_user_ids));
    setAllowedRoleIds(normalizeKnowledgeVisibilityIds(nextDocument.allowed_role_ids));
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [nextDocument] = await Promise.all([
          ensureBusinessModelCanvasDocument(),
          loadVisibilityOptions(),
        ]);
        if (!active || !nextDocument) return;
        hydrateFromDocument(nextDocument);
      } catch (error: any) {
        if (active) message.error(toFaErrorMessage(error, 'بارگذاری بوم کسب و کار ناموفق بود'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [message]);

  const handleSectionChange = (key: BusinessModelCanvasSectionKey, value: string) => {
    setSectionTexts((prev) => ({ ...prev, [key]: value }));
  };

  const renderSectionCard = (key: BusinessModelCanvasSectionKey, minHeightClassName = 'min-h-[240px]') => {
    const section = BUSINESS_MODEL_CANVAS_SECTIONS.find((item) => item.key === key);
    if (!section) return null;
    return (
      <section
        key={section.key}
        className={`rounded-[28px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(248,244,238,0.92))] shadow-[12px_12px_24px_rgba(210,199,185,0.2),-10px_-10px_22px_rgba(255,255,255,0.88)] overflow-hidden dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(37,42,48,0.96),rgba(23,27,32,0.98))] dark:shadow-[14px_14px_30px_rgba(0,0,0,0.34),-10px_-10px_26px_rgba(255,255,255,0.03)] ${minHeightClassName}`}
      >
        <div className={`h-full bg-[linear-gradient(145deg,var(--tw-gradient-stops))] ${section.accentClassName} p-4 md:p-5 dark:from-[rgba(255,255,255,0.04)] dark:via-[rgba(255,255,255,0.02)] dark:to-[rgba(0,0,0,0.08)]`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold text-[#8a7d70] dark:text-slate-400">{section.shortTitle}</div>
              <h2 className="m-0 mt-1 text-lg font-black text-[#3d342a] dark:text-slate-100">{section.title}</h2>
            </div>
            <span className="rounded-full border border-white/75 bg-white/65 px-2.5 py-1 text-[11px] text-[#73675c] shadow-[4px_4px_10px_rgba(215,204,191,0.18),-4px_-4px_10px_rgba(255,255,255,0.8)] dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:shadow-none">
              {sections[section.key].length.toLocaleString('fa-IR')} مورد
            </span>
          </div>
          <p className="m-0 mt-2 text-xs leading-6 text-[#6c6054] dark:text-slate-400">{section.helper}</p>
          <textarea
            dir="rtl"
            value={sectionTexts[section.key]}
            onChange={(event) => handleSectionChange(section.key, event.target.value)}
            placeholder={`${section.placeholder}\nهر خط یک مورد`}
            className="mt-4 min-h-[170px] w-full resize-y rounded-[22px] border border-white/70 bg-white/76 px-4 py-4 text-sm leading-7 text-[#2f2923] outline-none shadow-[inset_6px_6px_14px_rgba(213,202,188,0.18),inset_-6px_-6px_14px_rgba(255,255,255,0.88)] placeholder:text-[#ab9d90] focus:border-[rgba(var(--brand-500-rgb),0.4)] dark:border-white/10 dark:bg-[rgba(15,19,24,0.82)] dark:text-slate-100 dark:shadow-[inset_6px_6px_14px_rgba(0,0,0,0.28),inset_-4px_-4px_12px_rgba(255,255,255,0.03)] dark:placeholder:text-slate-500"
          />
        </div>
      </section>
    );
  };

  const handleSave = async () => {
    if (!document?.id) return;
    try {
      setSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      const content = buildBusinessModelCanvasDocumentContent(sections);
      const payload = {
        title: BUSINESS_MODEL_CANVAS_TITLE,
        body: content.body,
        body_html: content.body_html,
        document_type: BUSINESS_MODEL_CANVAS_DOCUMENT_TYPE,
        status,
        use_for_ai: useForAi,
        allowed_user_ids: normalizeKnowledgeVisibilityIds(allowedUserIds),
        allowed_role_ids: normalizeKnowledgeVisibilityIds(allowedRoleIds),
        updated_by: authData?.user?.id || null,
        metadata: {
          ...(document.metadata || {}),
          ...content.metadata,
          system_key: BUSINESS_MODEL_CANVAS_SYSTEM_KEY,
          is_system_default: true,
        },
      };
      const { data, error } = await supabase
        .from('org_documents')
        .update(payload)
        .eq('id', document.id)
        .select(DOCUMENT_SELECT_FIELDS)
        .maybeSingle();
      if (error) throw error;
      const updatedDocument = data as OrgDocument | null;
      if (!updatedDocument) throw new Error('اطلاعات بوم ذخیره نشد.');
      await rebuildKnowledgeDocumentChunks(supabase, updatedDocument);
      try {
        await embedKnowledgeDocumentChunks(supabase, updatedDocument);
      } catch (error) {
        console.warn('Business model canvas embedding failed', error);
        message.warning('بوم ذخیره شد، اما آماده‌سازی جستجوی هوشمند کامل نشد.');
      }
      hydrateFromDocument(updatedDocument);
      message.success('بوم کسب و کار ذخیره شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره بوم کسب و کار ناموفق بود'));
    } finally {
      setSaving(false);
    }
  };

  const getPrintHtml = async () => {
    const company = await loadKnowledgePrintCompanyInfo(supabase);
    return buildBusinessModelCanvasPrintHtml({
      sections,
      company,
    });
  };

  const handleDownload = async () => {
    try {
      setPrinting(true);
      await downloadKnowledgePrintPdf({
        title: BUSINESS_MODEL_CANVAS_TITLE,
        filename: BUSINESS_MODEL_CANVAS_TITLE,
        pageSize: 'A4 landscape',
        sourceHtml: await getPrintHtml(),
      });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'خطا در آماده‌سازی فایل دانلود'));
    } finally {
      setPrinting(false);
    }
  };

  const handlePrint = async () => {
    try {
      setPrinting(true);
      await printKnowledgeHtml({
        title: BUSINESS_MODEL_CANVAS_TITLE,
        pageSize: 'A4 landscape',
        sourceHtml: await getPrintHtml(),
      });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'خطا در آماده‌سازی پرینت'));
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
        <div className="min-h-[60vh] rounded-[32px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(244,240,233,0.9))] shadow-[18px_18px_40px_rgba(203,191,176,0.24),-14px_-14px_30px_rgba(255,255,255,0.88)] flex items-center justify-center dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(28,33,38,0.98),rgba(15,18,23,0.98))] dark:shadow-[18px_18px_40px_rgba(0,0,0,0.34),-14px_-14px_30px_rgba(255,255,255,0.02)]">
          <Spin size="large" />
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
        <div className="min-h-[60vh] rounded-[32px] border border-white/70 bg-white/90 flex items-center justify-center dark:border-white/10 dark:bg-[#171b20]">
          <Empty description="بوم کسب و کار پیدا نشد." />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1760px] mx-auto animate-fadeIn">
      <div className="rounded-[36px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,251,245,0.98),rgba(246,241,234,0.96))] shadow-[22px_22px_54px_rgba(203,191,176,0.24),-18px_-18px_42px_rgba(255,255,255,0.86)] px-4 py-4 md:px-6 md:py-6 dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_right,rgba(71,85,105,0.18),transparent_28%),linear-gradient(145deg,rgba(25,29,35,0.98),rgba(14,17,22,0.98))] dark:shadow-[22px_22px_54px_rgba(0,0,0,0.34),-18px_-18px_42px_rgba(255,255,255,0.03)]">
        <div className="flex flex-col gap-4 rounded-[28px] border border-white/70 bg-white/65 px-4 py-4 shadow-[inset_8px_8px_20px_rgba(216,206,192,0.16),inset_-8px_-8px_18px_rgba(255,255,255,0.88)] backdrop-blur md:px-5 dark:border-white/10 dark:bg-[rgba(17,21,26,0.7)] dark:shadow-[inset_10px_10px_24px_rgba(0,0,0,0.22),inset_-8px_-8px_20px_rgba(255,255,255,0.02)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <Space size={12} wrap>
                <Button icon={<ArrowRightOutlined />} onClick={() => navigate('/org-knowledge')}>
                  بازگشت به دانش سازمان
                </Button>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs text-gray-600 shadow-[6px_6px_14px_rgba(214,204,191,0.18),-6px_-6px_14px_rgba(255,255,255,0.82)] dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:shadow-none">
                  <FileTextOutlined />
                  چیدمان استاندارد جهانی BMC
                </span>
              </Space>
              <div>
                <h1 className="m-0 text-2xl md:text-3xl font-black text-[#3f3428] dark:text-slate-100">{BUSINESS_MODEL_CANVAS_TITLE}</h1>
                <p className="m-0 mt-2 max-w-3xl text-sm leading-7 text-[#6b5f53] dark:text-slate-300">
                  هر بلوک را با نکته‌های کوتاه پر کنید. هر خط یک ایده یا گزاره مستقل باشد تا هم برای خودتان خوانا بماند و هم هوش مصنوعی بتواند آن را دقیق‌تر درک کند.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 xl:min-w-[720px]">
              <div className="rounded-[24px] border border-white/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(248,243,236,0.88))] px-4 py-3 shadow-[10px_10px_22px_rgba(214,203,189,0.22),-8px_-8px_20px_rgba(255,255,255,0.85)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(33,38,44,0.96),rgba(20,24,29,0.98))] dark:shadow-[12px_12px_24px_rgba(0,0,0,0.28),-6px_-6px_18px_rgba(255,255,255,0.03)]">
                <div className="text-xs text-[#8a7d70] dark:text-slate-400">پیشرفت تکمیل</div>
                <div className="mt-2 text-2xl font-black text-[#3d342a] dark:text-slate-100">{completionCount.toLocaleString('fa-IR')} / ۹</div>
                <div className="mt-2 text-xs text-[#75685c] dark:text-slate-400">
                  {hasBusinessModelCanvasContent(sections) ? 'بوم وارد مرحله کاربردی شده است.' : 'هنوز داده واقعی برای بوم وارد نشده است.'}
                </div>
              </div>
              <div className="rounded-[24px] border border-white/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(247,242,235,0.88))] px-4 py-3 shadow-[10px_10px_22px_rgba(214,203,189,0.22),-8px_-8px_20px_rgba(255,255,255,0.85)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(33,38,44,0.96),rgba(20,24,29,0.98))] dark:shadow-[12px_12px_24px_rgba(0,0,0,0.28),-6px_-6px_18px_rgba(255,255,255,0.03)]">
                <div className="text-xs text-[#8a7d70] dark:text-slate-400">وضعیت انتشار</div>
                <Select
                  value={status}
                  onChange={setStatus}
                  options={STATUS_OPTIONS}
                  className="mt-2 w-full"
                  getPopupContainer={(trigger) => trigger.parentElement || window.document.body}
                />
              </div>
              <div className="rounded-[24px] border border-white/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(247,242,235,0.88))] px-4 py-3 shadow-[10px_10px_22px_rgba(214,203,189,0.22),-8px_-8px_20px_rgba(255,255,255,0.85)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(33,38,44,0.96),rgba(20,24,29,0.98))] dark:shadow-[12px_12px_24px_rgba(0,0,0,0.28),-6px_-6px_18px_rgba(255,255,255,0.03)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#8a7d70] dark:text-slate-400">استفاده در هوش مصنوعی</div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-medium text-[#4d4135] dark:text-slate-200">
                      <AiSparkleIcon className={`h-4 w-4 ${useForAi ? 'text-blue-600' : 'text-gray-400'}`} />
                      {useForAi ? 'فعال' : 'غیرفعال'}
                    </div>
                  </div>
                  <Switch checked={useForAi} onChange={setUseForAi} />
                </div>
              </div>
              <div className="rounded-[24px] border border-white/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(247,242,235,0.88))] px-4 py-3 shadow-[10px_10px_22px_rgba(214,203,189,0.22),-8px_-8px_20px_rgba(255,255,255,0.85)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(33,38,44,0.96),rgba(20,24,29,0.98))] dark:shadow-[12px_12px_24px_rgba(0,0,0,0.28),-6px_-6px_18px_rgba(255,255,255,0.03)]">
                <div className="text-xs text-[#8a7d70] dark:text-slate-400">آخرین وضعیت دسترسی</div>
                <div className="mt-2 text-sm leading-6 text-[#4d4135] dark:text-slate-300">
                  {formatKnowledgeVisibilitySummary(allowedUserIds, allowedRoleIds, visibilityUserOptions, visibilityRoleOptions)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
            <div className="rounded-[28px] border border-white/70 bg-white/55 px-3 py-3 shadow-[inset_10px_10px_20px_rgba(214,203,189,0.12),inset_-8px_-8px_18px_rgba(255,255,255,0.88)] dark:border-white/10 dark:bg-[rgba(12,16,21,0.52)] dark:shadow-[inset_10px_10px_20px_rgba(0,0,0,0.24),inset_-8px_-8px_18px_rgba(255,255,255,0.02)]">
              <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.08fr_1fr_1.18fr_1fr_1.08fr]">
                  {topRowSectionGroups.map((group, groupIndex) => (
                    <div
                      key={`top-group-${groupIndex}`}
                      className={`grid grid-cols-1 gap-4 ${group.length > 1 ? 'content-start' : ''}`}
                    >
                      {group.map((key) => renderSectionCard(key, group.length > 1 ? 'min-h-[220px]' : 'min-h-[460px]'))}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {bottomRowSectionGroups.map((group, groupIndex) => (
                    <div key={`bottom-group-${groupIndex}`} className="grid grid-cols-1 gap-4">
                      {group.map((key) => renderSectionCard(key, 'min-h-[300px]'))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[28px] border border-white/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(246,241,234,0.9))] px-4 py-4 shadow-[12px_12px_24px_rgba(210,199,185,0.2),-10px_-10px_22px_rgba(255,255,255,0.88)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(33,38,44,0.96),rgba(20,24,29,0.98))] dark:shadow-[12px_12px_24px_rgba(0,0,0,0.28),-6px_-6px_18px_rgba(255,255,255,0.03)]">
                <h3 className="m-0 text-base font-black text-[#3d342a] dark:text-slate-100">راهنمای تکمیل</h3>
                <ul className="m-0 mt-3 space-y-2 pr-4 text-sm leading-7 text-[#64584d] dark:text-slate-300">
                  <li>هر خط را کوتاه و شفاف بنویسید؛ از جمله‌های خیلی بلند پرهیز کنید.</li>
                  <li>اگر هنوز درباره یک بخش مطمئن نیستید، آن را خالی بگذارید تا بعداً تکمیل شود.</li>
                  <li>برای هر بخش فقط موارد واقعی و قابل‌اجرا را ثبت کنید تا خروجی AI قابل اتکا بماند.</li>
                </ul>
              </div>

              <div className="rounded-[28px] border border-white/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(246,241,234,0.9))] px-4 py-4 shadow-[12px_12px_24px_rgba(210,199,185,0.2),-10px_-10px_22px_rgba(255,255,255,0.88)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(33,38,44,0.96),rgba(20,24,29,0.98))] dark:shadow-[12px_12px_24px_rgba(0,0,0,0.28),-6px_-6px_18px_rgba(255,255,255,0.03)]">
                <h3 className="m-0 text-base font-black text-[#3d342a] dark:text-slate-100">دسترسی</h3>
                <div className="mt-3 space-y-3">
                  <AdaptiveIdentityPicker
                    mode="multiple"
                    scopes={['user']}
                    valueMode="raw"
                    allowClear
                    value={allowedUserIds}
                    onChange={(values) => setAllowedUserIds(normalizeKnowledgeVisibilityIds(Array.isArray(values) ? values : []))}
                    placeholder="اشخاص مجاز"
                    className="w-full"
                  />
                  <AdaptiveIdentityPicker
                    mode="multiple"
                    scopes={['role']}
                    valueMode="raw"
                    allowClear
                    value={allowedRoleIds}
                    onChange={(values) => setAllowedRoleIds(normalizeKnowledgeVisibilityIds(Array.isArray(values) ? values : []))}
                    placeholder="نقش‌های مجاز"
                    className="w-full"
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-white/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(246,241,234,0.9))] px-4 py-4 shadow-[12px_12px_24px_rgba(210,199,185,0.2),-10px_-10px_22px_rgba(255,255,255,0.88)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(33,38,44,0.96),rgba(20,24,29,0.98))] dark:shadow-[12px_12px_24px_rgba(0,0,0,0.28),-6px_-6px_18px_rgba(255,255,255,0.03)]">
                <h3 className="m-0 text-base font-black text-[#3d342a] dark:text-slate-100">اقدام‌ها</h3>
                <div className="mt-3 space-y-3">
                  <Button block icon={<PaperClipOutlined />} onClick={() => setFilesOpen(true)}>
                    فایل‌های مرتبط
                  </Button>
                  <Button block icon={<DownloadOutlined />} loading={printing} onClick={() => void handleDownload()}>
                    دانلود PDF
                  </Button>
                  <Button block icon={<PrinterOutlined />} loading={printing} onClick={() => void handlePrint()}>
                    پرینت
                  </Button>
                  <Tooltip title="ذخیره بوم، بازسازی دانش و ارسال نسخه تازه به هوش مصنوعی">
                    <Button type="primary" block icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
                      ذخیره بوم کسب و کار
                    </Button>
                  </Tooltip>
                </div>
                <Typography.Text type="secondary" className="mt-3 block text-xs leading-6 dark:!text-slate-400">
                  پس از ذخیره، متن ساختاریافته این بوم مثل بقیه دانش سازمان در اختیار دستیار هوشمند قرار می‌گیرد.
                </Typography.Text>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <RecordFilesManager
        open={filesOpen}
        onClose={() => setFilesOpen(false)}
        moduleId="org_knowledge"
        recordId={document.id}
        canEdit
        canDelete
      />
    </div>
  );
};

export default OrgKnowledgeBusinessModelCanvasPage;
