import { readAgentDataPage, type AgentDataAccess } from './ai-agent-data.ts';
import { cleanWorkTitle, personalAssistantTitle } from './ai-personal-assistant.ts';

export const buildActorWorkIdentity = (actor: any) => ({
  role: cleanWorkTitle(actor?.role?.title) || null,
  rolePath: (Array.isArray(actor?.rolePath) ? actor.rolePath : []).map((role: any) => cleanWorkTitle(role.title)).filter(Boolean),
  jobTitle: cleanWorkTitle(actor?.profile?.job_title || actor?.profile?.position) || null,
  assistantTitle: personalAssistantTitle(actor?.role?.title, actor?.softwareRole),
});

export const ACTOR_WORK_CONTEXT_TOOL = {
  type: 'function',
  function: {
    name: 'read_actor_work_context',
    description: 'شرح شغل، قرارداد، اهداف یا ماژول‌های مجاز صاحب همین درخواست. جزئیات را فقط وقتی برای کار فعلی لازم است بخوان. این ابزار شخص دیگری را نمی‌پذیرد.',
    parameters: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: ['job', 'contracts', 'goals', 'permissions'] },
        afterId: { type: 'string', description: 'نشانگر صفحهٔ بعد قراردادها' },
        offset: { type: 'integer', minimum: 0, description: 'شمارهٔ شروع صفحهٔ اهداف یا دسترسی‌ها' },
      },
      required: ['section'],
      additionalProperties: false,
    },
  },
};

export const createActorWorkContext = (options: {
  access: AgentDataAccess;
  read: (table: string, params: Record<string, string | number>) => Promise<any[]>;
  roleId?: string | null;
  canReadGoal: (moduleId: string) => boolean;
  fieldAllowed: (moduleId: string, field: string) => boolean;
  moduleActions: (moduleId: string) => { create: boolean; edit: boolean; delete: boolean };
}) => {
  const list = (moduleId: string, keys: string[], filter: { field: string; value: unknown }, pageSize = 6, afterId?: string) => {
    const module = options.access.modules.find(item => item.id === moduleId);
    const fields = keys.filter(key => module?.fields.some(field => field.key === key));
    if (!module || !fields.length || (filter.field !== 'id' && !module.fields.some(field => field.key === filter.field))) return null;
    return readAgentDataPage(options.access, { moduleId, fields, filters: [{ ...filter, operator: 'eq' }], pageSize, afterId }, options.read);
  };

  return async (args: { section: string; offset?: number; afterId?: string }) => {
    const { section, afterId, offset = 0 } = args;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('صفحهٔ زمینهٔ کاری معتبر نیست.');
    if (section === 'permissions') {
      const page = options.access.modules.slice(offset, offset + 20);
      return { permittedModules: page.map(({ id, label, recordScope }) =>
        ({ module: id, label, recordScope, ...options.moduleActions(id) })),
      nextOffset: offset + page.length < options.access.modules.length ? offset + page.length : null };
    }
    if (section === 'goals') {
      const modules = options.access.modules.filter(module => options.canReadGoal(module.id)).map(module => module.id);
      if (!modules.length) return { available: false };
      const assignments = [`assignee_user_ids.cs.${JSON.stringify([options.access.userId])}`];
      if (options.roleId) assignments.push(`assignee_role_ids.cs.${JSON.stringify([options.roleId])}`);
      const fields = ['module_id', 'name', 'goal_scope', 'period_unit', 'metric_type', 'target_value']
        .filter(field => options.fieldAllowed('__goals', field));
      if (!fields.length) return { available: false };
      const rows = await options.read('goals', {
        org_id: `eq.${options.access.orgId}`, is_active: 'eq.true', module_id: `in.(${modules.join(',')})`,
        or: `(${assignments.join(',')})`, select: fields.join(','), order: 'updated_at.desc,id.desc', limit: 7, offset,
      });
      return { goals: rows.slice(0, 6).map(row => Object.fromEntries(fields.map(field => [field, row[field]]))),
        nextOffset: rows.length > 6 ? offset + 6 : null };
    }
    if (section !== 'job' && section !== 'contracts') throw new Error('بخش زمینهٔ کاری معتبر نیست.');
    const employeeData = await list('employees', ['full_name', 'job_description_id', 'job_goal', 'job_responsibilities', 'job_duties'],
      { field: 'related_profile_id', value: options.access.userId }, 2);
    if (!employeeData || employeeData.records.length !== 1 || employeeData.hasMore) return { available: false };
    const employee = employeeData.records[0];
    if (section === 'contracts') {
      const contracts = await list('employee_contracts', ['name', 'system_code', 'title', 'contract_type', 'status', 'start_date', 'end_date', 'work_location', 'base_salary', 'body', 'terms'],
        { field: 'employee_id', value: employee.reference }, 6, afterId);
      return contracts ? { contracts: contracts.records, hasMore: contracts.hasMore, nextAfterId: contracts.nextAfterId } : { available: false };
    }
    const descriptionId = employee.fields.job_description_id;
    const linked = typeof descriptionId === 'string'
      ? await list('job_descriptions', ['name', 'job_goal', 'job_responsibilities', 'job_duties', 'job_requirements'],
        { field: 'id', value: descriptionId }, 1)
      : null;
    const { job_description_id: _reference, ...employment } = employee.fields;
    return { employment, truncatedFields: employee.truncatedFields, description: linked?.records[0] || null };
  };
};
