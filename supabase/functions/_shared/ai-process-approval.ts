import { CALENDAR_CONTENT_TYPES, normalizeCalendarSchedule } from './ai-content-calendar.ts';

type Choice = { label: string; value: string };
export type ProcessApprovalField = {
  key: string;
  label: string;
  type: 'text' | 'long_text' | 'date' | 'datetime' | 'select';
  required?: boolean;
  options?: readonly Choice[];
};

const name: ProcessApprovalField = { key: 'name', label: 'عنوان', type: 'text', required: true };
const description: ProcessApprovalField = { key: 'description', label: 'توضیحات', type: 'long_text' };
const schedule: ProcessApprovalField[] = [
  { key: 'start_date', label: 'زمان شروع', type: 'datetime' },
  { key: 'due_date', label: 'موعد', type: 'datetime' },
];
const priority: ProcessApprovalField = {
  key: 'priority', label: 'اولویت', type: 'select',
  options: [{ value: 'low', label: 'کم' }, { value: 'medium', label: 'متوسط' }, { value: 'high', label: 'زیاد' }, { value: 'urgent', label: 'فوری' }],
};
const template: ProcessApprovalField = { key: 'template_id', label: 'الگوی فرآیند', type: 'select' };
const templateStage: ProcessApprovalField = { key: 'template_stage_id', label: 'مرحلهٔ الگو', type: 'select' };
const nest = (prefix: string, fields: ProcessApprovalField[]) =>
  fields.map(field => ({ ...field, key: `${prefix}.${field.key}` }));

export const getProcessApprovalFields = (operation: any): ProcessApprovalField[] => {
  switch (operation?.type) {
    case 'schedule_calendar_content':
      return [name, { key: 'content_type', label: 'نوع محتوا', type: 'select', required: true, options: CALENDAR_CONTENT_TYPES },
        ...schedule.map(field => ({ ...field, required: true })), template, templateStage];
    case 'create_content_project':
      return [name, description, priority, ...schedule.map(field => ({ ...field, type: 'date' as const })), template];
    case 'create_calendar_template':
      return [name, description, ...(Array.isArray(operation.stages) ? operation.stages : []).flatMap((_stage: unknown, index: number) =>
        nest(`stages.${index}`, [{ ...name, key: 'stage_name' }, description]))];
    case 'materialize_template_to_tasks':
      return [{ ...name, key: 'process_name' }];
    case 'create_raw_process_with_tasks':
      return [{ ...name, key: 'process_name' }, ...(Array.isArray(operation.stages) ? operation.stages : []).flatMap((_stage: unknown, index: number) =>
        nest(`stages.${index}`, [name, description, priority, ...schedule]))];
    case 'add_stage_task':
      return nest('stage', [name, description, priority, ...schedule]);
    case 'update_stage_task':
      return [name, description, priority, ...schedule];
    default:
      return [];
  }
};

const getAtPath = (operation: any, path: string) =>
  path.split('.').reduce((entry, key) => entry?.[key], operation);

export const getProcessApprovalValue = (operation: any, path: string): unknown => {
  if (operation?.type === 'add_stage_task' && !operation.stage && path.startsWith('stage.')) {
    return getProcessApprovalValue(operation, path.slice('stage.'.length));
  }
  const value = getAtPath(operation, path);
  if (value !== undefined) return value;
  if (path === 'name') return operation?.title || operation?.project_name;
  if (path.endsWith('.name')) return getAtPath(operation, path.replace(/\.name$/, '.stage_name'));
  if (path.endsWith('.stage_name')) return getAtPath(operation, path.replace(/\.stage_name$/, '.name'));
  return undefined;
};

const setAtPath = (value: any, path: string[], next: unknown): any => {
  const [key, ...tail] = path;
  const replacement = tail.length ? setAtPath(value?.[key], tail, next) : next;
  if (!Array.isArray(value)) return { ...value, [key]: replacement };
  return value.map((entry, index) => index === Number(key) ? replacement : entry);
};

export const applyProcessApprovalEdits = (operation: any, edits: Record<string, unknown>) => {
  const entries = Object.entries(edits);
  const initial = operation.type === 'add_stage_task' && !operation.stage && entries.length
    ? { ...operation, stage: { ...operation } } : operation;
  return entries.reduce((draft, [path, value]) => setAtPath(draft, path.split('.'), value), initial);
};

export const processApprovalFieldPermission = (operation: any, path: string): [string, 'create' | 'edit', string] => {
  const key = path.split('.').at(-1)!;
  switch (operation.type) {
    case 'schedule_calendar_content': return ['content_calendars', 'edit', 'execution_process_draft'];
    case 'create_content_project': return ['projects', 'create', key === 'template_id' ? 'process_template_id' : key];
    case 'create_calendar_template': return ['process_templates', 'create', path.startsWith('stages.') ? 'template_stages_preview' : key];
    case 'update_stage_task': return ['tasks', 'edit', key];
    default: return path === 'process_name' ? ['process_runs', 'create', path] : ['tasks', 'create', key];
  }
};

const isUuid = (value: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const dateValid = (value: string) => {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value.slice(0, 10);
};

export const validateProcessApprovalEdits = (
  operation: any, rawEdits: unknown,
  can: (module: string, action: 'create' | 'edit', field: string) => boolean,
) => {
  if (rawEdits === undefined) return operation;
  if (!rawEdits || typeof rawEdits !== 'object' || Array.isArray(rawEdits)) throw new Error('مقادیر ویرایش کارت معتبر نیستند.');
  const fields = getProcessApprovalFields(operation);
  const edits: Record<string, unknown> = {};
  for (const [key, input] of Object.entries(rawEdits)) {
    const field = fields.find(candidate => candidate.key === key);
    if (!field || !can(...processApprovalFieldPermission(operation, key))) throw new Error('مجوز ویرایش یکی از فیلدهای این اقدام وجود ندارد.');
    if (input !== null && typeof input !== 'string') throw new Error(`مقدار «${field.label}» معتبر نیست.`);
    const value = typeof input === 'string' ? input.trim() : '';
    if (!value && field.required) throw new Error(`«${field.label}» را وارد کنید.`);
    if (value && (
      (field.options && !field.options.some(option => option.value === value))
      || (field.type === 'select' && !field.options && !isUuid(value))
      || (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !dateValid(value)))
      || (field.type === 'datetime' && operation.type !== 'schedule_calendar_content'
        && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)
          || !dateValid(value) || !Number.isFinite(Date.parse(value))))
      || value.length > (field.type === 'long_text' ? 4000 : 160)
    )) throw new Error(`مقدار «${field.label}» معتبر نیست.`);
    edits[key] = value || null;
  }
  const result = applyProcessApprovalEdits(operation, edits);
  if (result.type === 'schedule_calendar_content') {
    normalizeCalendarSchedule(result);
    if (Boolean(result.template_id) !== Boolean(result.template_stage_id)) throw new Error('الگو و مرحلهٔ آن را با هم انتخاب کنید.');
  }
  if (result.type === 'create_content_project' && result.start_date && result.due_date
    && Date.parse(result.start_date) > Date.parse(result.due_date)) throw new Error('موعد پروژه باید بعد از تاریخ شروع یا در همان روز باشد.');
  const stages = result.type === 'create_raw_process_with_tasks' ? result.stages
    : result.type === 'add_stage_task' ? [result.stage]
    : result.type === 'update_stage_task' ? [result] : [];
  if (stages?.some((stage: any) => stage?.start_date && stage?.due_date && Date.parse(stage.start_date) > Date.parse(stage.due_date))) {
    throw new Error('موعد فعالیت باید بعد از زمان شروع یا برابر آن باشد.');
  }
  return result;
};
