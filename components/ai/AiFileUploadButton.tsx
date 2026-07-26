import React, { useRef, useState } from 'react';
import { App, Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import FileManagerPickerModal from '../files/FileManagerPickerModal';
import type { NoteAttachment } from '../../utils/noteContent';
import { uploadAiFileAttachments } from '../../utils/aiFileAttachments';
import { ensureRecordAiFilesFolder, ensureWorkspaceAiFilesFolder } from '../../utils/fileManagerService';
import {
  buildAiUploadedFilePrompt,
  buildAiUploadedFilePromptFromUrl,
  type AiUploadedFilePrompt,
} from '../../utils/aiUploadedFilePrompt';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type AiFileUploadButtonProps = {
  disabled?: boolean;
  loading?: boolean;
  size?: ButtonProps['size'];
  className?: string;
  moduleId?: string | null;
  recordId?: string | null;
  directUpload?: boolean;
  multiple?: boolean;
  onPrepared: (filePrompt: AiUploadedFilePrompt) => void | Promise<void>;
  onPreparedMany?: (filePrompts: AiUploadedFilePrompt[]) => void | Promise<void>;
};

const AiFileUploadButton: React.FC<AiFileUploadButtonProps> = ({
  disabled = false,
  loading = false,
  size,
  className,
  moduleId,
  recordId,
  directUpload = false,
  multiple = false,
  onPrepared,
  onPreparedMany,
}) => {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [initialFolderKey, setInitialFolderKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalizedModuleId = String(moduleId || '').trim() || null;
  const normalizedRecordId = String(recordId || '').trim() || null;
  const hasRecordScope = Boolean(normalizedModuleId && normalizedRecordId);

  const dispatchPrepared = async (filePrompts: AiUploadedFilePrompt[]) => {
    if (!filePrompts.length) return;
    if (onPreparedMany) {
      await onPreparedMany(filePrompts);
      return;
    }
    for (const filePrompt of filePrompts) {
      await onPrepared(filePrompt);
    }
  };

  const prepareAttachments = async (attachments: NoteAttachment[]) => {
    const prepared = await Promise.all(attachments
      .filter((attachment) => String(attachment.url || '').trim())
      .map((attachment) => buildAiUploadedFilePromptFromUrl({
        url: String(attachment.url || '').trim(),
        name: attachment.name,
        mimeType: attachment.mimeType || null,
        assetId: attachment.assetId || null,
        entryId: attachment.entryId || null,
        moduleId: attachment.moduleId || normalizedModuleId,
        recordId: attachment.recordId || normalizedRecordId,
      })));
    await dispatchPrepared(prepared);
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
      const attachments = await uploadAiFileAttachments(multiple ? files : files.slice(0, 1), {
        moduleId: hasTargetRecord ? targetModuleId : null,
        recordId: hasTargetRecord ? targetRecordId : null,
        folderId: safeFolderId,
      });
      await prepareAttachments(attachments);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'آپلود فایل در فایل‌منیجر ناموفق بود.'));
    } finally {
      setPreparing(false);
    }
  };

  const handleDirectFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setPreparing(true);
    try {
      const prepared = await Promise.all(files.map((file) => buildAiUploadedFilePrompt(file)));
      await dispatchPrepared(prepared);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'آماده‌سازی فایل برای هوش مصنوعی ناموفق بود.'));
    } finally {
      setPreparing(false);
    }
  };

  const openDirectUpload = () => {
    if (disabled || loading || preparing) return;
    inputRef.current?.click();
  };

  return (
    <>
      <Tooltip title="ارسال فایل به هوش مصنوعی">
        <Button
          icon={<PaperClipOutlined />}
          disabled={disabled || loading || preparing}
          loading={preparing || loading}
          size={size}
          className={className}
          aria-label="پیوست فایل به هوش مصنوعی"
          onClick={() => {
            if (directUpload) {
              openDirectUpload();
              return;
            }
            void openPicker();
          }}
        />
      </Tooltip>
      {directUpload ? (
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          className="hidden"
          onChange={(event) => {
            void handleDirectFileChange(event);
          }}
        />
      ) : null}
      <FileManagerPickerModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(attachments) => {
          const selectedAttachments = multiple ? attachments : attachments.slice(0, 1);
          setOpen(false);
          if (selectedAttachments.length) void prepareAttachments(selectedAttachments).catch((error) => {
            message.error(toFaErrorMessage(error, 'آماده‌سازی فایل برای هوش مصنوعی ناموفق بود.'));
          });
        }}
        onUploadFiles={handleUploadFiles}
        moduleId={normalizedModuleId}
        recordId={normalizedRecordId}
        initialFolderKey={initialFolderKey}
        title="انتخاب یا آپلود فایل برای هوش مصنوعی"
        multiple={multiple}
        fileTypes={['file', 'image']}
      />
    </>
  );
};

export default AiFileUploadButton;
export type { AiUploadedFilePrompt };
