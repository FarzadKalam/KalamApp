import PhoneOutlined from '@ant-design/icons/PhoneOutlined';
import MessageOutlined from '@ant-design/icons/MessageOutlined';
import type { ModuleDefinition } from '../types';
import { supabase } from '../supabaseClient';
import { appFeedback, getFeedbackScope, getFeedbackSnapshot, type FeedbackAction } from './appFeedback';
import { fetchCurrentUserRoleContext, resolveCommunicationsPermissions } from './permissions';
import { hasCurrentOrgPlanModule } from './saasPlanModules';
import { getPrimaryRecordPhone } from './recordMessaging';
import { getRecordTitle } from './recordTitle';
import { FEEDBACK_POLICY } from './feedbackPolicy';

export const RECORD_FEEDBACK_ACTION_EVENT = 'tazesystem:record-feedback-action';
export type RecordFeedbackActionRequest = {
  kind: 'create_activity' | 'create_invoice' | 'call' | 'message';
  moduleId: string;
  record: Record<string, any>;
  scope: string;
};
export const dispatchRecordFeedbackAction = (request: RecordFeedbackActionRequest) => {
  if (request.scope !== getFeedbackScope()) return;
  window.dispatchEvent(new CustomEvent(RECORD_FEEDBACK_ACTION_EVENT, { detail: request }));
};

/** A committed record only. Failure to suggest a next action never changes save success. */
export const showRecordCreatedFeedback = (module: ModuleDefinition, record: Record<string, any>) => {
  const title = `${module.titles.faSingular || 'رکورد'} ثبت شد`;
  const description = getRecordTitle(record, module);
  const key = `record-created:${module.id}:${record.id}`;
  const config = module.createdFeedback;
  const scope = getFeedbackScope();
  appFeedback.success({ title, description, key, durationMs: config ? FEEDBACK_POLICY.recordCreatedMs : FEEDBACK_POLICY.durations.success });
  if (!config || !record.id) return;
  void (async () => {
    const context = await fetchCurrentUserRoleContext(supabase);
    if (!context.orgId || !context.userId || JSON.stringify([context.orgId, context.userId]) !== scope || getFeedbackScope() !== scope) return;
    const actions: FeedbackAction[] = [];
    const primaryModule = config.primary === 'create_invoice' ? 'invoices' : 'tasks';
    const canCreate = context.permissions?.[primaryModule]?.edit !== false;
    const canUseModule = config.primary && canCreate ? await hasCurrentOrgPlanModule(primaryModule) : false;
    if (getFeedbackScope() !== scope) return;
    const request = (kind: RecordFeedbackActionRequest['kind']) => dispatchRecordFeedbackAction({ kind, record, moduleId: module.id, scope });
    if (config.primary && canCreate && canUseModule) actions.push({ key: config.primary, label: config.primary === 'create_invoice' ? 'ثبت فاکتور سریع' : 'ثبت فعالیت', onClick: () => request(config.primary!) });
    const comm = resolveCommunicationsPermissions(context.permissions);
    const phone = getPrimaryRecordPhone(module.id, record);
    if (config.communications && phone) {
      if (comm.canUseVoip && context.permissions?.__voip?.view !== false) actions.push({ key: 'call', label: 'تماس', icon: <PhoneOutlined />, iconOnly: true, onClick: () => request('call') });
      if (comm.canUseSms && context.permissions?.__communications?.edit !== false) actions.push({ key: 'message', label: 'ارسال پیام', icon: <MessageOutlined />, iconOnly: true, onClick: () => request('message') });
    }
    if (getFeedbackScope() !== scope || !getFeedbackSnapshot().some(item => item.key === key)) return;
    appFeedback.success({ title, description, key, durationMs: FEEDBACK_POLICY.recordCreatedMs, actions });
  })().catch(() => { /* The save is complete; optional action discovery may fail closed. */ });
};
