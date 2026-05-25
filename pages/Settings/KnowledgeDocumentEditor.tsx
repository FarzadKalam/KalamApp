import React, { useCallback, useState } from 'react';
import {
  ArrowRightOutlined,
  PaperClipOutlined,
  PrinterOutlined,
  RobotOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { App, Button, Select, Spin, Switch, Tooltip, Typography } from 'antd';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { htmlToPlainText } from '../../utils/htmlToPlainText';
import { printInIframe } from '../../utils/printTemplates/printInIframe';
import PrintTemplateToolbar from '../../components/moduleShow/PrintTemplateToolbar';
import RecordFilesManager from '../../components/RecordFilesManager';
import {
  AI_INSTRUCTIONS_DOCUMENT_TYPE,
  AI_INSTRUCTIONS_TITLE,
} from '../../utils/aiKnowledge';

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
};

interface KnowledgeDocumentEditorProps {
  document: OrgDocumentForEditor;
  typeOptions: Array<{ label: string; value: string }>;
  onClose: () => void;
  onSaved: (updated: OrgDocumentForEditor) => void;
  rebuildChunks: (doc: OrgDocumentForEditor) => Promise<void>;
}

const STATUS_OPTIONS = [
  { label: 'فعال', value: 'active' },
  { label: 'پیش‌نویس', value: 'draft' },
  { label: 'آرشیو', value: 'archived' },
];

const KnowledgeDocumentEditor: React.FC<KnowledgeDocumentEditorProps> = ({
  document,
  typeOptions,
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
  const [saving, setSaving] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');

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
        updated_by: authData?.user?.id || null,
      };
      if (isSystemDocument) {
        payload.title = AI_INSTRUCTIONS_TITLE;
      }

      const { data, error } = await supabase
        .from('org_documents')
        .update(payload)
        .eq('id', document.id)
        .select('id, title, body, body_html, document_type, status, use_for_ai, updated_at, metadata')
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
      const html = bodyHtml || `<p>${document.body || ''}</p>`;
      await printInIframe({
        title: document.title || 'سند دانش سازمان',
        sourceHtml: `<div style="font-family: inherit; direction: rtl; line-height: 1.8;">${html}</div>`,
      });
    } catch (err: any) {
      message.error('خطا در پرینت');
    } finally {
      setPrinting(false);
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
      <div className="flex-1 overflow-hidden">
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
    </div>
  );
};

export default KnowledgeDocumentEditor;
