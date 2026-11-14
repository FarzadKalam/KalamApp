import { normalizeAgentTaskConfig, nextAgentTaskRunAt, type AgentTaskConfig } from './ai-agent-task-contract.ts';

export type AgentTaskChange = {
  operation: 'create' | 'update' | 'pause' | 'resume'; name: string;
  workflowId: string | null; expectedRevision: number | null; config: AgentTaskConfig;
};
export type ManagedAgentTask = { id: string; orgId: string; creatorId: string; name: string;
  revision: number; active: boolean; config: AgentTaskConfig };
export type AgentTaskManagementAccess = { orgId: string; userId: string; canManage: boolean;
  agentKeys: string[]; moduleIds: string[]; deliveryChannels: string[]; threadId: string };
const fail = (message: string): never => { throw new Error(message); };

/** The model suggests a draft; ownership, revision and scope come from the server. */
export const prepareAgentTaskChange = (input: any, access: AgentTaskManagementAccess,
  existing: ManagedAgentTask | null, now = new Date()): AgentTaskChange => {
  if (!access.canManage || !access.orgId || !access.userId) return fail('پلن یا مجوز مدیریت کار خودکار فعال نیست.');
  const operation = input?.operation;
  if (!['create', 'update', 'pause', 'resume'].includes(operation)) return fail('نوع تغییر کار خودکار معتبر نیست.');
  if (operation !== 'create' && (!existing || existing.orgId !== access.orgId || existing.creatorId !== access.userId)) {
    return fail('کار خودکار در محدودهٔ مدیریت شما پیدا نشد.');
  }
  if (operation === 'create' && input.workflowId) return fail('ساخت کار تازه نمی‌تواند مقصد ویرایش داشته باشد.');
  if (existing && Number(input.expectedRevision) !== existing.revision) return fail('این کار تغییر کرده است؛ پیش‌نویس تازه را بررسی کنید.');
  const name = String(input.name ?? existing?.name ?? '').trim();
  if (!name || name.length > 160) return fail('عنوان کار باید روشن و حداکثر ۱۶۰ نویسه باشد.');
  const config = normalizeAgentTaskConfig(operation === 'pause' || operation === 'resume' ? existing?.config
    : { ...input.config, threadId: access.threadId }, { agentKeys: access.agentKeys, moduleIds: access.moduleIds });
  if (config.deliveries.some(item => !access.deliveryChannels.includes(item.channel))) return fail('روش دریافت نتیجه در دسترس شما نیست.');
  if (config.trigger !== 'interval' && config.sourceModuleIds.length !== 1) return fail('کار رویدادی باید دقیقاً یک ماژول فعال‌کننده داشته باشد.');
  if (config.deliveries.some(item => item.channel === 'chat') && !config.threadId) return fail('گفتگوی خصوصی دریافت نتیجه مشخص نیست.');
  if (operation !== 'pause' && config.schedule && !nextAgentTaskRunAt(config.schedule, now)) return fail('زمان یک‌بارهٔ اجرا گذشته است؛ زمان آینده را مشخص کنید.');
  return { operation, name, config, workflowId: existing?.id || null, expectedRevision: existing?.revision ?? null };
};

export type AgentTaskManagementPorts = {
  load: (orgId: string, workflowId: string) => Promise<ManagedAgentTask | null>;
  findCreated: (orgId: string, actionId: string) => Promise<Record<string, any> | null>;
  // Must atomically claim proposed -> confirmed. A concurrent confirmation loses.
  claim: (orgId: string, userId: string, actionId: string, approvedChange: AgentTaskChange) => Promise<boolean>;
  insert: (row: Record<string, unknown>) => Promise<Record<string, any> | null>;
  update: (orgId: string, userId: string, workflowId: string, expectedRevision: number, row: Record<string, unknown>) => Promise<Record<string, any> | null>;
  finish: (orgId: string, actionId: string, success: boolean, result: Record<string, unknown>) => Promise<void>;
};

/** Confirmation is the only write boundary, shared by chat and task management. */
export const confirmAgentTaskChange = async (ports: AgentTaskManagementPorts, input: {
  actionId: string; change: AgentTaskChange; access: AgentTaskManagementAccess; now?: Date;
}) => {
  const { actionId, access } = input;
  const now = input.now || new Date();
  const existing = input.change.workflowId ? await ports.load(access.orgId, input.change.workflowId) : null;
  const change = prepareAgentTaskChange(input.change, access, existing, now);
  if (!await ports.claim(access.orgId, access.userId, actionId, change)) return fail('این تأیید قبلاً پردازش شده است؛ وضعیت کار را تازه کنید.');
  try {
    const revision = (existing?.revision || 0) + 1;
    const active = change.operation !== 'pause';
    const patch = { name: change.name, agent_key: change.config.agentKey,
      module_id: change.config.sourceModuleIds[0], module_ids: change.config.sourceModuleIds,
      trigger_type: change.config.trigger, scope_type: 'standard', execution_mode: 'every_match',
      agent_task_config: change.config, agent_task_revision: revision,
      agent_task_next_run_at: active && change.config.schedule ? nextAgentTaskRunAt(change.config.schedule, now) : null,
      interval_value: change.config.trigger === 'interval' ? 1 : null,
      interval_unit: change.config.trigger === 'interval' ? 'day' : null,
      conditions_all: [], conditions_any: [],
      actions: [{ id: `agent-task-${revision}`, type: 'run_agent_task', config: { revision } }],
      is_active: active, updated_at: now.toISOString() };
    // Origin is unique per organization, even if a transport result was lost.
    const alreadyCreated = change.operation === 'create' ? await ports.findCreated(access.orgId, actionId) : null;
    const row = alreadyCreated || (existing ? await ports.update(access.orgId, access.userId, existing.id, existing.revision, patch)
      : await ports.insert({ ...patch, org_id: access.orgId, created_by: access.userId, agent_task_origin_action_id: actionId }));
    if (!row) return fail('ثبت کار تأیید نشد؛ ممکن است نسخه یا دسترسی آن تغییر کرده باشد.');
    const result = { workflowId: row.id, name: change.name, operation: change.operation,
      nextRunAt: row.agent_task_next_run_at ?? patch.agent_task_next_run_at, active };
    await ports.finish(access.orgId, actionId, true, result);
    return { success: true, message: change.operation === 'pause' ? 'کار خودکار متوقف شد.' : 'کار خودکار ثبت شد و مطابق برنامه اجرا می‌شود.', ...result };
  } catch (error) {
    await ports.finish(access.orgId, actionId, false, { error: 'task_change_not_confirmed' });
    throw error;
  }
};

export const AGENT_TASK_CONVERSATION_PROMPT = `درخواست کار مداوم یا زمان‌دار، ساخت گردش کار واقعی است. اجرای فعلی یا ثبت کار را پیش از تأیید ادعا نکن.
با list_agent_tasks کارهای متعلق به همین کاربر را پیدا کن؛ عنوان مشابه بدون درخواست صریح به معنی جایگزینی نیست. برای ویرایش، توقف و ادامه از شناسه و expectedRevision همان ابزار استفاده کن و شناسهٔ خام را به کاربر نشان نده.
وقتی دستور، زمان/رویداد، منابع و گیرنده روشن بود با prepare_agent_task فقط پیش‌نویس آماده کن. نتیجهٔ ابزار شامل کارت تأیید است؛ آن را دوباره با جدول یا JSON به کاربر نشان نده. فقط بگو کارت آمادهٔ بررسی است.
برای ابهام واقعی از قرارداد سؤال‌های پویا استفاده کن. اگر کاربر گفت به خودم، شماره یا ایمیل تأییدشدهٔ پروفایل در اطلاعات ابزار را استفاده کن؛ دادهٔ ناشناخته نساز. منطقهٔ زمانی را صریح در کارت درج کن. برای یک رویداد on_create یا on_upsert فقط همان ماژول فعال‌کننده را مشخص کن.
config: {version:1,agentKey,instruction,trigger:interval|on_create|on_upsert,schedule,sourceModuleIds,sourceLimit:100,notifyWhen:always|findings,deliveries:[{channel:chat}|{channel:sms,numbers:[...]}|{channel:email,addresses:[...],subject:...}]}.
schedule برای interval: {kind:daily,at:HH:mm,timeZone:Asia/Tehran} یا weekly با weekdays صفر=یکشنبه تا شش=شنبه، monthly با day و calendar:persian برای ماه شمسی یا calendar:gregory برای ماه میلادی، interval با minutes حداقل۵، once با at تاریخ ISO دارای offset. برای رویداد schedule=null.
درخواست prepare_agent_task: {operation:create|update|pause|resume,name,workflowId:null|string,expectedRevision:null|number,config}.`;

export const AGENT_TASK_TOOLS = [
  { type: 'function', function: { name: 'list_agent_tasks', description: 'کارهای خودکار متعلق به کاربر جاری و راه ادامهٔ فهرست؛ با afterId صفحهٔ بعد را بخوان.', parameters: { type: 'object', properties: { afterId: { type: 'string' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_agent_task', description: 'خواندن دستور کامل، برنامه و آخرین نتایج اجرای یک کار متعلق به کاربر جاری، برای اصلاح یا پیگیری.', parameters: { type: 'object', properties: { workflowId: { type: 'string' } }, required: ['workflowId'], additionalProperties: false } } },
  { type: 'function', function: { name: 'prepare_agent_task', description: 'آماده‌کردن کارت تأیید ساخت، ویرایش، توقف یا ادامهٔ کار خودکار؛ این ابزار کار را ثبت یا فعال نمی‌کند.', parameters: { type: 'object', properties: {
    operation: { type: 'string', enum: ['create','update','pause','resume'] }, name: { type: 'string' },
    workflowId: { type: ['string','null'] }, expectedRevision: { type: ['integer','null'] }, config: { type: 'object', additionalProperties: true },
  }, required: ['operation'], additionalProperties: false } } },
];
