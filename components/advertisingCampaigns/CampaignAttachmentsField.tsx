import React, { useState } from 'react';
import { App, Button, List, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, FolderOpenOutlined, PaperClipOutlined } from '@ant-design/icons';
import FileManagerPickerModal from '../files/FileManagerPickerModal';
import { ensureNoteAttachmentShortcuts, uploadNoteAttachments } from '../../utils/noteAttachments';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { supabase } from '../../supabaseClient';
import type { CampaignAttachment } from './types';

type CampaignAttachmentsFieldProps = {
  moduleId: string;
  recordId?: string | null;
  value?: CampaignAttachment[];
  onChange: (attachments: CampaignAttachment[]) => void;
  title?: string;
  fileTypes?: Array<'image' | 'video' | 'file'>;
  disabled?: boolean;
};

const CampaignAttachmentsField: React.FC<CampaignAttachmentsFieldProps> = ({
  moduleId,
  recordId,
  value = [],
  onChange,
  title = 'فایل‌ها و پیوست‌ها',
  fileTypes,
  disabled,
}) => {
  const { message } = App.useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const attachments = Array.isArray(value) ? value : [];

  const append = async (items: CampaignAttachment[]) => {
    if (recordId) await ensureNoteAttachmentShortcuts(moduleId, recordId, items as any);
    let hydratedItems = items;
    if (recordId && items.some((item) => !item.recordFileId && item.url)) {
      const urls = Array.from(new Set(items.map((item) => String(item.url || '').trim()).filter(Boolean)));
      const { data } = await supabase.from('record_files').select('id,file_url').eq('module_id', moduleId).eq('record_id', recordId).in('file_url', urls).limit(Math.max(1, urls.length));
      const idByUrl = new Map((data || []).map((row: any) => [String(row.file_url), String(row.id)]));
      hydratedItems = items.map((item) => ({ ...item, recordFileId: item.recordFileId || idByUrl.get(String(item.url)) || null }));
    }
    const map = new Map(attachments.map((item) => [String(item.entryId || item.url), item]));
    hydratedItems.forEach((item) => map.set(String(item.entryId || item.url), item));
    onChange(Array.from(map.values()));
  };

  const upload = async (files: File[]) => {
    if (!recordId) {
      message.warning('ابتدا کمپین را ذخیره کنید تا پوشه اختصاصی ابزار ساخته شود.');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadNoteAttachments(moduleId, recordId, files);
      await append(uploaded as CampaignAttachment[]);
      message.success('فایل‌ها به پوشه این ابزار اضافه شدند.');
    } catch (error) {
      message.error(toFaErrorMessage(error, 'آپلود فایل ناموفق بود.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Space>
          <PaperClipOutlined />
          <Typography.Text strong>{title}</Typography.Text>
          <Tag>{attachments.length.toLocaleString('fa-IR')}</Tag>
        </Space>
        <Button
          icon={<FolderOpenOutlined />}
          loading={uploading}
          disabled={disabled || !recordId}
          onClick={() => setPickerOpen(true)}
        >
          انتخاب یا آپلود فایل
        </Button>
      </div>
      {attachments.length ? (
        <List
          size="small"
          dataSource={attachments}
          renderItem={(item) => (
            <List.Item
              actions={disabled ? undefined : [
                <Button
                  key="remove"
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  aria-label={`حذف ${item.name}`}
                  onClick={() => onChange(attachments.filter((entry) => entry !== item))}
                />,
              ]}
            >
              <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 truncate">
                {item.name || 'فایل کمپین'}
              </a>
            </List.Item>
          )}
        />
      ) : (
        <Typography.Text type="secondary" className="text-xs">فایلی برای این بخش انتخاب نشده است.</Typography.Text>
      )}
      <FileManagerPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(items) => void append(items as CampaignAttachment[])}
        onUploadFiles={(files) => void upload(files)}
        moduleId={moduleId}
        recordId={recordId}
        multiple
        fileTypes={fileTypes}
        title={title}
        zIndex={13350}
      />
    </div>
  );
};

export default CampaignAttachmentsField;
