import React, { useCallback, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  ArrowRightOutlined,
  PaperClipOutlined,
  PrinterOutlined,
  RobotOutlined,
  SaveOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { App, Button, Input, Modal, Select, Spin, Switch, Tooltip, Typography } from 'antd';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { htmlToPlainText } from '../../utils/htmlToPlainText';
import { printAsPdf } from '../../utils/printTemplates/printAsPdf';
import PrintTemplateToolbar from '../../components/moduleShow/PrintTemplateToolbar';
import RecordFilesManager from '../../components/RecordFilesManager';
import {
  AI_INSTRUCTIONS_DOCUMENT_TYPE,
  AI_INSTRUCTIONS_TITLE,
} from '../../utils/aiKnowledge';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import { loadProfilesWithCompat } from '../../utils/profileDirectory';
import { insertNotesWithFallback } from '../../utils/noteDispatch';
import {
  KnowledgeVisibilityOption,
  normalizeKnowledgeVisibilityIds,
} from '../../utils/knowledgeVisibility';

const PrintTemplateEditor = React.lazy(() => import('../../components/moduleShow/PrintTemplateEditor'));

const plainTextToHtml = (text: string) => {
  if (!text.trim()) return '';
  return text
    .split('\n')
    .map((line) => `<p>${line.trim() || '\u200b'}</p>`)
    .join('');
};

export type OrgDocumentForEditor = {
  id: string;
  title: string;
  body: string;
  body_html?: string | null;
  document_type?: string | null;
  status: 'active' | 'draft' | 'archived';
  use_for_ai?: boolean;
  metadata?: Record<string, any> | null;
  allowed_user_ids?: string[] | null;
  allowed_role_ids?: string[] | null;
};

interface KnowledgeDocumentEditorProps {
  document: OrgDocumentForEditor;
  typeOptions: Array<{ label: string; value: string }>;
  visibilityUserOptions?: KnowledgeVisibilityOption[];
  visibilityRoleOptions?: KnowledgeVisibilityOption[];
  onClose: () => void;
  onSaved: (updated: OrgDocumentForEditor) => void;
  rebuildChunks: (doc: OrgDocumentForEditor) => Promise<void>;
}

const STATUS_OPTIONS = [
  { label: 'فعال', value: 'active' },
  { label: 'پیش‌نویس', value: 'draft' },
  { label: 'آرشیو', value: 'archived' },
];

type ShareTargetOption = {
  label: string;
  value: string;
  searchText: string;
  userIds?: string[];
  roleIds?: string[];
};

const sanitizePrintFilename = (value: string) => {
  const normalized = String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'سند دانش سازمان';
};

const escapePrintHtml = (value: string) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const KnowledgeDocumentEditor: React.FC<KnowledgeDocumentEditorProps> = ({
  document,
  typeOptions,
  visibilityUserOptions = [],
  visibilityRoleOptions = [],
  onClose,
  onSaved,
  rebuildChunks,
}) => {
  const { message } = App.useApp();
  const isSystemDocument = String(document.document_type || '') === AI_INSTRUCTIONS_DOCUMENT_TYPE;

  const [bodyHtml, setBodyHtml] = useState<string>(
    document.body_html || plainTextToHtml(document.body || '')
  );
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const handleEditorReady = useCallback((editor: any) => setEditorInstance(editor), []);
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>(document.status || 'active');
  const [docType, setDocType] = useState<string>(document.document_type || 'general');
  const [useForAi, setUseForAi] = useState<boolean>(document.use_for_ai !== false);
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>(normalizeKnowledgeVisibilityIds(document.allowed_user_ids));
  const [allowedRoleIds, setAllowedRoleIds] = useState<string[]>(normalizeKnowledgeVisibilityIds(document.allowed_role_ids));
  const [saving, setSaving] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareTargetIds, setShareTargetIds] = useState<string[]>([]);
  const [shareMessageText, setShareMessageText] = useState('');
  const [shareTargetOptions, setShareTargetOptions] = useState<ShareTargetOption[]>([]);
  const [shareContext, setShareContext] = useState<{
    userId: string;
    authorName: string | null;
  }>({ userId: '', authorName: null });

  const handleSave = async () => {
    try {
      setSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      const plainBody = htmlToPlainText(bodyHtml);

      const payload: Record<string, any> = {
        body: plainBody,
        body_html: bodyHtml,
        status,
        document_type: isSystemDocument ? AI_INSTRUCTIONS_DOCUMENT_TYPE : docType,
        use_for_ai: useForAi,
        allowed_user_ids: normalizeKnowledgeVisibilityIds(allowedUserIds),
        allowed_role_ids: normalizeKnowledgeVisibilityIds(allowedRoleIds),
        updated_by: authData?.user?.id || null,
      };
      if (isSystemDocument) {
        payload.title = AI_INSTRUCTIONS_TITLE;
      }

      const { data, error } = await supabase
        .from('org_documents')
        .update(payload)
        .eq('id', document.id)
        .select('id, title, body, body_html, document_type, status, use_for_ai, updated_at, metadata, allowed_user_ids, allowed_role_ids')
        .maybeSingle();
      if (error) throw error;

      const updated = data as OrgDocumentForEditor;
      await rebuildChunks(updated);
      message.success('سند ذخیره شد.');
      onSaved(updated);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'ذخیره سند ناموفق بود'));
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    try {
      setPrinting(true);
      const html = DOMPurify.sanitize(bodyHtml || `<p>${escapePrintHtml(document.body || '')}</p>`, {
        ADD_ATTR: ['style', 'class', 'colspan', 'rowspan'],
      });
      await printAsPdf({
        title: document.title || 'سند دانش سازمان',
        filename: sanitizePrintFilename(document.title || 'سند دانش سازمان'),
        pageSize: 'A4 portrait',
        sourceHtml: `
          <div class="invoice-custom-print-shell" dir="rtl">
            <div class="print-template-page" style="width:210mm; min-height:297mm; box-sizing:border-box; padding:14mm; background:#fff; color:#111827; direction:rtl;">
              <h1 style="margin:0 0 12px; font-size:18px; line-height:1.8;">${escapePrintHtml(document.title || 'سند دانش سازمان')}</h1>
              <div style="font-family:inherit; direction:rtl; line-height:1.9; font-size:12px;">${html}</div>
            </div>
          </div>
        `,
      });
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در آماده‌سازی فایل پرینت'));
    } finally {
      setPrinting(false);
    }
  };

  const loadShareTargets = async () => {
    setShareLoading(true);
    try {
      const bootstrap = await fetchSessionBootstrap(supabase);
      const currentUserId = String(bootstrap?.user?.id || '').trim();
      const currentOrgId = String(bootstrap?.orgId || '').trim();
      if (!currentUserId || !currentOrgId) {
        message.warning('برای اشتراک‌گذاری باید وارد حساب کاربری شوید.');
        return;
      }

      const [directory, groupsResult] = await Promise.all([
        loadProfilesWithCompat(supabase, {
          orgId: currentOrgId,
          limit: 500,
          cacheKey: `knowledge-share:profiles:${currentOrgId}`,
          orderByFullName: true,
        }),
        supabase
          .from('chat_groups')
          .select('id, name, user_ids, role_ids')
          .eq('org_id', currentOrgId)
          .order('updated_at', { ascending: false })
          .limit(200),
      ]);

      if (directory.error) throw directory.error;
      if (groupsResult.error) throw groupsResult.error;

      const users = Array.isArray(directory.data) ? directory.data : [];
      const currentUser = users.find((item: any) => String(item?.id || '') === currentUserId);
      const authorName = String(currentUser?.full_name || currentUser?.email || currentUser?.mobile_1 || '').trim() || null;
      const options: ShareTargetOption[] = [
        ...(groupsResult.data || []).map((group: any) => {
          const label = `گروه داخلی: ${String(group?.name || '').trim() || 'گروه بدون نام'}`;
          const explicitUserIds = Array.isArray(group?.user_ids) ? group.user_ids.map((value: any) => String(value)) : [];
          const roleIds = Array.isArray(group?.role_ids) ? group.role_ids.map((value: any) => String(value)) : [];
          const roleDrivenUserIds = users
            .filter((user: any) => user?.role_id && roleIds.includes(String(user.role_id)))
            .map((user: any) => String(user.id));
          return {
            label,
            value: `chat_group:${String(group?.id || '').trim()}`,
            searchText: label.toLowerCase(),
            userIds: Array.from(new Set([...explicitUserIds, ...roleDrivenUserIds])),
            roleIds,
          };
        }),
        ...users
          .filter((user: any) => String(user?.id || '') !== currentUserId)
          .map((user: any) => {
            const displayName = String(user?.full_name || user?.email || user?.mobile_1 || '').trim() || 'کاربر بدون نام';
            return {
              label: `داخلی: ${displayName}`,
              value: `user:${String(user.id)}`,
              searchText: displayName.toLowerCase(),
            };
          }),
      ].filter((option) => option.value && !option.value.endsWith(':'));

      setShareContext({ userId: currentUserId, authorName });
      setShareTargetOptions(options);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'بارگذاری مقصدهای اشتراک‌گذاری ناموفق بود'));
    } finally {
      setShareLoading(false);
    }
  };

  const openShareModal = () => {
    setShareOpen(true);
    setShareMessageText(`سند دانش سازمان: ${isSystemDocument ? AI_INSTRUCTIONS_TITLE : (document.title || 'سند بدون عنوان')}`);
    if (shareTargetOptions.length === 0) {
      void loadShareTargets();
    }
  };

  const closeShareModal = () => {
    setShareOpen(false);
    setShareTargetIds([]);
    setShareMessageText('');
  };

  const handleShare = async () => {
    const normalizedTargets = Array.from(new Set(shareTargetIds.map((value) => String(value || '').trim()).filter(Boolean)));
    if (normalizedTargets.length === 0) {
      message.warning('حداقل یک مقصد انتخاب کنید.');
      return;
    }
    if (!shareContext.userId) {
      message.warning('اطلاعات کاربر فعلی برای اشتراک‌گذاری آماده نیست.');
      return;
    }

    const plainBody = htmlToPlainText(bodyHtml || document.body || '');
    const excerpt = plainBody.length > 700 ? `${plainBody.slice(0, 700)}...` : plainBody;
    const noteText = [String(shareMessageText || '').trim(), excerpt].filter(Boolean).join('\n\n');
    const optionMap = new Map(shareTargetOptions.map((option) => [option.value, option]));
    const payloads: Record<string, any>[] = normalizedTargets.flatMap<Record<string, any>>((targetId) => {
      if (targetId.startsWith('chat_group:')) {
        const option = optionMap.get(targetId);
        if (!option) return [];
        return [{
          module_id: 'org_knowledge',
          record_id: document.id,
          content: noteText,
          reply_to: null,
          mention_user_ids: Array.from(new Set(option.userIds || [])).filter((id) => id !== shareContext.userId),
          mention_role_ids: option.roleIds || [],
          author_id: shareContext.userId,
          author_name: shareContext.authorName,
          metadata: {
            chat_group_id: targetId.replace('chat_group:', ''),
            source_type: 'knowledge_document_share',
            document_title: isSystemDocument ? AI_INSTRUCTIONS_TITLE : (document.title || 'سند بدون عنوان'),
          },
        }];
      }

      if (targetId.startsWith('user:')) {
        const userId = targetId.replace('user:', '');
        if (!userId || userId === shareContext.userId) return [];
        return [{
          module_id: 'org_knowledge',
          record_id: document.id,
          content: noteText,
          reply_to: null,
          mention_user_ids: [userId],
          mention_role_ids: [],
          author_id: shareContext.userId,
          author_name: shareContext.authorName,
          metadata: {
            source_type: 'knowledge_document_share',
            document_title: isSystemDocument ? AI_INSTRUCTIONS_TITLE : (document.title || 'سند بدون عنوان'),
          },
        }];
      }

      return [];
    });

    if (payloads.length === 0) {
      message.warning('حداقل یک مقصد معتبر انتخاب کنید.');
      return;
    }

    setShareSubmitting(true);
    try {
      await insertNotesWithFallback(payloads);
      message.success('سند به اشتراک گذاشته شد.');
      closeShareModal();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'اشتراک‌گذاری سند ناموفق بود'));
    } finally {
      setShareSubmitting(false);
    }
  };

  return (
    <div
      className="flex flex-col bg-white dark:bg-gray-950"
      style={{ position: 'fixed', inset: 0, zIndex: 1500 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <Button
          icon={<ArrowRightOutlined />}
          onClick={onClose}
          type="text"
          size="small"
        >
          بازگشت
        </Button>

        <Typography.Text strong className="text-base flex-shrink-0 max-w-48 truncate">
          {isSystemDocument ? AI_INSTRUCTIONS_TITLE : (document.title || 'سند بدون عنوان')}
        </Typography.Text>

        <div className="flex items-center gap-2 mr-auto flex-wrap">
          {/* نوع سند */}
          {!isSystemDocument && (
            <Select
              value={docType}
              onChange={setDocType}
              options={typeOptions}
              size="small"
              style={{ width: 140 }}
              showSearch
              filterOption={(input, opt) =>
                String(opt?.label || '').toLowerCase().includes(input.toLowerCase())
              }
              onSearch={setTypeSearch}
              dropdownRender={(menu) => (
                <>
                  {menu}
                  {typeSearch && !typeOptions.find((o) => o.value === typeSearch) && (
                    <div
                      className="px-3 py-2 cursor-pointer text-blue-600 hover:bg-blue-50 border-t border-gray-100 text-sm"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setDocType(typeSearch);
                        setTypeSearch('');
                      }}
                    >
                      + افزودن «{typeSearch}»
                    </div>
                  )}
                </>
              )}
              placeholder="نوع سند"
            />
          )}

          {/* وضعیت */}
          <Select
            value={status}
            onChange={setStatus}
            options={STATUS_OPTIONS}
            size="small"
            style={{ width: 110 }}
          />

          <Select
            mode="multiple"
            allowClear
            showSearch
            value={allowedUserIds}
            onChange={(values) => setAllowedUserIds(normalizeKnowledgeVisibilityIds(values))}
            options={visibilityUserOptions}
            optionFilterProp="label"
            placeholder="اشخاص مجاز"
            maxTagCount="responsive"
            size="small"
            style={{ width: 180 }}
            getPopupContainer={(trigger) => trigger.parentElement || window.document.body}
            styles={{ popup: { root: { zIndex: 1710 } } }}
          />

          <Select
            mode="multiple"
            allowClear
            showSearch
            value={allowedRoleIds}
            onChange={(values) => setAllowedRoleIds(normalizeKnowledgeVisibilityIds(values))}
            options={visibilityRoleOptions}
            optionFilterProp="label"
            placeholder="نقش‌های مجاز"
            maxTagCount="responsive"
            size="small"
            style={{ width: 180 }}
            getPopupContainer={(trigger) => trigger.parentElement || window.document.body}
            styles={{ popup: { root: { zIndex: 1710 } } }}
          />

          {/* استفاده برای هوش مصنوعی */}
          <Tooltip title={useForAi ? 'هوش مصنوعی از این سند استفاده می‌کند' : 'هوش مصنوعی از این سند استفاده نمی‌کند'}>
            <div className="flex items-center gap-1 cursor-pointer" onClick={() => setUseForAi((v) => !v)}>
              <RobotOutlined className={useForAi ? 'text-blue-500' : 'text-gray-400'} />
              <span className={`text-xs ${useForAi ? 'text-blue-600' : 'text-gray-400'}`}>
                هوش مصنوعی
              </span>
              <Switch
                checked={useForAi}
                onChange={setUseForAi}
                size="small"
                onClick={(_, e) => e.stopPropagation()}
              />
            </div>
          </Tooltip>

          {/* فایل‌ها */}
          <Button
            icon={<PaperClipOutlined />}
            size="small"
            onClick={() => setFilesOpen(true)}
          >
            فایل‌ها
          </Button>

          {/* پرینت */}
          <Button
            icon={<PrinterOutlined />}
            size="small"
            loading={printing}
            onClick={handlePrint}
          >
            پرینت
          </Button>

          {/* اشتراک‌گذاری */}
          <Button
            icon={<ShareAltOutlined />}
            size="small"
            onClick={openShareModal}
          >
            اشتراک‌گذاری
          </Button>

          {/* ذخیره */}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            size="small"
            loading={saving}
            onClick={handleSave}
          >
            ذخیره
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex-shrink-0 overflow-x-auto">
        <PrintTemplateToolbar editor={editorInstance} />
      </div>

      {/* Editor body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <React.Suspense fallback={<Spin />}>
          <PrintTemplateEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            fillHeight
            contentPadding="32px 48px"
            placeholder="متن سند را اینجا بنویسید..."
            onEditorReady={handleEditorReady}
          />
        </React.Suspense>
      </div>

      {/* File Manager */}
      <RecordFilesManager
        open={filesOpen}
        onClose={() => setFilesOpen(false)}
        moduleId="org_knowledge"
        recordId={document.id}
        canEdit
        canDelete
      />

      <Modal
        title="اشتراک‌گذاری سند"
        open={shareOpen}
        onCancel={closeShareModal}
        onOk={() => void handleShare()}
        confirmLoading={shareSubmitting}
        okText="ارسال"
        cancelText="انصراف"
        okButtonProps={{ disabled: shareTargetIds.length === 0 }}
        zIndex={1700}
      >
        <div className="space-y-3">
          <Input.TextArea
            value={shareMessageText}
            onChange={(event) => setShareMessageText(event.target.value)}
            rows={3}
            placeholder="متن پیام اشتراک‌گذاری"
          />
          <Select
            mode="multiple"
            showSearch
            allowClear
            loading={shareLoading}
            value={shareTargetIds}
            onChange={(values) => setShareTargetIds((values || []).map((value) => String(value)))}
            placeholder="انتخاب پیام یا گروه داخلی"
            optionFilterProp="searchText"
            filterOption={(input, option) => String(option?.searchText || '').includes(String(input || '').trim().toLowerCase())}
            options={shareTargetOptions}
            getPopupContainer={(trigger) => trigger.parentElement || window.document.body}
            styles={{ popup: { root: { zIndex: 1710 } } }}
            maxTagCount="responsive"
            className="w-full"
          />
        </div>
      </Modal>
    </div>
  );
};

export default KnowledgeDocumentEditor;
