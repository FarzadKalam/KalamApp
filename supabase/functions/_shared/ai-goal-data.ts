import { compileAgentDataQuery, readAgentDataPage, type AgentDataAccess } from './ai-agent-data.ts';
import { createProcessDataRuntime, sanitizeProcessValue } from './ai-process-data.ts';

const fields = ['module_id','name','description','goal_scope','period_unit','subperiod_unit','metric_type','metric_field_key','date_field_key','target_value','levels_enabled','bronze_value','silver_value','gold_value','assignee_user_ids','assignee_role_ids','conditions_all','conditions_any','config','is_active','created_at','updated_at'];
export const GOAL_DATA_TOOLS = [{ type: 'function', function: { name: 'read_goal_context',
  description: 'تعریف واقعی اهداف یک ماژول مجاز شامل هدف، دوره، شاخص، شرط‌ها، سطح‌ها و تنظیمات پاداش. moduleId از فهرست ماژول‌های مجاز؛ جزئیات config با recordId و field و path/offset قابل ادامه است.',
  parameters: { type: 'object',properties: { moduleId: { type: 'string' },recordId: { type: 'string' },
    field: { type: 'string' }, path: { type: 'array',items: { type: 'string' },maxItems: 12 },offset: { type: 'integer',minimum: 0 },
    afterId: { type: ['string','null'] },pageSize: { type: 'integer',minimum: 1,maximum: 50 } }, required: ['moduleId'],additionalProperties: false },
} }];
export const createGoalDataRuntime = (options: { access: AgentDataAccess; canRead: (moduleId: string) => boolean;
  read: (table: string,params: Record<string,string | number>) => Promise<any[]>;
  fieldAllowed: (moduleId: string,field: string) => boolean;
}) => ({ tools: GOAL_DATA_TOOLS, execute: async (args: any) => {
  if (!options.access.modules.some(module => module.id === args.moduleId) || !options.canRead(args.moduleId)) throw new Error('دسترسی اهداف این ماژول تأیید نشد.');
  const allowed = fields.filter(field => options.fieldAllowed('__goals',field));
  const access: AgentDataAccess = { ...options.access,modules: [{ id: 'goals',table: 'goals',label: 'اهداف',recordScope: 'all',
    fields: allowed.map(key => ({ key,label: key,type: 'json' })),
    viewConditions: { conditions_all: [{ field: 'module_id',operator: 'eq',value: args.moduleId }] } }] };
  const read = async (table: string,params: Record<string,string | number>) => (await options.read(table,params))
    .map(row => sanitizeProcessValue(row,'__goals',options.fieldAllowed));
  if (args.field) return createProcessDataRuntime({ ...options,read,access,fieldAllowed: (_id,field) => options.fieldAllowed('__goals',field) })
    .execute({ moduleId: 'goals',recordId: args.recordId,section: 'field',field: args.field,path: args.path,offset: args.offset,pageSize: args.pageSize });
  // Validate the configured page maximum before the shared bounded reader.
  if (args.pageSize !== undefined && (!Number.isInteger(args.pageSize) || args.pageSize < 1 || args.pageSize > 50)) throw new Error('صفحه اهداف معتبر نیست.');
  const query = { moduleId: 'goals',fields: allowed,pageSize: args.pageSize ?? 20,afterId: args.afterId };
  compileAgentDataQuery(access,query);
  return readAgentDataPage(access,query,read);
} });

