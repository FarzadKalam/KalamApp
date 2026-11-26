/** Shared by settings, telephone jobs and the customer agent dispatcher.
 * These are execution limits, never instructions that a model may override. */
export type CustomerChannelPolicy = {
  version: 1;
  instructionIds: string[];
  documentIds: string[];
  consultation: { enabled: boolean; agentKeys: string[]; maxCalls: number; timeoutMs: number; maxCostIrt: number };
  telephone: {
    enabled: boolean;
    accountId: string | null;
    triggers: Array<'workflow' | 'approved_request' | 'call_rule'>;
    maxDurationSeconds: number;
    maxCostIrt: number;
    dailyBudgetIrt: number;
    sensitiveAccess: 'dtmf_pin';
    mutations: 'human_approval';
  };
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const ids = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map(String).filter(v => uuid.test(v)))];
const bound = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, Math.floor(n)));
};
const triggers = ['workflow', 'approved_request', 'call_rule'] as const;

export function normalizeCustomerChannelPolicy(value: unknown, allowedAgentKeys: readonly string[]): CustomerChannelPolicy {
  const raw = object(value), consultation = object(raw.consultation), telephone = object(raw.telephone);
  return {
    version: 1,
    instructionIds: ids(raw.instructionIds),
    documentIds: ids(raw.documentIds),
    consultation: {
      enabled: consultation.enabled === true,
      agentKeys: [...new Set((Array.isArray(consultation.agentKeys) ? consultation.agentKeys : [])
        .map(String).filter(key => key !== 'customer_response' && allowedAgentKeys.includes(key)))],
      maxCalls: bound(consultation.maxCalls, 1, 0, 5),
      timeoutMs: bound(consultation.timeoutMs, 4000, 500, 15000),
      maxCostIrt: bound(consultation.maxCostIrt, 1000, 0, 100000),
    },
    telephone: {
      enabled: telephone.enabled === true,
      accountId: uuid.test(String(telephone.accountId || '')) ? telephone.accountId : null,
      triggers: [...new Set((Array.isArray(telephone.triggers) ? telephone.triggers : [])
        .filter((key: any): key is typeof triggers[number] => triggers.includes(key)))],
      maxDurationSeconds: bound(telephone.maxDurationSeconds, 180, 15, 1800),
      maxCostIrt: bound(telephone.maxCostIrt, 5000, 0, 1000000),
      dailyBudgetIrt: bound(telephone.dailyBudgetIrt, 30000, 0, 10000000),
      sensitiveAccess: 'dtmf_pin',
      mutations: 'human_approval',
    },
  };
}

export function assertCustomerChannelPolicyReferences(policy: CustomerChannelPolicy, accessible: {
  instructionIds: readonly string[]; documentIds: readonly string[]; accountIds: readonly string[]; agentKeys: readonly string[];
}) {
  if (policy.instructionIds.some(id => !accessible.instructionIds.includes(id))
    || policy.documentIds.some(id => !accessible.documentIds.includes(id))) {
    throw new Error('یکی از منابع انتخاب‌شده حذف شده یا مجوز استفاده از آن وجود ندارد.');
  }
  if (policy.telephone.accountId && !accessible.accountIds.includes(policy.telephone.accountId)) {
    throw new Error('حساب تلفن انتخاب‌شده فعال یا متعلق به این سازمان نیست.');
  }
  if (policy.consultation.agentKeys.some(key => !accessible.agentKeys.includes(key))) {
    throw new Error('مجوز یا پلن یکی از ایجنت‌های مشاور فعال نیست.');
  }
  if (policy.telephone.enabled && (!policy.telephone.accountId || !policy.telephone.triggers.length
    || !policy.telephone.maxCostIrt || !policy.telephone.dailyBudgetIrt)) {
    throw new Error('برای فعال‌سازی تلفن، حساب مستقل، مسیر اجرا و بودجهٔ مثبت تعیین کنید.');
  }
}

/** Deliberately no caller-controlled administrator role, tools or source list. */
export function assertCustomerTelephoneAdmission(input: {
  policy: CustomerChannelPolicy; orgId: string; routeOrgId: string;
  accountId: string; agentEnabled: boolean; planAllowed: boolean;
  trigger: string; approved: boolean; usedTodayIrt: number;
}) {
  const t = input.policy.telephone;
  if (!input.orgId || input.orgId !== input.routeOrgId || !input.agentEnabled || !input.planAllowed || !t.enabled
    || t.accountId !== input.accountId || !t.triggers.includes(input.trigger as any)) {
    throw new Error('این مسیر تماس برای ایجنت و سازمان مجاز نیست.');
  }
  if (!input.approved) throw new Error('درخواست تماس یا قانون اجرای آن تأیید نشده است.');
  if (!Number.isFinite(input.usedTodayIrt) || input.usedTodayIrt < 0
    || input.usedTodayIrt >= t.dailyBudgetIrt || t.maxCostIrt <= 0) throw new Error('بودجهٔ مجاز پاسخ‌گویی تلفنی کافی نیست.');
}

/** Reserve before dispatch, so concurrent calls cannot each spend the same budget. */
export function createCustomerConsultationGate(policy: CustomerChannelPolicy['consultation']) {
  let calls = 0, reservedIrt = 0;
  return {
    reserve(agentKey: string, costCeilingIrt: number) {
      if (!policy.enabled || !policy.agentKeys.includes(agentKey) || calls >= policy.maxCalls
        || !Number.isFinite(costCeilingIrt) || costCeilingIrt <= 0 || reservedIrt + costCeilingIrt > policy.maxCostIrt) {
        throw new Error('این مشورت خارج از مجوز یا بودجهٔ مکالمه است.');
      }
      calls += 1;
      reservedIrt += costCeilingIrt;
      return { timeoutMs: policy.timeoutMs, costCeilingIrt };
    },
    snapshot: () => ({ calls, reservedIrt }),
  };
}


