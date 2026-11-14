import { normalizeAgentTaskConfig, summarizeAgentTaskDeliveries,
  type AgentTaskConfig, type AgentTaskDelivery, type AgentTaskDeliveryResult } from './ai-agent-task-contract.ts';

export type AgentTaskWorkflow = {
  id: string; orgId: string; creatorId: string; revision: number; active: boolean; config: unknown;
};
export type AgentTaskActor = {
  userId: string; orgId: string; active: boolean; canRunTasks: boolean;
  allowedAgentKeys: string[]; allowedModuleIds: string[]; allowedDeliveryChannels: string[];
  accessFingerprint?: string;
};
export type AgentTaskSource = { moduleId: string; records: unknown[]; truncated: boolean };
export type AgentTaskRuntimePorts = {
  loadWorkflow: (orgId: string, workflowId: string) => Promise<AgentTaskWorkflow | null>;
  loadActor: (orgId: string, userId: string) => Promise<AgentTaskActor | null>;
  // Adapter must apply CURRENT record and field ACL; a service key is not ACL.
  readSource: (actor: AgentTaskActor, moduleId: string, limit: number) => Promise<AgentTaskSource>;
  canReadEvent?: (actor: AgentTaskActor, moduleId: string, recordId: string) => Promise<boolean>;
  generate: (input: { actor: AgentTaskActor; config: AgentTaskConfig; sources: AgentTaskSource[]; eventRecordId: string | null }) => Promise<{ answer: string; hasFindings: boolean; coverageComplete?: boolean }>;
  deliver: (actor: AgentTaskActor, delivery: AgentTaskDelivery, input: { answer: string; workflow: AgentTaskWorkflow; config: AgentTaskConfig; executionKey: string }) => Promise<Omit<AgentTaskDeliveryResult, 'channel'>>;
};

export type AgentTaskExecutionResult = {
  status: 'success' | 'skipped' | 'failed'; message: string;
  deliveries: AgentTaskDeliveryResult[]; sourceCounts?: Array<{ moduleId: string; count: number; truncated: boolean }>;
};

/** Runs under the workflow engine's durable action claim. It deliberately has
 * no arbitrary-write tool and never impersonates an organization administrator. */
export const executeAgentTask = async (ports: AgentTaskRuntimePorts, input: {
  orgId: string; workflowId: string; revision: number; executionKey: string; eventRecordId?: string | null;
}): Promise<AgentTaskExecutionResult> => {
  const stopped = (message: string): AgentTaskExecutionResult => ({ status: 'skipped', message, deliveries: [] });
  const workflow = await ports.loadWorkflow(input.orgId, input.workflowId);
  if (!workflow || workflow.orgId !== input.orgId || workflow.id !== input.workflowId || !workflow.active) {
    return stopped('کار خودکار حذف یا متوقف شده است.');
  }
  if (workflow.revision !== input.revision) return stopped('تنظیمات این کار تغییر کرده است؛ اجرای نسخهٔ قبلی لغو شد.');
  if (!input.executionKey) throw new Error('کلید اجرای یکتای کار مشخص نیست.');

  const assertActor = (actor: AgentTaskActor | null): AgentTaskActor => {
    if (!actor || actor.orgId !== input.orgId || actor.userId !== workflow.creatorId || !actor.active || !actor.canRunTasks) {
      throw new Error('حساب، پلن یا مجوز جاری صاحب کار اجازهٔ اجرای خودکار را نمی‌دهد.');
    }
    return actor;
  };
  const actor = assertActor(await ports.loadActor(input.orgId, workflow.creatorId));
  const accessFingerprint = actor.accessFingerprint;
  const config = normalizeAgentTaskConfig(workflow.config, { agentKeys: actor.allowedAgentKeys, moduleIds: actor.allowedModuleIds });
  const assertChannels = (current: AgentTaskActor) => {
    if (config.deliveries.some(delivery => !current.allowedDeliveryChannels.includes(delivery.channel))) {
      throw new Error('مجوز جاری یکی از روش‌های دریافت نتیجه فعال نیست.');
    }
    if (!current.allowedAgentKeys.includes(config.agentKey) || config.sourceModuleIds.some(moduleId => !current.allowedModuleIds.includes(moduleId))) {
      throw new Error('دسترسی جاری ایجنت یا منابع این کار تغییر کرده است.');
    }
  };
  assertChannels(actor);
  if (input.eventRecordId && (!ports.canReadEvent || !await ports.canReadEvent(actor, config.sourceModuleIds[0], input.eventRecordId))) {
    return stopped('رکورد فعال‌کننده در محدودهٔ دسترسی جاری صاحب کار نیست.');
  }

  const sources: AgentTaskSource[] = [];
  // One total bound across sources, with truncation explicitly reported.
  let remaining = config.sourceLimit;
  for (const moduleId of config.sourceModuleIds) {
    if (!remaining) { sources.push({ moduleId, records: [], truncated: true }); continue; }
    const source = await ports.readSource(actor, moduleId, remaining);
    if (source.moduleId !== moduleId || !Array.isArray(source.records) || source.records.length > remaining) {
      throw new Error('پاسخ منبع بررسی با محدودهٔ مجاز کار هماهنگ نیست.');
    }
    remaining -= source.records.length;
    sources.push(source);
  }
  const result = await ports.generate({ actor, config, sources, eventRecordId: input.eventRecordId || null });
  if (typeof result.hasFindings !== 'boolean' || typeof result.answer !== 'string' || !result.answer.trim()) {
    throw new Error('نتیجهٔ بررسی ایجنت کامل و معتبر نیست؛ نتیجه‌ای ارسال نشد.');
  }
  const sourceCounts = sources.map(source => ({ moduleId: source.moduleId, count: source.records.length, truncated: source.truncated }));
  const partial = sources.some(source => source.truncated) && result.coverageComplete !== true;
  if (partial && !result.hasFindings) throw new Error('بررسی کامل داده‌ها تأیید نشد؛ نتیجهٔ ناقص به‌عنوان نبود مورد گزارش نمی‌شود.');
  if (config.notifyWhen === 'findings' && !result.hasFindings) {
    return { ...stopped('بررسی انجام شد؛ موردی مطابق شرط اطلاع‌رسانی پیدا نشد.'), sourceCounts };
  }
  const answer = (partial ? 'این نتیجه از بررسی بخشی از داده‌های مجاز به دست آمده است؛ بررسی همهٔ داده‌ها تأیید نشده است.\n\n' : '')
    + result.answer.trim().replace(/\b[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\b/gi, '[شناسهٔ داخلی]');
  const deliveries: AgentTaskDeliveryResult[] = [];
  for (const delivery of config.deliveries) {
    // Cancel/pause/permission revocation while a model was running must win.
    const current = await ports.loadWorkflow(input.orgId, input.workflowId);
    if (!current || current.orgId !== input.orgId || current.creatorId !== workflow.creatorId || !current.active || current.revision !== input.revision) {
      if (!deliveries.length) return stopped('کار پیش از ارسال نتیجه متوقف یا تغییر داده شد.');
      deliveries.push({ channel: delivery.channel, status: 'skipped', message: 'کار در حین ارسال متوقف یا تغییر داده شد.' });
      continue;
    }
    const liveActor = assertActor(await ports.loadActor(input.orgId, workflow.creatorId));
    assertChannels(liveActor);
    if (accessFingerprint !== liveActor.accessFingerprint) throw new Error('محدودهٔ دسترسی هنگام بررسی تغییر کرد؛ ارسال نتیجه لغو شد.');
    if (input.eventRecordId && (!ports.canReadEvent || !await ports.canReadEvent(liveActor, config.sourceModuleIds[0], input.eventRecordId))) {
      throw new Error('دسترسی به رکورد فعال‌کننده پیش از ارسال تغییر کرد؛ ارسال نتیجه لغو شد.');
    }
    try {
      deliveries.push({ ...(await ports.deliver(liveActor, delivery, { answer, workflow: current, config, executionKey: input.executionKey })), channel: delivery.channel });
    } catch {
      // Do not leak provider credentials/response bodies and do not silently
      // retry an external send whose outcome may be unknown.
      deliveries.push({ channel: delivery.channel, status: 'failed', message: 'ارسال این روش تأیید نشد؛ نتیجه نیازمند پیگیری است.' });
    }
  }
  const summary = summarizeAgentTaskDeliveries(deliveries);
  return { status: summary.status,
    message: summary.status === 'success' ? 'بررسی انجام شد و نتیجه از روش‌های تأییدشده ارسال شد.' : 'بررسی انجام شد؛ ارسال نتیجه در همهٔ روش‌های درخواستی تأیید نشد.',
    deliveries, sourceCounts };
};
