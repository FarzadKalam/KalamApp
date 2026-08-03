import React from 'react';
import { App } from 'antd';
import { MODULES } from '../../../moduleRegistry';
import { supabase } from '../../../supabaseClient';
import type { NoteAttachment } from '../../../utils/noteContent';
import { buildClientFallbackSystemCode, supportsSystemCode } from '../../../utils/systemCode';
import { normalizeTaskSourceValues } from '../../../utils/taskMeta';
import { attachTaskCompletionIfNeeded } from '../../../utils/taskCompletion';
import { createFileManagerShortcut } from '../../../utils/fileManagerService';
import { syncRecordTags } from '../../../utils/recordTags';
import { insertRecordActivity } from '../../../utils/recordActivity';
import { runWorkflowsForEvent } from '../../../utils/workflowRuntime';
import SmartForm from '../../SmartForm';

export type MessageActivityDraft = {
  initialValues: Record<string, any>;
  attachments: NoteAttachment[];
  relatedModuleId: string | null;
  relatedRecordId: string | null;
  sourceLabel: string;
};

type MessageActivityModalRuntimeProps = {
  draft: MessageActivityDraft;
  profileId?: string | null;
  onClose: () => void;
};

const isMissingAuditColumnError = (error: any) => {
  const text = String(error?.message || error?.details || '').toLowerCase();
  return text.includes('created_by') || text.includes('updated_by');
};

const MessageActivityModalRuntime: React.FC<MessageActivityModalRuntimeProps> = ({ draft, profileId, onClose }) => {
  const { message } = App.useApp();
  const handleSave = async (values: any, meta?: { selectedTags?: any[] }) => {
    const tasksModule = MODULES.tasks;
    if (!tasksModule?.table) throw new Error('ماژول فعالیت‌ها در دسترس نیست.');
    const userId = String(profileId || '').trim() || null;
    const selectedTags = Array.isArray(meta?.selectedTags) ? meta?.selectedTags || [] : [];
    let payload = attachTaskCompletionIfNeeded(normalizeTaskSourceValues(values || {}));
    if (supportsSystemCode('tasks') && !payload.system_code) {
      payload = {
        ...payload,
        system_code: await buildClientFallbackSystemCode(supabase, 'tasks', tasksModule.table),
      };
    }
    const withAudit = userId
      ? { ...payload, created_by: payload.created_by ?? userId, updated_by: payload.updated_by ?? userId }
      : payload;
    let insertResult = await supabase.from(tasksModule.table).insert(withAudit).select('*').single();
    if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
      insertResult = await supabase.from(tasksModule.table).insert(payload).select('*').single();
    }
    if (insertResult.error) throw insertResult.error;
    const inserted = insertResult.data;
    const taskId = String(inserted?.id || '').trim();
    if (!taskId) throw new Error('ایجاد فعالیت ناموفق بود.');
    if (selectedTags.length > 0) await syncRecordTags(supabase, 'tasks', taskId, selectedTags);
    for (const [index, attachment] of draft.attachments.entries()) {
      try {
        await createFileManagerShortcut({
          assetId: attachment.assetId || null,
          sourceEntryId: attachment.entryId || null,
          sourceModuleId: attachment.moduleId || draft.relatedModuleId,
          sourceRecordId: attachment.recordId || draft.relatedRecordId,
          sourceRecordTitle: draft.sourceLabel,
          targetModuleId: 'tasks',
          targetRecordId: taskId,
          targetRecordTitle: String(inserted?.name || payload?.name || 'فعالیت').trim(),
          fileUrl: attachment.url,
          fileName: attachment.name || null,
          mimeType: attachment.mimeType || null,
          fileType: attachment.fileType || null,
          sortOrder: index,
        });
      } catch (error) {
        console.warn('Could not attach message file to created activity', error);
      }
    }
    try {
      await insertRecordActivity({
        supabase,
        moduleId: 'tasks',
        recordId: taskId,
        action: 'create',
        userId,
        recordTitle: String(inserted?.name || payload?.name || '').trim() || null,
      });
    } catch (error) {
      console.warn('Changelog insert failed:', error);
    }
    await runWorkflowsForEvent({
      moduleId: 'tasks',
      event: 'create',
      currentRecord: inserted as Record<string, any>,
    });
    message.success('فعالیت ثبت شد');
    onClose();
  };

  return (
    <SmartForm
      module={MODULES.tasks}
      visible
      title="ایجاد فعالیت"
      initialValues={draft.initialValues}
      onCancel={onClose}
      onSave={handleSave}
      overlayZIndex={15100}
    />
  );
};

export default MessageActivityModalRuntime;
