import {
  AI_AGENT_CATALOG,
  AI_AGENT_PLAN_FEATURE_PREFIX,
  getAiAgentPlanFeatureKey,
  RETURN_INVOICE_PARENT_MODULES,
  type AgentKey,
  type AgentToneStyle,
  type AiAgentDefinition,
} from './ai-agent-catalog.ts';
import { resolvePersianCalendarContext } from './persian-calendar-resolver.ts';

export type RestSelectParams = Record<string, string | number | boolean | null | undefined>;

const buildRestUrl = (supabaseUrl: string, table: string, params: RestSelectParams) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${table}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  });
  return url.toString();
};

export const sharedRestSelect = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  params: RestSelectParams,
): Promise<any[]> => {
  const response = await fetch(buildRestUrl(supabaseUrl, table, params), {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) return [];
  const parsed = await response.json().catch(() => []);
  return Array.isArray(parsed) ? parsed : [];
};

export const normalizeId = (value: unknown) => String(value ?? '').trim();

export const canViewModulePermission = (permissions: any, moduleId: string): boolean => {
  if (!permissions || typeof permissions !== 'object') return false;
  const canonical = RETURN_INVOICE_PARENT_MODULES[moduleId] || moduleId;
  const perm = permissions?.[moduleId] ?? permissions?.[canonical];
  if (!perm || typeof perm !== 'object') return false;
  return perm.view !== false;
};

export const isPlanModuleEnabled = (planContext: any, moduleId: string): boolean => {
  if (!planContext) return true;
  if (planContext.reason === 'saas_admin_organization') return true;
  if (planContext.available === false) return false;
  const canonical = RETURN_INVOICE_PARENT_MODULES[moduleId] || moduleId;
  const overrides = planContext.moduleOverrides && typeof planContext.moduleOverrides === 'object'
    ? planContext.moduleOverrides
    : {};
  const enabledModules = planContext.enabledModules && typeof planContext.enabledModules === 'object'
    ? planContext.enabledModules
    : {};

  const checkExplicit = (key: string): boolean | null => {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      return overrides[key] !== false;
    }
    if (Object.prototype.hasOwnProperty.call(enabledModules, key)) {
      return enabledModules[key] !== false;
    }
    return null;
  };

  const direct = checkExplicit(moduleId);
  if (direct !== null) return direct;
  const parent = checkExplicit(canonical);
  if (parent !== null) return parent;
  return planContext.strictModules !== true;
};

export const AI_AGENTS_PERMISSION_KEY = '__ai_agents';
export const AI_AGENTS_STAFF_BOT_PERMISSION_KEY = '__staff_bot';
export const getAiAgentPermissionFieldKey = (
  agentKey: AgentKey | string,
  action: 'view' | 'chat' | 'toggle' | 'edit',
) => `${String(agentKey || '').trim()}.${action}`;

export const isPlanFeatureEnabled = (planContext: any, featureKey: string): boolean => {
  if (!planContext) return false;
  if (planContext.reason === 'saas_admin_organization') return true;
  if (planContext.available === false) return false;
  const raw = planContext.features?.[featureKey];
  if (raw === true) return true;
  if (typeof raw === 'string') {
    const norm = raw.trim().toLowerCase();
    return norm === 'true' || norm === 'enabled' || norm === 'full' || norm === 'limited';
  }
  if (raw && typeof raw === 'object') return raw.enabled === true || raw.available === true;
  return false;
};

export const isAgentPlanAllowed = (planContext: any, agentDef: AiAgentDefinition): boolean => {
  if (!planContext) return true;
  if (planContext.reason === 'saas_admin_organization') return true;
  if (planContext.available === false) return false;

  const features = planContext.features && typeof planContext.features === 'object'
    ? planContext.features
    : {};
  const flagKey = getAiAgentPlanFeatureKey(agentDef.key);
  const hasExplicitAgentFlags = Object.keys(features).some((k) => k.startsWith(AI_AGENT_PLAN_FEATURE_PREFIX));
  if (Object.prototype.hasOwnProperty.call(features, flagKey)) {
    if (!isPlanFeatureEnabled(planContext, flagKey)) return false;
  } else if (hasExplicitAgentFlags) {
    return false;
  }

  const missingPlanModules = agentDef.primaryModules.filter((mod) => !isPlanModuleEnabled(planContext, mod));
  const requiredFeatures = Array.isArray(agentDef.requiredPlanFeatures) ? agentDef.requiredPlanFeatures : [];
  const featuresAllowed = requiredFeatures.every((featureKey) => isPlanFeatureEnabled(planContext, featureKey));
  return featuresAllowed && missingPlanModules.length < agentDef.primaryModules.length;
};

export const canViewModuleWithPlan = (planContext: any, permissions: any, moduleId: string): boolean =>
  isPlanModuleEnabled(planContext, moduleId) && canViewModulePermission(permissions, moduleId);

export type ResolvedAgentMemberState = {
  agentKey: AgentKey;
  definition: AiAgentDefinition;
  orgEnabled: boolean;
  canView: boolean;
  canChat: boolean;
  canToggle: boolean;
  canEdit: boolean;
  canUse: boolean;
  memberCanUse: boolean;
  staffBotEnabled: boolean;
  autonomyMode: 'confirm' | 'auto_low_risk';
  toneStyle: AgentToneStyle;
  planAllowed: boolean;
  rbacAllowed: boolean;
  missingModules: string[];
  config: Record<string, any> | null;
};

export const resolveAgentStatesForActor = (params: {
  agentConfigs: any[];
  memberPermissions: any[];
  planContext: any;
  permissions: any;
  userId?: string | null;
  roleId?: string | null;
  isOrgAdmin?: boolean;
}): Record<AgentKey, ResolvedAgentMemberState> => {
  const userId = normalizeId(params.userId);
  const roleId = normalizeId(params.roleId);
  const configByAgent = new Map<string, any>(
    (params.agentConfigs || []).map((row) => [String(row?.agent_key || '').trim(), row]),
  );

  const findPerm = (agentKey: string) => {
    const rows = (params.memberPermissions || []).filter((row) => String(row?.agent_key || '') === agentKey);
    const userRow = userId ? rows.find((row) => row.subject_type === 'user' && normalizeId(row.subject_id) === userId) : null;
    if (userRow) return userRow;
    const roleRow = roleId ? rows.find((row) => row.subject_type === 'role' && normalizeId(row.subject_id) === roleId) : null;
    if (roleRow) return roleRow;
    return null;
  };

  const aiPerm = (params.permissions && typeof params.permissions === 'object' ? params.permissions[AI_AGENTS_PERMISSION_KEY] : null) || {};
  const aiFields = aiPerm?.fields && typeof aiPerm.fields === 'object' ? aiPerm.fields : {};
  const sectionView = !params.permissions || aiPerm?.view !== false;
  const sectionEdit = aiPerm?.edit === true;
  const isOrgAdmin = Boolean(params.isOrgAdmin);

  const staffBotGlobalPerm = findPerm(AI_AGENTS_STAFF_BOT_PERMISSION_KEY);
  const staffBotPlanAllowed = isPlanFeatureEnabled(params.planContext, 'ai_staff_bot');
  const result = {} as Record<AgentKey, ResolvedAgentMemberState>;

  for (const agentDef of AI_AGENT_CATALOG) {
    const config = configByAgent.get(agentDef.key) || null;
    const orgEnabled = config ? config.is_enabled !== false : true;
    const permRow = findPerm(agentDef.key);

    const missingPlanModules = agentDef.primaryModules.filter((mod) => !isPlanModuleEnabled(params.planContext, mod));
    const missingRbacModules = params.permissions
      ? agentDef.primaryModules.filter((mod) => !canViewModulePermission(params.permissions, mod))
      : [];

    const hasAnyUsableModule = agentDef.key === 'lead_orchestrator'
      ? true
      : agentDef.primaryModules.some((mod) => canViewModuleWithPlan(params.planContext, params.permissions, mod));

    const planAllowed = isAgentPlanAllowed(params.planContext, agentDef);
    const roleAgentViewAllowed = sectionView && aiFields[getAiAgentPermissionFieldKey(agentDef.key, 'view')] !== false;
    const rbacAllowed = roleAgentViewAllowed && (!params.permissions || isOrgAdmin || hasAnyUsableModule);

    // Explicit member permission override takes precedence; otherwise allow when org, plan & RBAC permit
    const memberCanUse = permRow ? permRow.can_use !== false : true;

    const baseRoleCanToggle = isOrgAdmin
      ? aiFields[getAiAgentPermissionFieldKey(agentDef.key, 'toggle')] !== false
      : (sectionEdit || aiFields[getAiAgentPermissionFieldKey(agentDef.key, 'toggle')] === true);
    const baseRoleCanEdit = isOrgAdmin
      ? aiFields[getAiAgentPermissionFieldKey(agentDef.key, 'edit')] !== false
      : (sectionEdit || aiFields[getAiAgentPermissionFieldKey(agentDef.key, 'edit')] === true);
    const baseRoleCanChat = !params.permissions
      ? true
      : aiFields[getAiAgentPermissionFieldKey(agentDef.key, 'chat')] !== false;

    const eligibleActor = planAllowed && rbacAllowed && memberCanUse;
    const canToggle = eligibleActor && baseRoleCanToggle;
    const canEdit = eligibleActor && baseRoleCanEdit;
    // Disabled agents are completely hidden from users without toggle/edit rights
    const canView = eligibleActor && (orgEnabled || canToggle || canEdit);
    const canChat = canView && orgEnabled && baseRoleCanChat;
    const canUse = canView && canChat;

    const roleStaffBotAllowed = !params.permissions
      ? false
      : (isOrgAdmin
        ? aiFields[AI_AGENTS_STAFF_BOT_PERMISSION_KEY] !== false
        : (sectionEdit || aiFields[AI_AGENTS_STAFF_BOT_PERMISSION_KEY] === true));
    const staffBotEnabled = staffBotPlanAllowed && canChat && (
      permRow?.staff_bot_enabled === true
      || (permRow == null && (staffBotGlobalPerm?.staff_bot_enabled === true || roleStaffBotAllowed))
    );

    const toneCandidate = String(permRow?.tone_style || config?.tone_style || agentDef.defaultToneStyle).trim();
    const toneStyle: AgentToneStyle = (['formal', 'friendly_warm', 'concise', 'coaching', 'custom'] as const)
      .includes(toneCandidate as AgentToneStyle)
      ? (toneCandidate as AgentToneStyle)
      : agentDef.defaultToneStyle;

    const autonomyMode = permRow?.autonomy_mode === 'auto_low_risk' ? 'auto_low_risk' : 'confirm';

    result[agentDef.key] = {
      agentKey: agentDef.key,
      definition: agentDef,
      orgEnabled,
      canView,
      canChat,
      canToggle,
      canEdit,
      canUse,
      memberCanUse,
      staffBotEnabled,
      autonomyMode,
      toneStyle,
      planAllowed,
      rbacAllowed,
      missingModules: Array.from(new Set([...missingPlanModules, ...missingRbacModules])),
      config,
    };
  }

  return result;
};

export const canActorViewInstruction = (instruction: any, authContext: any): boolean => {
  const allowedUserIds = Array.isArray(instruction?.visible_to_user_ids)
    ? instruction.visible_to_user_ids.map(normalizeId).filter(Boolean)
    : [];
  const allowedRoleIds = Array.isArray(instruction?.visible_to_role_ids)
    ? instruction.visible_to_role_ids.map(normalizeId).filter(Boolean)
    : [];
  if (allowedUserIds.length === 0 && allowedRoleIds.length === 0) return true;
  const userId = normalizeId(authContext?.userId);
  const roleId = normalizeId(authContext?.roleId);
  return (Boolean(userId) && allowedUserIds.includes(userId))
    || (Boolean(roleId) && allowedRoleIds.includes(roleId));
};

export const isWithinOrgWorkSchedule = (
  workSchedules: any[] = [],
  now: Date = new Date(),
  calendarDayInfo?: { is_friday?: boolean; is_official_holiday?: boolean } | null,
): { withinSchedule: boolean; reasonFa: string } => {
  if (calendarDayInfo?.is_official_holiday) {
    return { withinSchedule: false, reasonFa: 'امروز تعطیل رسمی است.' };
  }
  const activeSchedules = (workSchedules || []).filter((item) => item?.is_active !== false);
  if (!activeSchedules.length) {
    if (calendarDayInfo?.is_friday) {
      return { withinSchedule: false, reasonFa: 'امروز جمعه و خارج از روز کاری پیش‌فرض است.' };
    }
    return { withinSchedule: true, reasonFa: 'برنامه کاری مشخص ثبت نشده؛ بازه کاری پیش‌فرض باز است.' };
  }

  const tehranParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const readPart = (type: string) => tehranParts.find((part) => part.type === type)?.value || '';
  const weekdayShort = readPart('weekday').toLowerCase();
  const currentMinutes = (Number(readPart('hour') || 0) * 60) + Number(readPart('minute') || 0);

  const dayAliases: Record<string, string[]> = {
    sat: ['sat', 'saturday', 'شنبه', '0'],
    sun: ['sun', 'sunday', 'یکشنبه', '1'],
    mon: ['mon', 'monday', 'دوشنبه', '2'],
    tue: ['tue', 'tuesday', 'سه‌شنبه', 'سه شنبه', '3'],
    wed: ['wed', 'wednesday', 'چهارشنبه', '4'],
    thu: ['thu', 'thursday', 'پنجشنبه', 'پنج‌شنبه', '5'],
    fri: ['fri', 'friday', 'جمعه', '6'],
  };
  const currentAliases = new Set(dayAliases[weekdayShort] || [weekdayShort]);

  const toMinutes = (rawTime: unknown): number | null => {
    const match = String(rawTime || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };

  for (const schedule of activeSchedules) {
    const weeklyDays = Array.isArray(schedule?.working_days)
      ? schedule.working_days
      : Array.isArray(schedule?.days)
      ? schedule.days
      : null;

    if (weeklyDays && weeklyDays.length > 0) {
      const normalizedDays = weeklyDays.map((d: unknown) => String(d || '').trim().toLowerCase());
      const matchesDay = normalizedDays.some((d: string) => currentAliases.has(d));
      if (!matchesDay) continue;
    } else if (weekdayShort === 'fri') {
      continue;
    }

    const startMin = toMinutes(schedule?.start_time ?? schedule?.work_start ?? '08:30');
    const endMin = toMinutes(schedule?.end_time ?? schedule?.work_end ?? '17:30');
    if (startMin !== null && endMin !== null) {
      if (currentMinutes >= startMin && currentMinutes <= endMin) {
        return { withinSchedule: true, reasonFa: 'در ساعت کاری سازمان است.' };
      }
      continue;
    }
    return { withinSchedule: true, reasonFa: 'در روز کاری سازمان است.' };
  }

  return { withinSchedule: false, reasonFa: 'خارج از ساعت یا روز کاری ثبت‌شده سازمان است.' };
};

export type CentralAiGrounding = {
  orgId: string;
  freeChatMode: boolean;
  company: Record<string, any> | null;
  reservationSettings: Record<string, any> | null;
  workSchedules: any[];
  instructions: any[];
  jobDescriptions: any[];
  orgDirectory: {
    roles: Array<{ id: string; title: string; parent_id: string | null }>;
    members: Array<{ id: string; full_name: string; role_id: string | null; job_title: string | null }>;
    actorRolePath: any[];
    subordinateRoles: any[];
  };
  agentConfigs: any[];
  memberPermissions: any[];
  agentStates: Record<AgentKey, ResolvedAgentMemberState>;
  planContext: any;
  calendarContext: Awaited<ReturnType<typeof resolvePersianCalendarContext>> | null;
};

export const loadCentralAiGrounding = async (params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  authContext: any;
  planContext: any;
  message?: string;
  freeChatMode?: boolean;
  includeCalendar?: boolean;
}): Promise<CentralAiGrounding> => {
  const orgId = normalizeId(params.authContext?.orgId);
  const freeChatMode = params.freeChatMode === true;

  const [agentConfigs, memberPermissions] = orgId
    ? await Promise.all([
        sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'org_ai_agent_configs', {
          org_id: `eq.${orgId}`,
          select: 'id,agent_key,is_enabled,model_override,fast_model_override,tone_style,allowed_channels,background_config,policy_json,onboarding_completed_at,background_last_run_at,background_last_status,background_last_summary,background_last_error',
          limit: 20,
        }),
        sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'org_ai_agent_member_permissions', {
          org_id: `eq.${orgId}`,
          select: 'id,subject_type,subject_id,agent_key,can_use,staff_bot_enabled,autonomy_mode,tone_style',
          limit: 500,
        }),
      ])
    : [[], []];

  const perms = params.authContext?.permissions;
  const settingsPerm = perms?.__settings_tabs || {};
  const settingsFields = settingsPerm?.fields || {};
  const isOrgAdmin = !perms || typeof perms !== 'object'
    ? true
    : settingsPerm?.view !== false
      && settingsPerm?.edit === true
      && settingsFields?.ai !== false
      && settingsFields?.ai_settings !== false;

  const agentStates = resolveAgentStatesForActor({
    agentConfigs,
    memberPermissions,
    planContext: params.planContext,
    permissions: perms,
    userId: params.authContext?.userId,
    roleId: params.authContext?.roleId,
    isOrgAdmin,
  });

  if (freeChatMode || !orgId) {
    return {
      orgId,
      freeChatMode,
      company: null,
      reservationSettings: null,
      workSchedules: [],
      instructions: [],
      jobDescriptions: [],
      orgDirectory: {
        roles: [],
        members: [],
        actorRolePath: params.authContext?.rolePath || [],
        subordinateRoles: params.authContext?.subordinateRoles || [],
      },
      agentConfigs,
      memberPermissions,
      agentStates,
      planContext: params.planContext,
      calendarContext: null,
    };
  }

  const canReadInstructions = canViewModulePermission(params.authContext?.permissions, 'instructions');
  const canReadJobs = canViewModulePermission(params.authContext?.permissions, 'job_descriptions');

  const [
    companyRows,
    workSchedules,
    instructionRows,
    jobDescriptionRows,
    roleRows,
    memberRows,
    calendarContext,
  ] = await Promise.all([
    sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'company_settings', {
      org_id: `eq.${orgId}`,
      select: 'company_name,company_title,currency_code,currency_label,reservation_settings,working_hours,address,phone',
      limit: 1,
    }),
    sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'work_schedules', {
      org_id: `eq.${orgId}`,
      select: 'id,name,title,working_days,start_time,end_time,is_active,notes',
      limit: 20,
    }),
    canReadInstructions
      ? sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'instructions', {
          org_id: `eq.${orgId}`,
          select: 'id,name,title,category,status,module_ids,visible_to_user_ids,visible_to_role_ids,summary,content',
          order: 'updated_at.desc',
          limit: 40,
        })
      : Promise.resolve([]),
    canReadJobs
      ? sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'job_descriptions', {
          org_id: `eq.${orgId}`,
          select: 'id,name,system_code,role_id,job_goal,job_responsibilities,job_duties,job_requirements',
          order: 'updated_at.desc',
          limit: 40,
        })
      : Promise.resolve([]),
    sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'org_roles', {
      org_id: `eq.${orgId}`,
      select: 'id,title,parent_id',
      order: 'title.asc',
      limit: 200,
    }),
    sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'profiles', {
      org_id: `eq.${orgId}`,
      is_active: 'eq.true',
      select: 'id,full_name,role_id,job_title,position',
      order: 'full_name.asc',
      limit: 200,
    }),
    params.includeCalendar === false
      ? Promise.resolve(null)
      : resolvePersianCalendarContext(String(params.message || '')),
  ]);

  const company = companyRows[0] || null;
  const instructions = (instructionRows || [])
    .filter((row) => canActorViewInstruction(row, params.authContext))
    .slice(0, 20)
    .map((row) => ({
      name: row.name || row.title || 'دستورالعمل',
      category: row.category || null,
      module_ids: Array.isArray(row.module_ids) ? row.module_ids : [],
      summary: String(row.summary || row.content || '').slice(0, 600),
    }));

  const jobDescriptions = (jobDescriptionRows || []).slice(0, 20).map((row) => ({
    name: row.name || 'شرح شغل',
    system_code: row.system_code || null,
    role_id: row.role_id || null,
    goal: String(row.job_goal || '').slice(0, 300),
    responsibilities: String(row.job_responsibilities || '').slice(0, 500),
    duties: String(row.job_duties || '').slice(0, 400),
  }));

  return {
    orgId,
    freeChatMode: false,
    company,
    reservationSettings: company?.reservation_settings && typeof company.reservation_settings === 'object'
      ? company.reservation_settings
      : null,
    workSchedules,
    instructions,
    jobDescriptions,
    orgDirectory: {
      roles: roleRows.map((r) => ({ id: String(r.id), title: String(r.title || ''), parent_id: r.parent_id ? String(r.parent_id) : null })),
      members: memberRows.map((m) => ({
        id: String(m.id),
        full_name: String(m.full_name || ''),
        role_id: m.role_id ? String(m.role_id) : null,
        job_title: m.job_title || m.position || null,
      })),
      actorRolePath: params.authContext?.rolePath || [],
      subordinateRoles: params.authContext?.subordinateRoles || [],
    },
    agentConfigs,
    memberPermissions,
    agentStates,
    planContext: params.planContext,
    calendarContext,
  };
};
