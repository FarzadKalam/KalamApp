export const PROCESS_OPERATION_TYPES = ['create_content_project','materialize_template_to_tasks','create_raw_process_with_tasks','add_stage_task','update_stage_task','cancel_stage_task'] as const;

/** All entry points and confirmation use the same operation-level policy. */
export const assertProcessOperationPermissions = (operation: any, page: any, policy: {
  can: (moduleId: string, action: 'view' | 'create' | 'edit', field?: string) => boolean;
}) => {
  const type = String(operation?.type || '');
  if (!PROCESS_OPERATION_TYPES.includes(type as any)) throw new Error('نوع اقدام فرآیندی پشتیبانی نمی‌شود.');
  const moduleId = String(operation.module_id || page.moduleId || '');
  const recordId = String(operation.record_id || page.recordId || '');
  // One card owns one record context. Other records need their own central card.
  if (moduleId !== page.moduleId || recordId !== page.recordId) throw new Error('مقصد اقدام با رکورد کارت تأیید یکسان نیست.');
  const require = (module: string, action: 'view' | 'create' | 'edit', field?: string) => {
    if (!policy.can(module, action, field)) throw new Error('مجوز یا امکان اشتراک برای این تغییر فرآیندی وجود ندارد.');
  };
  require(moduleId, 'view');
  require('process_runs', 'view');
  const updating = ['update_stage_task','cancel_stage_task'].includes(type);
  require('tasks', updating ? 'edit' : 'create');
  require('process_runs', updating || type === 'add_stage_task' ? 'edit' : 'create');
  if (operation.template_id) require('process_templates','view');
  if (type === 'create_content_project') require('projects','create');
  if (updating) {
    const keys: Record<string, string[]> = { name: ['name'], title: ['name'], description: ['description'], status: ['status'],
      priority: ['priority'], start_date: ['start_date'], due_date: ['due_date'], due_days: ['due_date'],
      assignee: ['assignee_id','assignee_role_id','assignee_type'] };
    for (const [input, fields] of Object.entries(keys)) if (operation[input] !== undefined) fields.forEach(field => require('tasks','edit',field));
    if (type === 'cancel_stage_task') require('tasks','edit','status');
    if (operation.custom_values) {
      require('tasks','edit','recurrence_info');
      Object.keys(operation.custom_values).forEach(field => require('tasks','edit',field));
    }
  }
};

export const processOperationReceipt = (operations: any[]) => {
  const created: any[] = [], updated: any[] = [];
  const add = (list: any[], module_id: string, id: string, title: string) => {
    if (id && !list.some(row => row.id === id && row.module_id === module_id)) list.push({ module_id, id, title });
  };
  for (const operation of operations) {
    add(created,'projects',operation.project_id,operation.title || 'پروژه');
    if (['materialize_template_to_tasks','create_raw_process_with_tasks'].includes(operation.type)) add(created,'process_runs',operation.process_run_id,operation.title || 'اجرای فرآیند');
    for (const task of operation.created_tasks || []) add(created,'tasks',task.id,task.title || 'فعالیت');
    add(updated,'tasks',operation.updated_task_id || operation.canceled_task_id,operation.title || 'فعالیت');
  }
  return { created_records: created, updated_records: updated };
};
