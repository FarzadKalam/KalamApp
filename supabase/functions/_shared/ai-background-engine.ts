// @ts-nocheck
import { loadOrgPlanAccess } from './org-plan-access.ts';
import { getAgentDefinition, getAgentTitleFa, type AgentKey } from './ai-agent-catalog.ts';
import { formatAiAmountForOrg } from './ai-billing.ts';
import {
  isPlanFeatureEnabled,
  isWithinOrgWorkSchedule,
  resolveAgentStatesForActor,
  sharedRestSelect,
} from './ai-grounding.ts';
import { relayAgentMessageToStaff } from './ai-staff-relay.ts';

export type BackgroundFinding = {
  agentKey: AgentKey;
  cooldownKey: string;
  cooldownMinutes: number;
  titleFa: string;
  messageFa: string;
  moduleId?: string | null;
  recordId?: string | null;
  recipientUserIds: string[];
  requiredModuleForRecipient?: string | null;
};

export type BackgroundTickResult = {
  processedOrgs: number;
  runsTriggered: number;
  findingsEvaluated: number;
  notificationsDispatched: number;
  skippedReasons: string[];
};

const sharedRestMutate = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  path: string,
  method: 'POST' | 'PATCH',
  body: any,
) => {
  const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `REST ${method} ${path} failed (${res.status})`);
  }
};

const getTehranDayStartIso = (now: Date): string => {
  const tehranDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(now);
  return new Date(`${tehranDate}T00:00:00+03:30`).toISOString();
};

const hasUnreadCooldown = (cooldowns: any[], agentKey: AgentKey, cooldownKey: string): boolean => {
  const row = (cooldowns || []).find(
    (c) => String(c?.agent_key || '') === agentKey && String(c?.cooldown_key || '') === cooldownKey,
  );
  if (!row?.next_eligible_at) return false;
  const ts = Date.parse(String(row.next_eligible_at));
  return Number.isFinite(ts) && ts > Date.now();
};

export const collectSqlFirstFindingsForAgent = async (params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  orgId: string;
  agentKey: AgentKey;
  defaultRecipientIds: string[];
  now?: Date;
}): Promise<BackgroundFinding[]> => {
  const now = params.now || new Date();
  const findings: BackgroundFinding[] = [];
  const defaultRecipients = params.defaultRecipientIds.filter(Boolean);

  if (params.agentKey === 'sales_leads') {
    const staleBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [openInvoices, staleLeads] = await Promise.all([
      sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'invoices', {
        org_id: `eq.${params.orgId}`,
        remaining_balance: 'gt.0',
        select: 'id,name,system_code,remaining_balance,assignee_id',
        order: 'updated_at.desc',
        limit: 5,
      }),
      sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'marketing_leads', {
        org_id: `eq.${params.orgId}`,
        updated_at: `lt.${staleBefore}`,
        status: 'not.in.(converted,lost,closed)',
        select: 'id,name,full_name,system_code,assignee_id',
        order: 'updated_at.asc',
        limit: 5,
      }),
    ]);

    for (const inv of openInvoices) {
      const recipients = inv.assignee_id ? [String(inv.assignee_id)] : defaultRecipients;
      if (!recipients.length) continue;
      findings.push({
        agentKey: 'sales_leads',
        cooldownKey: `invoice_balance:${inv.id}`,
        cooldownMinutes: 720,
        titleFa: 'پیگیری مانده فاکتور',
        messageFa: `یادآوری ایجنت فروش: فاکتور «${inv.name || inv.system_code || 'فروش'}» (${inv.system_code || 'بدون کد'}) همچنان مانده تسویه‌نشده دارد.`,
        moduleId: 'invoices',
        recordId: String(inv.id),
        recipientUserIds: recipients,
        requiredModuleForRecipient: 'invoices',
      });
    }

    for (const lead of staleLeads) {
      const recipients = lead.assignee_id ? [String(lead.assignee_id)] : defaultRecipients;
      if (!recipients.length) continue;
      findings.push({
        agentKey: 'sales_leads',
        cooldownKey: `stale_lead:${lead.id}`,
        cooldownMinutes: 480,
        titleFa: 'پیگیری سرنخ بدون اقدام',
        messageFa: `ایجنت فروش و لید: سرنخ «${lead.full_name || lead.name || lead.system_code || 'جدید'}» بیش از ۲۴ ساعت است پیگیری جدیدی نداشته است.`,
        moduleId: 'marketing_leads',
        recordId: String(lead.id),
        recipientUserIds: recipients,
        requiredModuleForRecipient: 'marketing_leads',
      });
    }
  } else if (params.agentKey === 'purchase_supply') {
    const products = await sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'products', {
      org_id: `eq.${params.orgId}`,
      select: 'id,name,system_code,stock,reorder_point',
      order: 'stock.asc',
      limit: 12,
    });
    const lowStock = (products || []).filter((p: any) => {
      const stock = Number(p?.stock ?? 0);
      const reorder = Number(p?.reorder_point ?? 3);
      return Number.isFinite(stock) && Number.isFinite(reorder) && stock <= reorder;
    }).slice(0, 4);

    if (lowStock.length && defaultRecipients.length) {
      const summaryNames = lowStock.map((p: any) => `${p.name || p.system_code} (موجودی: ${Number(p.stock ?? 0).toLocaleString('fa-IR')})`).join('، ');
      findings.push({
        agentKey: 'purchase_supply',
        cooldownKey: `low_stock_batch:${lowStock.map((p: any) => p.id).sort().join(',').slice(0, 80)}`,
        cooldownMinutes: 720,
        titleFa: 'هشدار کسری موجودی کالا',
        messageFa: `ایجنت خرید و تأمین: کالاهای زیر به نقطه سفارش رسیده‌اند و نیاز به بررسی تأمین دارند:\n${summaryNames}`,
        moduleId: 'products',
        recordId: String(lowStock[0].id),
        recipientUserIds: defaultRecipients,
        requiredModuleForRecipient: 'purchase_invoices',
      });
    }
  } else if (params.agentKey === 'hr_manager') {
    const staleLeaveBefore = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const pendingLeaves = await sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'leave_requests', {
      org_id: `eq.${params.orgId}`,
      status: 'in.(pending,draft,submitted)',
      created_at: `lt.${staleLeaveBefore}`,
      select: 'id,title,system_code,employee_id,approver_id',
      limit: 5,
    });
    for (const req of pendingLeaves) {
      const recipients = req.approver_id ? [String(req.approver_id)] : defaultRecipients;
      if (!recipients.length) continue;
      findings.push({
        agentKey: 'hr_manager',
        cooldownKey: `pending_leave:${req.id}`,
        cooldownMinutes: 720,
        titleFa: 'پیگیری درخواست مرخصی در انتظار تایید',
        messageFa: `ایجنت منابع انسانی: درخواست مرخصی «${req.title || req.system_code || 'پرسنل'}» بیش از ۱۲ ساعت در انتظار بررسی است.`,
        moduleId: 'leave_requests',
        recordId: String(req.id),
        recipientUserIds: recipients,
        requiredModuleForRecipient: 'leave_requests',
      });
    }
  } else if (params.agentKey === 'reservation') {
    const inNext24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const upcoming = await sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'reservations', {
      org_id: `eq.${params.orgId}`,
      status: 'in.(confirmed,pending)',
      start_at: `gte.${now.toISOString()}`,
      select: 'id,title,system_code,start_at,assignee_id',
      order: 'start_at.asc',
      limit: 6,
    });
    const dueSoon = (upcoming || []).filter((r: any) => String(r?.start_at || '') <= inNext24h);
    for (const resv of dueSoon) {
      const recipients = resv.assignee_id ? [String(resv.assignee_id)] : defaultRecipients;
      if (!recipients.length) continue;
      findings.push({
        agentKey: 'reservation',
        cooldownKey: `reservation_soon:${resv.id}`,
        cooldownMinutes: 720,
        titleFa: 'یادآوری رزرو پیش‌رو',
        messageFa: `ایجنت رزرواسیون: نوبت/رزرو «${resv.title || resv.system_code || 'جدید'}» کمتر از ۲۴ ساعت دیگر آغاز می‌شود؛ آماده‌سازی منبع را بررسی کنید.`,
        moduleId: 'reservations',
        recordId: String(resv.id),
        recipientUserIds: recipients,
        requiredModuleForRecipient: 'reservations',
      });
    }
  } else if (params.agentKey === 'project_process') {
    const overdueTasks = await sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'tasks', {
      org_id: `eq.${params.orgId}`,
      due_date: `lt.${now.toISOString()}`,
      status: 'not.in.(done,completed,cancelled)',
      select: 'id,name,system_code,assignee_id,assignee_type',
      order: 'due_date.asc',
      limit: 5,
    });
    for (const task of overdueTasks) {
      const recipients = task.assignee_type === 'user' && task.assignee_id ? [String(task.assignee_id)] : defaultRecipients;
      if (!recipients.length) continue;
      findings.push({
        agentKey: 'project_process',
        cooldownKey: `overdue_task:${task.id}`,
        cooldownMinutes: 480,
        titleFa: 'فعالیت دارای تأخیر',
        messageFa: `ایجنت پروژه و فرآیند: فعالیت «${task.name || task.system_code || 'بدون عنوان'}» از سررسید گذشته و هنوز تکمیل نشده است.`,
        moduleId: 'tasks',
        recordId: String(task.id),
        recipientUserIds: recipients,
        requiredModuleForRecipient: 'tasks',
      });
    }
  } else if (params.agentKey === 'customer_response') {
    const staleBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const recentInbound = await sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'counterparty_bot_direct_messages', {
      org_id: `eq.${params.orgId}`,
      direction: 'eq.inbound',
      created_at: `lt.${staleBefore}`,
      select: 'id,channel_type,message_text,customer_id',
      order: 'created_at.desc',
      limit: 4,
    });
    if (recentInbound.length && defaultRecipients.length) {
      findings.push({
        agentKey: 'customer_response',
        cooldownKey: `bot_inbound_review:${recentInbound[0].id}`,
        cooldownMinutes: 360,
        titleFa: 'مرور پیام‌های مشتریان در بات',
        messageFa: `ایجنت پاسخگویی مشتری: ${recentInbound.length} پیام اخیر مشتری در بات‌ها ثبت شده که ممکن است نیاز به پیگیری یا پاسخ تکمیلی همکار داشته باشد.`,
        moduleId: 'customers',
        recordId: recentInbound[0].customer_id ? String(recentInbound[0].customer_id) : null,
        recipientUserIds: defaultRecipients,
        requiredModuleForRecipient: 'customers',
      });
    }
  } else if (params.agentKey === 'instagrammer') {
    const newComments = await sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'instagram_comments', {
      org_id: `eq.${params.orgId}`,
      status: 'in.(new,open)',
      select: 'id,author_username,content_text,assignee_user_id',
      order: 'commented_at.desc',
      limit: 6,
    });
    if (newComments.length && defaultRecipients.length) {
      const sample = newComments.slice(0, 2).map((c: any) => `@${c.author_username || 'کاربر'}: «${String(c.content_text || '').slice(0, 60)}»`).join(' | ');
      const recipients = newComments[0]?.assignee_user_id ? [String(newComments[0].assignee_user_id)] : defaultRecipients;
      findings.push({
        agentKey: 'instagrammer',
        cooldownKey: `ig_unreplied_comments:${newComments[0].id}`,
        cooldownMinutes: 180,
        titleFa: 'کامنت‌های جدید در انتظار پاسخ اینستاگرام',
        messageFa: `ایجنت اینستاگرامر: ${newComments.length} کامنت پاسخ‌داده‌نشده در اینستاگرام دارید (${sample}). برای طراحی پاسخ خودکار یا ارسال ویترین می‌توانید اقدام کنید.`,
        moduleId: 'instagram_conversations',
        recordId: null,
        recipientUserIds: recipients,
        requiredModuleForRecipient: 'instagram_conversations',
      });
    }
  }

  return findings;
};

export const runAiBackgroundAgentsTick = async (params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  orgId?: string | null;
  agentKey?: AgentKey | null;
  force?: boolean;
  maxOrgs?: number;
  now?: Date;
}): Promise<BackgroundTickResult> => {
  const now = params.now || new Date();
  const nowIso = now.toISOString();
  const forceRun = params.force === true;
  const scopedOrgId = String(params.orgId || '').trim();
  const scopedAgentKey = String(params.agentKey || '').trim() as AgentKey | '';

  const configs = await sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'org_ai_agent_configs', {
    ...(scopedOrgId ? { org_id: `eq.${scopedOrgId}` } : {}),
    ...(scopedAgentKey ? { agent_key: `eq.${scopedAgentKey}` } : {}),
    is_enabled: 'eq.true',
    select: 'org_id,agent_key,is_enabled,background_config,background_last_run_at',
    limit: 250,
  });

  const activeBackgroundConfigs = (configs || []).filter((cfg: any) => {
    const def = getAgentDefinition(cfg?.agent_key);
    if (!def || def.supportsBackground === false) return false;
    if (forceRun && scopedOrgId) return true;
    return cfg?.background_config?.enabled === true;
  });

  if (!activeBackgroundConfigs.length) {
    return {
      processedOrgs: 0,
      runsTriggered: 0,
      findingsEvaluated: 0,
      notificationsDispatched: 0,
      skippedReasons: forceRun && scopedOrgId
        ? ['هیچ ایجنت فعالی با قابلیت اجرای پس‌زمینه برای این سازمان پیدا نشد.']
        : [],
    };
  }

  const configsByOrg = new Map<string, any[]>();
  for (const cfg of activeBackgroundConfigs) {
    const orgId = String(cfg.org_id || '').trim();
    if (!orgId) continue;
    const list = configsByOrg.get(orgId) || [];
    list.push(cfg);
    configsByOrg.set(orgId, list);
  }

  const orgIds = Array.from(configsByOrg.keys()).slice(0, Math.max(1, Number(params.maxOrgs || 15)));
  const tehranDayStartIso = getTehranDayStartIso(now);
  let runsTriggered = 0;
  let findingsEvaluated = 0;
  let notificationsDispatched = 0;
  const skippedReasons: string[] = [];

  for (const orgId of orgIds) {
    const orgConfigs = configsByOrg.get(orgId) || [];
    const [orgSettingsRows, companyRows, workSchedules, profiles, orgRoles, memberPerms, cooldowns, todayLedgerRows] = await Promise.all([
      sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'saas_org_settings', {
        org_id: `eq.${orgId}`,
        select: 'org_id,plan_code,module_overrides,feature_overrides,status,is_readonly',
        limit: 1,
      }),
      sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'company_settings', {
        org_id: `eq.${orgId}`,
        select: 'currency_code,currency_label',
        limit: 1,
      }),
      sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'work_schedules', {
        org_id: `eq.${orgId}`,
        select: 'id,working_days,start_time,end_time,is_active',
        limit: 10,
      }),
      sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'profiles', {
        org_id: `eq.${orgId}`,
        is_active: 'eq.true',
        select: 'id,role_id,full_name',
        limit: 200,
      }),
      sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'org_roles', {
        org_id: `eq.${orgId}`,
        select: 'id,permissions',
        limit: 200,
      }),
      sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'org_ai_agent_member_permissions', {
        org_id: `eq.${orgId}`,
        select: 'subject_type,subject_id,agent_key,can_use,staff_bot_enabled,autonomy_mode,tone_style',
        limit: 500,
      }),
      sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'ai_background_cooldowns', {
        org_id: `eq.${orgId}`,
        select: 'agent_key,cooldown_key,next_eligible_at',
        limit: 200,
      }),
      sharedRestSelect(params.supabaseUrl, params.serviceRoleKey, 'org_ai_usage_ledger', {
        org_id: `eq.${orgId}`,
        created_at: `gte.${tehranDayStartIso}`,
        select: 'agent_key,billed_amount_irt,status',
        limit: 500,
      }),
    ]);
    const companyCurrency = companyRows?.[0] || { currency_code: 'IRT', currency_label: 'تومان' };

    const orgSettings = orgSettingsRows?.[0] || null;
    if (orgSettings?.is_readonly === true) {
      skippedReasons.push(`${orgId}: سازمان در حالت فقط‌خواندنی است.`);
      continue;
    }

    const planContext = await loadOrgPlanAccess(params.supabaseUrl, params.serviceRoleKey, orgId);

    if (!isPlanFeatureEnabled(planContext, 'ai_background_agents')) {
      skippedReasons.push(`${orgId}: ویژگی ایجنت‌های پس‌زمینه در پلن سازمان فعال نیست.`);
      continue;
    }

    const spentTodayByAgent = new Map<string, number>();
    for (const row of todayLedgerRows || []) {
      if (row?.status && String(row.status) !== 'finalized') continue;
      const aKey = String(row?.agent_key || '').trim() || 'lead_orchestrator';
      spentTodayByAgent.set(aKey, (spentTodayByAgent.get(aKey) || 0) + Number(row?.billed_amount_irt || 0));
    }

    const rolePermById = new Map<string, any>((orgRoles || []).map((r: any) => [String(r.id), r.permissions || {}]));
    const memberAgentStates = new Map<string, ReturnType<typeof resolveAgentStatesForActor>>();
    for (const profile of profiles || []) {
      const pid = String(profile?.id || '').trim();
      if (!pid) continue;
      const rolePerms = profile?.role_id ? (rolePermById.get(String(profile.role_id)) || null) : null;
      const isRoleOrgAdmin = Boolean(
        rolePerms?.__settings_tabs?.edit === true
        && rolePerms?.__settings_tabs?.fields?.ai !== false
        && rolePerms?.__settings_tabs?.fields?.ai_settings !== false,
      );
      memberAgentStates.set(pid, resolveAgentStatesForActor({
        agentConfigs: orgConfigs,
        memberPermissions: memberPerms,
        planContext,
        permissions: rolePerms,
        userId: pid,
        roleId: profile?.role_id || null,
        isOrgAdmin: isRoleOrgAdmin,
      }));
    }

    const scheduleCheck = isWithinOrgWorkSchedule(workSchedules, now);

    const recordCronOutcome = async (
      agentKey: AgentKey,
      status: 'completed' | 'skipped' | 'failed',
      summaryFa: string,
      errorMsg: string | null = null,
      meta: Record<string, any> = {},
    ) => {
      try {
        await Promise.all([
          sharedRestMutate(params.supabaseUrl, params.serviceRoleKey, 'ai_agent_runs', 'POST', [{
            org_id: orgId,
            execution_policy: 'background_agent',
            status,
            confidence: 'high',
            risk: 'low',
            agent_key: agentKey,
            selected_agents: [agentKey],
            trigger_type: forceRun ? 'manual_background' : 'cron',
            channel: 'background',
            completed_at: nowIso,
            source_metadata: {
              summary_fa: summaryFa,
              ...meta,
            },
          }]),
          sharedRestMutate(
            params.supabaseUrl,
            params.serviceRoleKey,
            `org_ai_agent_configs?org_id=eq.${orgId}&agent_key=eq.${agentKey}`,
            'PATCH',
            {
              background_last_run_at: nowIso,
              background_last_status: status,
              background_last_summary: summaryFa,
              background_last_error: errorMsg,
            },
          ),
        ]);
      } catch (trackErr) {
        console.warn('recordCronOutcome warning:', trackErr);
      }
    };

    for (const cfg of orgConfigs) {
      const agentKey = String(cfg.agent_key || '') as AgentKey;
      const def = getAgentDefinition(agentKey);
      if (!def || def.supportsBackground === false) continue;

      const bgConfig = cfg?.background_config && typeof cfg.background_config === 'object' ? cfg.background_config : {};
      const intervalMinutes = Math.max(5, Number(bgConfig.interval_minutes ?? def.defaultBackgroundConfig.interval_minutes ?? 60));

      if (!forceRun && cfg?.background_last_run_at) {
        const lastRunMs = Date.parse(String(cfg.background_last_run_at));
        if (Number.isFinite(lastRunMs) && (now.getTime() - lastRunMs) < intervalMinutes * 60_000) {
          continue;
        }
      }

      const permittedActors = (profiles || [])
        .map((p: any) => ({
          id: String(p?.id || ''),
          state: memberAgentStates.get(String(p?.id || ''))?.[agentKey],
        }))
        .filter((entry) => Boolean(entry.id && entry.state?.canView === true))
        .sort((a, b) => Number(b.state?.canEdit === true) - Number(a.state?.canEdit === true));

      const planEnabledForAgent = permittedActors.length > 0
        ? permittedActors[0].state?.planAllowed === true
        : (() => {
            const sample = resolveAgentStatesForActor({
              agentConfigs: orgConfigs,
              memberPermissions: [],
              planContext,
              permissions: null,
              isOrgAdmin: true,
            });
            return sample[agentKey]?.planAllowed === true;
          })();

      if (!planEnabledForAgent) {
        const msg = `${def.titleFa} در پلن فعلی سازمان مجاز نیست.`;
        skippedReasons.push(`${orgId}/${agentKey}: ${msg}`);
        await recordCronOutcome(agentKey, 'skipped', msg);
        continue;
      }

      const respectSchedule = bgConfig.respect_work_schedule !== false;
      if (!forceRun && respectSchedule && !scheduleCheck.withinSchedule) {
        const msg = scheduleCheck.reasonFa;
        skippedReasons.push(`${orgId}/${agentKey}: ${msg}`);
        continue;
      }

      const dailyBudgetIrt = Number(bgConfig.daily_budget_irt ?? def.defaultBackgroundConfig.daily_budget_irt ?? 0);
      const spentTodayIrt = spentTodayByAgent.get(agentKey) || 0;
      if (dailyBudgetIrt <= 0 || spentTodayIrt >= dailyBudgetIrt) {
        const msg = `بودجه روزانه (${formatAiAmountForOrg(dailyBudgetIrt, companyCurrency)}) به سقف رسیده است.`;
        skippedReasons.push(`${orgId}/${agentKey}: ${msg}`);
        await recordCronOutcome(agentKey, 'skipped', msg);
        continue;
      }

      const defaultRecipients = permittedActors.slice(0, 5).map((entry) => entry.id);
      if (!defaultRecipients.length) {
        const msg = `کاربری با مجوز مشاهده ${def.titleFa} برای دریافت گزارش پیدا نشد.`;
        skippedReasons.push(`${orgId}/${agentKey}: ${msg}`);
        await recordCronOutcome(agentKey, 'skipped', msg);
        continue;
      }

      runsTriggered += 1;
      try {
        const findings = await collectSqlFirstFindingsForAgent({
          supabaseUrl: params.supabaseUrl,
          serviceRoleKey: params.serviceRoleKey,
          orgId,
          agentKey,
          defaultRecipientIds: defaultRecipients,
          now,
        });
        findingsEvaluated += findings.length;

        let sentForAgent = 0;
        const canReceiveAgent = (uid: string) => Boolean(memberAgentStates.get(uid)?.[agentKey]?.canView);
        const cooldownFloorMinutes = Math.max(5, Number(bgConfig.cooldown_minutes ?? def.defaultBackgroundConfig.cooldown_minutes ?? 120));

        for (const finding of findings.slice(0, 3)) {
          if (!forceRun && hasUnreadCooldown(cooldowns, agentKey, finding.cooldownKey)) continue;
          const allowedDirectRecipients = (finding.recipientUserIds || []).filter((uid) => canReceiveAgent(uid));
          const finalRecipients = allowedDirectRecipients.length ? allowedDirectRecipients : defaultRecipients;
          if (!finalRecipients.length) continue;

          const relayed = await relayAgentMessageToStaff({
            supabaseUrl: params.supabaseUrl,
            serviceRoleKey: params.serviceRoleKey,
            orgId,
            agentKey,
            recipientUserIds: finalRecipients,
            content: finding.messageFa,
            moduleId: finding.moduleId,
            recordId: finding.recordId,
            priority: 10,
            cooldownKey: finding.cooldownKey,
            cooldownMinutes: Math.max(finding.cooldownMinutes, cooldownFloorMinutes),
            relayKind: 'background_insight',
            requiredModuleForRecipient: finding.requiredModuleForRecipient,
          });
          if (relayed.sent) {
            notificationsDispatched += 1;
            sentForAgent += 1;
          }
        }

        const summaryFa = findings.length === 0
          ? `${getAgentTitleFa(agentKey)}: مورد نیازمند پیگیری جدیدی یافت نشد.`
          : sentForAgent > 0
          ? `${getAgentTitleFa(agentKey)}: ${findings.length} مورد بررسی و ${sentForAgent} پیام پیگیری ارسال شد.`
          : `${getAgentTitleFa(agentKey)}: ${findings.length} مورد بررسی شد (در بازه تکرار قبلی بود).`;
        await recordCronOutcome(agentKey, 'completed', summaryFa, null, {
          findings_count: findings.length,
          dispatched_count: sentForAgent,
        });
      } catch (runErr: any) {
        const errMsg = String(runErr?.message || 'خطا در اجرای پس‌زمینه').slice(0, 300);
        skippedReasons.push(`${orgId}/${agentKey}: ${errMsg}`);
        await recordCronOutcome(agentKey, 'failed', `${def.titleFa}: اجرا با خطا متوقف شد.`, errMsg);
      }
    }
  }

  return {
    processedOrgs: orgIds.length,
    runsTriggered,
    findingsEvaluated,
    notificationsDispatched,
    skippedReasons,
  };
};
