import React, { useState } from 'react';
import { App, Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import FileManagerPickerModal from '../files/FileManagerPickerModal';
import type { NoteAttachment } from '../../utils/noteContent';
import { uploadAiFileAttachments } from '../../utils/aiFileAttachments';
import { ensureRecordAiFilesFolder, ensureWorkspaceAiFilesFolder } from '../../utils/fileManagerService';
import {
  buildAiUploadedFilePromptFromUrl,
  type AiUploadedFilePrompt,
} from '../../utils/aiUploadedFilePrompt';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type AiFileUploadButtonProps = {
  disabled?: boolean;
  loading?: boolean;
  size?: ButtonProps['size'];
  moduleId?: string | null;
  recordId?: string | null;
  onPrepared: (filePrompt: AiUploadedFilePrompt) => void | Promise<void>;
};

const AiFileUploadButton: React.FC<AiFileUploadButtonProps> = ({
  disabled = false,
  loading = false,
  size,
  moduleId,
  recordId,
  onPrepared,
}) => {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [initialFolderKey, setInitialFolderKey] = useState<string | null>(null);

  const normalizedModuleId = String(moduleId || '').trim() || null;
  const normalizedRecordId = String(recordId || '').trim() || null;
  const hasRecordScope = Boolean(normalizedModuleId && normalizedRecordId);

  const prepareAttachment = async (attachment: NoteAttachment) => {
    const url = String(attachment.url || '').trim();
    if (!url) return;
    setPreparing(true);
    try {
      const filePrompt = await buildAiUploadedFilePromptFromUrl({
        url,
        name: attachment.name,
        mimeType: attachment.mimeType || null,
        assetId: attachment.assetId || null,
        entryId: attachment.entryId || null,
        moduleId: attachment.moduleId || normalizedModuleId,
        recordId: attachment.recordId || normalizedRecordId,
      });
      await onPrepared(filePrompt);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'آماده‌سازی فایل برای هوش مصنوعی ناموفق بود.'));
    } finally {
      setPreparing(false);
    }
  };

  const openPicker = async () => {
    setPreparing(true);
    try {
      const folder = hasRecordScope
        ? await ensureRecordAiFilesFolder(normalizedModuleId || '', normalizedRecordId || '')
        : await ensureWorkspaceAiFilesFolder();
      setInitialFolderKey(folder?.id ? `folder:${folder.id}` : null);
    } catch (error) {
      console.warn('Could not prepare AI files folder', error);
      setInitialFolderKey(null);
    } finally {
      setPreparing(false);
      setOpen(true);
    }
  };

  const handleUploadFiles = async (
    files: File[],
    context?: { folderKey: string; folderId?: string | null; moduleId?: string | null; recordId?: string | null },
  ) => {
    setPreparing(true);
    try {
      const targetModuleId = String(context?.moduleId || normalizedModuleId || '').trim();
      const targetRecordId = String(context?.recordId || normalizedRecordId || '').trim();
      const hasTargetRecord = Boolean(targetModuleId && targetRecordId);
      const safeFolderId = hasTargetRecord || (!targetModuleId && !targetRecordId)
        ? String(context?.folderId || '').trim() || null
        : null;
      const attachments = await uploadAiFileAttachments(files.slice(0, 1), {
        moduleId: hasTargetRecord ? targetModuleId : null,
        recordId: hasTargetRecord ? targetRecordId : null,
        folderId: safeFolderId,
      });
      const attachment = attachments[0];
      if (attachment) await prepareAttachment(attachment);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'آپلود فایل در فایل‌منیجر ناموفق بود.'));
    } finally {
      setPreparing(false);
    }
  };

  return (
    <>
      <Tooltip title="ارسال فایل به هوش مصنوعی">
        <Button
          icon={<PaperClipOutlined />}
          disabled={disabled || loading || preparing}
          loading={preparing || loading}
          size={size}
          onClick={() => void openPicker()}
        />
      </Tooltip>
      <FileManagerPickerModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(attachments) => {
          const attachment = attachments[0];
          setOpen(false);
          if (attachment) void prepareAttachment(attachment);
        }}
        onUploadFiles={handleUploadFiles}
        moduleId={normalizedModuleId}
        recordId={normalizedRecordId}
        initialFolderKey={initialFolderKey}
        title="انتخاب یا آپلود فایل برای هوش مصنوعی"
        multiple={false}
        fileTypes={['file', 'image']}
      />
    </>
  );
};

export default AiFileUploadButton;
export type { AiUploadedFilePrompt };
