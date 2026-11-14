import React, { useEffect, useState } from 'react';
import { App, Modal } from 'antd';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import AiAgentTaskApprovalCard from './AiAgentTaskApprovalCard';

type Props = { change: any | null; onClose: () => void; onSaved: () => void | Promise<void> };
const AiAgentTaskManagerModal: React.FC<Props> = ({ change, onClose, onSaved }) => {
  const { message } = App.useApp();
  const [draft, setDraft] = useState(change);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(change), [change]);
  const confirm = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const proposal = await supabase.functions.invoke('ai-assistant', { body: { action: 'prepare_agent_task', change: draft } });
      if (proposal.error || !proposal.data?.success || !proposal.data?.proposedAction?.id) throw proposal.error || new Error(proposal.data?.message || 'آماده‌سازی کار تأیید نشد.');
      const result = await supabase.functions.invoke('ai-assistant', { body: { action: 'confirm_action', actionLogId: proposal.data.proposedAction.id } });
      if (result.error || result.data?.success !== true) throw result.error || new Error(result.data?.message || 'ثبت تغییر تأیید نشد.');
      message.success(result.data.message || 'تغییر کار خودکار ثبت شد.');
      onClose(); await onSaved();
    } catch (error) { message.error(toFaErrorMessage(error, 'ثبت تغییر کار خودکار تأیید نشد.')); }
    finally { setSaving(false); }
  };
  return <Modal open={Boolean(change)} title="بررسی کار خودکار" onCancel={saving ? undefined : onClose}
    onOk={() => void confirm()} okText="تأیید و اعمال تغییر" cancelText="بازگشت" confirmLoading={saving}
    cancelButtonProps={{ disabled: saving }} closable={!saving} maskClosable={!saving}
    width={720} styles={{ body: { maxHeight: '70dvh', overflowY: 'auto' } }} destroyOnHidden>
    {draft ? <AiAgentTaskApprovalCard change={draft} onChange={setDraft} disabled={saving} /> : null}
  </Modal>;
};
export default AiAgentTaskManagerModal;
