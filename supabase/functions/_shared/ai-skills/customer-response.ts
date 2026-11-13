import { sharedRestSelect, canViewModuleWithPlan, normalizeId } from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

export const customerResponseSkill: DomainSkillModule = {
  agentKey: 'customer_response',
  titleFa: 'ایجنت پاسخگویی مشتری',
  buildContractPrompt: () => [
    '## قرارداد تخصصی ایجنت پاسخگویی مشتری',
    '1. **تسلط بر وضعیت پروژه‌ها، فرآیندها و فعالیت‌های مشتری (`projects`, `process_runs`, `tasks`)**:',
    '   - هنگام پاسخ به سؤالات مشتری درباره وضعیت سفارش، پروژه یا خدمت، فوراً پروژه‌های فعال (`active_projects`) و فرآیندهای در حال اجرای مشتری (`in_progress_process_runs` همراه با `stages`) را بررسی کن.',
    '   - به مشتری دقیق و شفاف توضیح بده که کار در چه مرحله‌ای است، چه پیشرفتی داشته و چه اقداماتی در دست انجام است.',
    '2. **شناخت دقیق کارکنان مسئول و نقش‌های سازمانی (`organization_staff`)**:',
    '   - وظایف و تسک‌های فعال (`customer_tasks`) را به کارکنان مسئول (`assignee`) و عنوان نقش آنها تطبیق بده.',
    '   - هنگام پاسخ، با لحن محترمانه و حرفه‌ای نام همکار مسئول و سمت او را ذکر کن (مثلاً: «همکارمان آقای/خانم ... مسئول این مرحله هستند و در حال پیگیری آن می‌باشند»).',
    '3. **نمای یکپارچه ارتباطی مشتری (Omnichannel View)**:',
    '   - سوابق پیام‌های پیام‌رسان‌ها (`counterparty_bot_direct_messages`)، پیامک‌ها (`outbound_messages`) و تماس‌های صوتی (`voip_call_logs`) را کنار هم تحلیل کن تا پاسخ تکراری یا متناقض ندهی.',
    '4. **پیگیری واقعی از همکار مسئول (Staff Relay)**:',
    '   - در صورتی که مشتری سوال خاصی پرسید که نیازمند استعلام جدید است، از ابزار رله داخلی (`relay_to_responsible_staff`) برای ارسال پیام مستقیم به مسئول همان تسک یا فرآیند استفاده کن.',
    '5. **حفظ امنیت اطلاعات سازمانی**:',
    '   - در پاسخ‌های عمومی به مشتری، اطلاعات محرمانه نظیر بهای تمام‌شده، حاشیه سود یا ترازهای حسابداری داخلی را فاش نکن.',
  ].join('\n'),
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    if (!orgId || ctx.grounding.freeChatMode) return null;
    const perms = ctx.authContext?.permissions;
    const plan = ctx.grounding.planContext;
    const bundle: Record<string, any> = {};

    const customerId = ctx.pageContext?.moduleId === 'customers' && ctx.pageContext?.recordId
      ? String(ctx.pageContext.recordId)
      : null;

    const [
      recentBotMessages,
      recentSms,
      recentCalls,
      projects,
      processRuns,
      tasks,
      employees,
      orgRoles,
    ] = await Promise.all([
      canViewModuleWithPlan(plan, perms, 'customers')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'counterparty_bot_direct_messages', {
            org_id: `eq.${orgId}`,
            ...(customerId ? { customer_id: `eq.${customerId}` } : {}),
            select: 'id,channel_type,direction,message_text,customer_id,created_at',
            order: 'created_at.desc',
            limit: 10,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'customers')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'outbound_messages', {
            org_id: `eq.${orgId}`,
            channel_type: 'eq.sms',
            ...(customerId ? { customer_id: `eq.${customerId}` } : {}),
            select: 'id,customer_id,recipient,title,message_text,status,sent_at,created_at',
            order: 'created_at.desc',
            limit: 8,
          })
        : Promise.resolve([]),
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'voip_call_logs', {
        org_id: `eq.${orgId}`,
        select: 'id,direction,status,source_number,destination_number,extension,created_at',
        order: 'created_at.desc',
        limit: 8,
      }),
      canViewModuleWithPlan(plan, perms, 'projects')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'projects', {
            org_id: `eq.${orgId}`,
            ...(customerId ? { customer_id: `eq.${customerId}` } : {}),
            select: 'id,name,title,system_code,customer_id,status,progress,start_date,end_date,assignee_id',
            order: 'updated_at.desc',
            limit: 15,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'process_runs')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'process_runs', {
            org_id: `eq.${orgId}`,
            ...(customerId ? { customer_id: `eq.${customerId}` } : {}),
            select: 'id,name,title,system_code,customer_id,status,current_stage_name,current_assignee_id,progress,module_id,record_id,updated_at',
            order: 'updated_at.desc',
            limit: 15,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'tasks')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'tasks', {
            org_id: `eq.${orgId}`,
            ...(customerId ? { customer_id: `eq.${customerId}` } : {}),
            select: 'id,title,system_code,customer_id,project_id,assignee_id,assignee_name,status,due_date,priority',
            order: 'updated_at.desc',
            limit: 20,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'employees')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'employees', {
            org_id: `eq.${orgId}`,
            select: 'id,full_name,name,mobile,role_title,department,status',
            limit: 30,
          })
        : Promise.resolve([]),
      sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'org_roles', {
        org_id: `eq.${orgId}`,
        select: 'id,name,title',
        limit: 20,
      }),
    ]);

    // Enrich process runs with their active stages
    const runIds = (processRuns || []).map((r: any) => normalizeId(r?.id)).filter(Boolean);
    const runStages = runIds.length
      ? await sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'process_run_stages', {
          process_run_id: `in.(${runIds.join(',')})`,
          select: 'id,process_run_id,stage_name,status,assignee_id,due_date,completed_at',
          order: 'sort_order.asc',
          limit: 100,
        })
      : [];

    const stagesByRunId = new Map<string, any[]>();
    for (const stage of runStages || []) {
      const rid = normalizeId(stage?.process_run_id);
      if (!rid) continue;
      if (!stagesByRunId.has(rid)) stagesByRunId.set(rid, []);
      stagesByRunId.get(rid)!.push(stage);
    }

    const enrichedProcessRuns = (processRuns || []).map((r: any) => ({
      ...r,
      stages: stagesByRunId.get(normalizeId(r?.id)) || [],
    }));

    if (recentBotMessages.length) bundle.recent_bot_messages = recentBotMessages;
    if (recentSms.length) bundle.recent_sms_messages = recentSms;
    if (recentCalls.length) bundle.recent_voip_calls = recentCalls;
    if (projects.length) bundle.active_projects = projects;
    if (enrichedProcessRuns.length) bundle.in_progress_process_runs = enrichedProcessRuns;
    if (tasks.length) bundle.customer_tasks = tasks;
    if (employees.length) {
      bundle.organization_staff = employees.map((emp: any) => ({
        id: emp.id,
        name: emp.full_name || emp.name,
        role: emp.role_title,
        department: emp.department,
      }));
    }
    if (orgRoles.length) bundle.organization_roles = orgRoles;

    return bundle;
  },
};
