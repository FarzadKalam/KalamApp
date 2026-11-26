// Shared Remote MCP Protocol & Per-Org / Per-User Access Runtime.
// Pure TypeScript modules imported here keep core authorization and tool routing
// unit-testable under Node Vitest as well as Deno Edge Runtime.

import {
  AGENT_DATA_TOOLS,
  aggregateAgentData,
  agentRecordMatchesViewConditions,
  countAgentData,
  readAgentDataPage,
  tenantAgentDataModuleIds,
  type AgentDataAccess,
} from './ai-agent-data.ts';
import {
  canAddAiDynamicOption,
  getAiRecordRequiredQuestions,
  hydrateAiRecordOptions,
  prepareAiRecordOptions,
  resolveAiRecordSchema,
} from './ai-record-contract.ts';
import { describeAiRecord } from './ai-record-display.ts';
import { AI_RECORD_SCHEMAS } from './ai-record-schemas.generated.ts';
import type { McpScope } from './mcp-oauth.ts';

export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;

export const MCP_SERVER_INFO = {
  name: 'tazesystem-mcp',
  version: '1.0.0',
  title: 'تازه‌سیستم MCP',
};

const SAAS_MODULE_PLAN_INHERITANCE: Record<string, string> = {
  sales_return_invoices: 'invoices',
  purchase_return_invoices: 'purchase_invoices',
  personas: 'marketing_leads',
  billboard_status_changes: 'billboards',
  production_group_orders: 'production_orders',
  advertising_campaign_tools: 'advertising_campaigns',
  advertising_campaign_responses: 'advertising_campaigns',
  mbti_assessments: 'employees',
};

const SAAS_MODULE_FEATURE_INHERITANCE: Record<string, string> = {
  reservations: 'reservations',
  reservation_resources: 'reservations',
  email_delivery_reports: 'organization_email',
  instagram_conversations: 'instagram_inbox',
  instagram_interaction_events: 'instagram_inbox',
};

const RETURN_INVOICE_PARENT_MODULES: Record<string, string> = {
  sales_return_invoices: 'invoices',
  purchase_return_invoices: 'purchase_invoices',
};

const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api_key/i,
  /private_key/i,
  /webhook_secret/i,
  /encryption/i,
  /auth_hash/i,
];

const BLOCKED_TENANT_MODULES = new Set([
  'profiles',
  'organizations',
  'org_roles',
  'org_api_tokens',
  'org_webhooks',
  'integration_settings',
  'system_code_counters',
  'app_schema_migrations',
  'cms_blog_posts',
  'cms_tutorial_posts',
  'cms_tags',
]);

const PROTECTED_WRITE_FIELDS = new Set([
  'id',
  'org_id',
  'system_code',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'deleted_at',
]);

const isUuid = (value: unknown): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

export const isSensitiveMcpField = (key: string): boolean => {
  const normalized = String(key || '').trim();
  if (!normalized || normalized.startsWith('__')) return true;
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const truthyPlanValue = (value: unknown): boolean => {
  if (value === true) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'enabled', 'on', 'yes', 'full', 'limited'].includes(normalized);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    return obj.enabled === true || obj.available === true;
  }
  return false;
};

export const isMcpPlanFeatureEnabled = (planContext: any, featureKey: string): boolean => {
  if (!planContext?.available) return false;
  return truthyPlanValue(planContext?.features?.[featureKey]);
};

export const isMcpPlanModuleEnabled = (planContext: any, moduleId: string): boolean => {
  if (!planContext?.available) return false;
  if (!moduleId || moduleId.startsWith('saas_') || BLOCKED_TENANT_MODULES.has(moduleId)) return false;

  const featureKey = SAAS_MODULE_FEATURE_INHERITANCE[moduleId];
  if (featureKey && !isMcpPlanFeatureEnabled(planContext, featureKey)) return false;

  if (moduleId === 'workflows') return true;
  const directOverride = planContext?.moduleOverrides?.[moduleId];
  if (directOverride === false) return false;
  if (directOverride === true) return true;

  const direct = planContext?.enabledModules?.[moduleId];
  if (direct !== undefined) return truthyPlanValue(direct);

  const parentId = SAAS_MODULE_PLAN_INHERITANCE[moduleId];
  if (parentId) return isMcpPlanModuleEnabled(planContext, parentId);
  return false;
};

export const getMcpModulePermission = (permissions: any, moduleId: string): Record<string, any> => {
  if (!permissions || typeof permissions !== 'object') return {};
  const perm = permissions?.[moduleId] ?? permissions?.[RETURN_INVOICE_PARENT_MODULES[moduleId]];
  return perm && typeof perm === 'object' ? perm : {};
};

export const getMcpRecordScope = (perm: any): 'all' | 'own' | 'team' | 'subtree' => {
  const value = String(perm?.record_scope || '').trim();
  if (value === 'own' || value === 'team' || value === 'subtree' || value === 'all') return value;
  return perm?.view === false ? 'own' : 'all';
};

const getResolvedAssigneeId = (source: any): string => {
  if (!source || typeof source !== 'object') return '';
  const normalizedType = String(source?.assignee_type || '').trim().toLowerCase();
  const prefersRoleAssignee = normalizedType === 'role' || (!normalizedType && source?.assignee_role_id);
  const rawValue = prefersRoleAssignee ? (source?.assignee_role_id ?? source?.assignee_id) : source?.assignee_id;
  return String(rawValue || '').trim();
};

export const canMcpAccessRecord = (
  record: any,
  authContext: McpAuthContext,
  recordScope: 'all' | 'own' | 'team' | 'subtree' = 'all',
  permission: Record<string, any> = {},
): boolean => {
  if (!record || !agentRecordMatchesViewConditions(record, permission.view_conditions)) return false;
  if (String(record.org_id || '').trim() !== authContext.orgId) return false;
  if (recordScope === 'all') return true;

  const resolvedAssigneeId = getResolvedAssigneeId(record);
  if (!resolvedAssigneeId) return false;

  if (recordScope === 'team') {
    return !!authContext.roleId && record?.assignee_type === 'role' && resolvedAssigneeId === authContext.roleId;
  }
  if (recordScope === 'subtree') {
    if (record?.assignee_type === 'role') return authContext.allowedRoleIds.includes(resolvedAssigneeId);
    if (record?.assignee_type === 'user') return authContext.allowedUserIds.includes(resolvedAssigneeId);
    return false;
  }
  return !!authContext.userId && record?.assignee_type === 'user' && resolvedAssigneeId === authContext.userId;
};

export const canMcpViewModule = (
  planContext: any,
  permissions: any,
  moduleId: string,
  isOwner = false,
): boolean => {
  if (!isMcpPlanModuleEnabled(planContext, moduleId)) return false;
  const explicit = permissions?.[moduleId] ?? permissions?.[RETURN_INVOICE_PARENT_MODULES[moduleId]];
  if (!explicit || typeof explicit !== 'object') return isOwner === true;
  return explicit.view !== false;
};

export const canMcpCreateModule = (perm: any): boolean =>
  perm?.view !== false && (perm?.create ?? perm?.edit) !== false;

export const canMcpEditModule = (perm: any): boolean =>
  perm?.view !== false && perm?.edit !== false;

export const canMcpDeleteModule = (perm: any): boolean =>
  perm?.view !== false && perm?.delete === true;

export const isMcpFieldDenied = (
  perm: any,
  key: string,
  action: 'view' | 'create' | 'edit' | 'delete',
  value?: unknown,
): boolean => {
  if (isSensitiveMcpField(key) || PROTECTED_WRITE_FIELDS.has(key)) return true;
  if (perm?.fields?.[key] === false) return true;
  const rule = perm?.field_actions?.[key];
  if (rule?.view === false) return true;
  if (action !== 'view' && rule?.[action] === false) return true;
  if (
    action === 'edit' &&
    rule?.delete === false &&
    (value === null || value === '' || (Array.isArray(value) && value.length === 0))
  ) {
    return true;
  }
  return false;
};

export type McpAuthContext = {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
  userEmail: string;
  roleId: string | null;
  roleName: string | null;
  softwareRole: string | null;
  isOwner: boolean;
  permissions: Record<string, any>;
  allowedRoleIds: string[];
  allowedUserIds: string[];
  planContext: any;
  scopes: McpScope[];
  isReadonlyOrg: boolean;
  moduleSettings: Record<string, any>;
};

export type McpStorageAdapter = {
  select: (table: string, params: Record<string, string | number>) => Promise<Record<string, any>[]>;
  count: (table: string, params: Record<string, string | number>) => Promise<number>;
  insert: (table: string, rows: Record<string, any>[]) => Promise<Record<string, any>[]>;
  patch: (table: string, params: Record<string, string | number>, payload: Record<string, any>) => Promise<Record<string, any>[]>;
  remove: (table: string, params: Record<string, string | number>) => Promise<Record<string, any>[]>;
  upsert?: (table: string, rows: Record<string, any>[], onConflict?: string) => Promise<Record<string, any>[]>;
};

export const getModuleTable = (moduleId: string): string => {
  const schema = (AI_RECORD_SCHEMAS as Record<string, any>)[moduleId];
  return String(schema?.table || moduleId);
};

export const buildMcpDataAccess = (auth: McpAuthContext): AgentDataAccess => {
  const moduleIds = tenantAgentDataModuleIds(
    AI_RECORD_SCHEMAS as Record<string, any>,
    (moduleId) => canMcpViewModule(auth.planContext, auth.permissions, moduleId, auth.isOwner),
  ).filter((id) => !BLOCKED_TENANT_MODULES.has(id) && id !== 'workflows');

  const modules = moduleIds.map((moduleId) => {
    const base = (AI_RECORD_SCHEMAS as Record<string, any>)[moduleId];
    const perm = getMcpModulePermission(auth.permissions, moduleId);
    const customFields = auth.moduleSettings?.[moduleId]?.schema?.fields || [];
    const fieldMap = new Map<string, any>();

    for (const field of [
      ...(base?.fields || []),
      ...(base?.contextFields || []),
      ...customFields,
    ]) {
      const key = String(field?.key || '').trim();
      if (!key || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue;
      if (isSensitiveMcpField(key)) continue;
      if (field?.isActive === false) continue;
      if (perm?.fields?.[key] === false || perm?.field_actions?.[key]?.view === false) continue;
      if (['template_stages_preview', 'run_stages_preview'].includes(key)) continue;
      if (['image', 'checklist', 'progress_stages', 'readonly_lookup', 'formula'].includes(field?.type)) continue;
      fieldMap.set(key, {
        key,
        label: String(field?.labels?.fa || field?.label || key),
        type: String(field?.type || 'text'),
      });
    }

    for (const table of base?.tables || []) {
      const key = String(table?.key || '').trim();
      if (!key || isSensitiveMcpField(key)) continue;
      if (perm?.fields?.[key] === false || perm?.field_actions?.[key]?.view === false) continue;
      fieldMap.set(key, {
        key,
        label: String(table?.label || key),
        type: 'json',
      });
    }

    for (const sysKey of ['system_code', 'created_at', 'updated_at', 'assignee_id', 'assignee_role_id', 'assignee_type']) {
      if (!fieldMap.has(sysKey) && perm?.fields?.[sysKey] !== false && perm?.field_actions?.[sysKey]?.view !== false) {
        fieldMap.set(sysKey, { key: sysKey, label: sysKey, type: 'text' });
      }
    }

    return {
      id: moduleId,
      table: getModuleTable(moduleId),
      label: String(base?.moduleLabel || moduleId),
      fields: Array.from(fieldMap.values()),
      recordScope: getMcpRecordScope(perm),
      viewConditions: perm?.view_conditions,
    };
  }).filter((mod) => mod.fields.length > 0);

  return {
    orgId: auth.orgId,
    userId: auth.userId,
    roleId: auth.roleId,
    allowedUserIds: auth.allowedUserIds,
    allowedRoleIds: auth.allowedRoleIds,
    modules,
  };
};

const sanitizeRowForMcp = (
  row: Record<string, any>,
  perm: Record<string, any>,
): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (isSensitiveMcpField(key)) continue;
    if (perm?.fields?.[key] === false || perm?.field_actions?.[key]?.view === false) continue;
    out[key] = value;
  }
  return out;
};

const loadWritableSchemaForMcp = async (
  auth: McpAuthContext,
  storage: McpStorageAdapter,
  moduleId: string,
) => {
  const base = (AI_RECORD_SCHEMAS as Record<string, any>)[moduleId];
  if (!base || BLOCKED_TENANT_MODULES.has(moduleId)) {
    throw new Error('ماژول انتخاب‌شده برای ثبت یا ویرایش از طریق MCP پشتیبانی نمی‌شود.');
  }
  if (!canMcpViewModule(auth.planContext, auth.permissions, moduleId, auth.isOwner)) {
    throw new Error('دسترسی به این ماژول در پلن سازمان یا نقش کاربری شما فعال نیست.');
  }
  const perm = getMcpModulePermission(auth.permissions, moduleId);
  const modConfig = auth.moduleSettings?.[moduleId] || {};
  const schema = resolveAiRecordSchema(
    base,
    { ...modConfig.schema, conditionalDisplay: modConfig.conditionalDisplay },
    perm,
  );
  const categories = Array.from(new Set(schema.fields.map((f: any) => f.dynamicOptionsCategory).filter(Boolean))) as string[];
  const optionRows: Record<string, any>[] = [];
  if (categories.length > 0) {
    const rows = await storage.select('dynamic_options', {
      org_id: `eq.${auth.orgId}`,
      category: `in.(${categories.map((c) => `"${String(c).replace(/"/g, '\\"')}"`).join(',')})`,
      is_active: 'eq.true',
      select: 'category,label,value',
      order: 'value.asc',
      limit: 1000,
    });
    optionRows.push(...rows);
  }
  return hydrateAiRecordOptions(schema, optionRows, canAddAiDynamicOption(perm));
};

const sanitizeWriteFields = (
  payload: Record<string, any>,
  schema: any,
  perm: Record<string, any>,
  action: 'create' | 'edit',
) => {
  const allowedFieldMap = new Map((schema.fields || []).map((f: any) => [f.key, f]));
  const allowedTableMap = new Map((schema.tables || []).map((t: any) => [t.key, t]));
  const cleanFields: Record<string, any> = {};

  for (const [key, value] of Object.entries(payload || {})) {
    if (PROTECTED_WRITE_FIELDS.has(key) || isSensitiveMcpField(key)) {
      throw new Error(`فیلد سیستمی «${key}» قابل تغییر نیست.`);
    }
    if (isMcpFieldDenied(perm, key, action, value)) {
      throw new Error(`اجازهٔ ${action === 'create' ? 'تنظیم' : 'ویرایش'} فیلد «${key}» را ندارید.`);
    }
    if (allowedTableMap.has(key)) {
      if (!Array.isArray(value)) throw new Error(`فیلد جدولی «${key}» باید آرایه باشد.`);
      const tableDef: any = allowedTableMap.get(key);
      const validCols = new Set((tableDef.columns || []).map((c: any) => c.key));
      cleanFields[key] = value.map((row: any) => {
        const cleanRow: Record<string, any> = {};
        for (const [colKey, colVal] of Object.entries(row || {})) {
          if (!validCols.has(colKey)) continue;
          if (isMcpFieldDenied(perm, colKey, action, colVal) || isMcpFieldDenied(perm, `${key}.${colKey}`, action, colVal)) {
            throw new Error(`اجازهٔ تغییر ستون «${key}.${colKey}» را ندارید.`);
          }
          cleanRow[colKey] = colVal;
        }
        return cleanRow;
      });
      continue;
    }
    if (!allowedFieldMap.has(key)) {
      throw new Error(`فیلد «${key}» در طرح مجاز این ماژول وجود ندارد.`);
    }
    cleanFields[key] = value;
  }
  return cleanFields;
};

export const getMcpToolsDefinition = (auth: McpAuthContext) => {
  const canWrite = !auth.isReadonlyOrg && auth.scopes.includes('mcp:write');
  const readTools = [
    {
      name: 'get_my_context',
      title: 'اطلاعات کاربر و دسترسی‌های سازمان',
      description: 'نمایش سازمان فعال، نقش کاربر، قابلیت‌های فعال پلن و فهرست ماژول‌های مجاز کاربر (برای کشف حدود دسترسی پیش از کار).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'list_modules',
      title: 'فهرست ماژول‌های مجاز',
      description: 'فهرست همهٔ ماژول‌هایی که هم در پلن سازمان فعال‌اند و هم کاربر جاری اجازهٔ مشاهدهٔ آن‌ها را دارد، همراه با سطح دسترسی (ایجاد/ویرایش/حذف/محدوده رکورد).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'describe_module',
      title: 'ساختار و فیلدهای ماژول',
      description: 'نمایش فیلدهای مجاز، جدول‌های داخلی، گزینه‌های انتخابی و دسترسی هر فیلد برای یک ماژول مشخص.',
      inputSchema: {
        type: 'object',
        properties: { moduleId: { type: 'string', description: 'شناسه ماژول مثل customers, marketing_leads, invoices, tasks, products' } },
        required: ['moduleId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'get_field_options',
      title: 'گزینه‌های فیلد انتخابی یا پویا',
      description: 'دریافت فهرست مقادیر معتبر (value و label) برای فیلدهای select، status یا dynamic_options یک ماژول.',
      inputSchema: {
        type: 'object',
        properties: {
          moduleId: { type: 'string' },
          field: { type: 'string' },
        },
        required: ['moduleId', 'field'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'query_records',
      title: 'جستجو و خواندن رکوردها',
      description: 'خواندن صفحه‌بندی‌شده و فیلترشدهٔ رکوردهای مجاز یک ماژول مطابق دسترسی نقش و محدودهٔ رکورد کاربر. برای ادامه از nextAfterId استفاده کنید.',
      inputSchema: {
        ...AGENT_DATA_TOOLS[0].function.parameters,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'get_record',
      title: 'دریافت جزئیات یک رکورد',
      description: 'خواندن جزئیات کامل یک رکورد مجاز با id یا system_code، همراه با فیلدهای مجاز کاربر.',
      inputSchema: {
        type: 'object',
        properties: {
          moduleId: { type: 'string' },
          id: { type: 'string', description: 'شناسه UUID رکورد' },
          systemCode: { type: 'string', description: 'کد سیستمی رکورد (در صورت نبود id)' },
        },
        required: ['moduleId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'count_records',
      title: 'شمارش دقیق رکوردها',
      description: 'شمارش دقیق رکوردهای مجاز یک ماژول مطابق با شرط‌ها و محدودهٔ دسترسی کاربر.',
      inputSchema: {
        ...AGENT_DATA_TOOLS[1].function.parameters,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'aggregate_records',
      title: 'محاسبه جمع و آمار فیلد عددی',
      description: 'محاسبهٔ دقیق مجموع، کمینه و بیشینه روی یک فیلد عددی یا مالی مجاز.',
      inputSchema: {
        ...AGENT_DATA_TOOLS[2].function.parameters,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'list_record_notes',
      title: 'خواندن یادداشت‌ها و گفتگوهای رکورد',
      description: 'خواندن یادداشت‌ها و پیام‌های ثبت‌شده روی یک رکورد مجاز.',
      inputSchema: {
        type: 'object',
        properties: {
          moduleId: { type: 'string' },
          recordId: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['moduleId', 'recordId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];

  const writeTools = canWrite
    ? [
        {
          name: 'create_record',
          title: 'ثبت رکورد جدید',
          description: 'ایجاد رکورد جدید در ماژول مجاز، با اعتبارسنجی فیلدهای اجباری و رعایت دسترسی پلن و فیلدهای نقش کاربر.',
          inputSchema: {
            type: 'object',
            properties: {
              moduleId: { type: 'string' },
              fields: { type: 'object', description: 'مقادیر فیلدها و جدول‌های ردیفی مجاز' },
            },
            required: ['moduleId', 'fields'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        },
        {
          name: 'update_record',
          title: 'ویرایش رکورد موجود',
          description: 'به‌روزرسانی فیلدهای مجاز یک رکورد موجود پس از بررسی دسترسی رکورد و دسترسی ویرایش فیلد.',
          inputSchema: {
            type: 'object',
            properties: {
              moduleId: { type: 'string' },
              id: { type: 'string' },
              fields: { type: 'object', description: 'فقط فیلدهایی که باید تغییر کنند' },
            },
            required: ['moduleId', 'id', 'fields'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        {
          name: 'delete_record',
          title: 'حذف رکورد',
          description: 'حذف یک رکورد موجود (فقط در صورت داشتن مجوز صریح حذف در ماژول و دسترسی به خود رکورد).',
          inputSchema: {
            type: 'object',
            properties: {
              moduleId: { type: 'string' },
              id: { type: 'string' },
            },
            required: ['moduleId', 'id'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
        },
        {
          name: 'add_record_note',
          title: 'ثبت یادداشت روی رکورد',
          description: 'افزودن یادداشت کاری یا توضیح به یک رکورد مجاز با نام کاربر جاری.',
          inputSchema: {
            type: 'object',
            properties: {
              moduleId: { type: 'string' },
              recordId: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['moduleId', 'recordId', 'content'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        },
      ]
    : [];

  return [...readTools, ...writeTools];
};

export const executeMcpTool = async (
  auth: McpAuthContext,
  storage: McpStorageAdapter,
  toolName: string,
  args: Record<string, any> = {},
): Promise<any> => {
  if (!isMcpPlanFeatureEnabled(auth.planContext, 'mcp_access')) {
    throw new Error('دسترسی اتصال MCP در پلن فعلی سازمان شما فعال نیست.');
  }

  const dataAccess = buildMcpDataAccess(auth);
  const canWrite = !auth.isReadonlyOrg && auth.scopes.includes('mcp:write');

  if (toolName === 'get_my_context') {
    return {
      organization: {
        name: auth.orgName,
        readonly: auth.isReadonlyOrg,
      },
      user: {
        name: auth.userName,
        email: auth.userEmail,
        role: auth.roleName || auth.softwareRole || 'کاربر',
        isOwner: auth.isOwner,
      },
      scopes: auth.scopes,
      canWrite,
      enabledFeatures: Object.entries(auth.planContext?.features || {})
        .filter(([, val]) => truthyPlanValue(val))
        .map(([key]) => key)
        .sort(),
      moduleCount: dataAccess.modules.length,
    };
  }

  if (toolName === 'list_modules') {
    return {
      modules: dataAccess.modules.map((mod) => {
        const perm = getMcpModulePermission(auth.permissions, mod.id);
        return {
          moduleId: mod.id,
          label: mod.label,
          recordScope: mod.recordScope,
          canCreate: canWrite && canMcpCreateModule(perm),
          canEdit: canWrite && canMcpEditModule(perm),
          canDelete: canWrite && canMcpDeleteModule(perm),
        };
      }),
    };
  }

  if (toolName === 'describe_module') {
    const moduleId = String(args?.moduleId || '').trim();
    const mod = dataAccess.modules.find((m) => m.id === moduleId);
    if (!mod) throw new Error('ماژول درخواستی در محدودهٔ دسترسی پلن یا نقش شما نیست.');
    const perm = getMcpModulePermission(auth.permissions, moduleId);
    const schema = await loadWritableSchemaForMcp(auth, storage, moduleId);
    return {
      moduleId,
      label: mod.label,
      recordScope: mod.recordScope,
      permissions: {
        view: true,
        create: canWrite && canMcpCreateModule(perm),
        edit: canWrite && canMcpEditModule(perm),
        delete: canWrite && canMcpDeleteModule(perm),
      },
      fields: mod.fields.map((field) => {
        const writableDef = (schema.fields || []).find((f: any) => f.key === field.key);
        return {
          key: field.key,
          label: field.label,
          type: field.type,
          required: writableDef?.required === true,
          canCreate: canWrite && canMcpCreateModule(perm) && !isMcpFieldDenied(perm, field.key, 'create'),
          canEdit: canWrite && canMcpEditModule(perm) && !isMcpFieldDenied(perm, field.key, 'edit'),
          options: writableDef?.options?.slice(0, 60) || undefined,
          relationTargetModule: writableDef?.relationTargetModule || undefined,
        };
      }),
      tables: (schema.tables || []).map((t: any) => ({
        key: t.key,
        label: t.label,
        columns: (t.columns || []).map((c: any) => ({ key: c.key, label: c.label, type: c.type })),
      })),
    };
  }

  if (toolName === 'get_field_options') {
    const moduleId = String(args?.moduleId || '').trim();
    const fieldKey = String(args?.field || '').trim();
    const schema = await loadWritableSchemaForMcp(auth, storage, moduleId);
    const field = (schema.fields || []).find((f: any) => f.key === fieldKey);
    if (!field) throw new Error('فیلد انتخابی در دسترس نیست.');
    return {
      moduleId,
      field: fieldKey,
      label: field.label,
      options: field.options || [],
    };
  }

  if (toolName === 'query_records') {
    return await readAgentDataPage(dataAccess, args as any, async (table, params) => {
      const mod = dataAccess.modules.find((m) => m.table === table);
      const rows = await storage.select(table, params);
      if (!mod) return rows;
      const perm = getMcpModulePermission(auth.permissions, mod.id);
      return rows.map((row) => sanitizeRowForMcp(row, perm));
    });
  }

  if (toolName === 'get_record') {
    const moduleId = String(args?.moduleId || '').trim();
    const mod = dataAccess.modules.find((m) => m.id === moduleId);
    if (!mod) throw new Error('ماژول درخواستی در محدودهٔ دسترسی شما نیست.');
    const perm = getMcpModulePermission(auth.permissions, moduleId);
    const id = String(args?.id || '').trim();
    const systemCode = String(args?.systemCode || '').trim();
    if (!id && !systemCode) throw new Error('شناسه رکورد (id) یا کد سیستمی (systemCode) را مشخص کنید.');
    if (id && !isUuid(id)) throw new Error('شناسه رکورد معتبر نیست.');

    const params: Record<string, string | number> = {
      org_id: `eq.${auth.orgId}`,
      select: '*',
      limit: 1,
    };
    if (id) params.id = `eq.${id}`;
    else params.system_code = `eq.${systemCode}`;

    const rows = await storage.select(mod.table, params);
    const row = rows[0];
    if (!row || !canMcpAccessRecord(row, auth, mod.recordScope, perm)) {
      throw new Error('رکورد مورد نظر پیدا نشد یا در محدودهٔ دسترسی شما نیست.');
    }
    const sanitized = sanitizeRowForMcp(row, perm);
    return {
      moduleId,
      label: mod.label,
      display: describeAiRecord(sanitized),
      record: sanitized,
    };
  }

  if (toolName === 'count_records') {
    return await countAgentData(dataAccess, args as any, (table, params) => storage.count(table, params));
  }

  if (toolName === 'aggregate_records') {
    return await aggregateAgentData(dataAccess, args as any, (table, params) => storage.select(table, params));
  }

  if (toolName === 'list_record_notes') {
    const moduleId = String(args?.moduleId || '').trim();
    const recordId = String(args?.recordId || '').trim();
    if (!isUuid(recordId)) throw new Error('شناسه رکورد معتبر نیست.');
    const mod = dataAccess.modules.find((m) => m.id === moduleId);
    if (!mod) throw new Error('ماژول درخواستی در محدودهٔ دسترسی شما نیست.');
    const perm = getMcpModulePermission(auth.permissions, moduleId);
    const rows = await storage.select(mod.table, { org_id: `eq.${auth.orgId}`, id: `eq.${recordId}`, select: '*', limit: 1 });
    if (!rows[0] || !canMcpAccessRecord(rows[0], auth, mod.recordScope, perm)) {
      throw new Error('دسترسی به این رکورد تأیید نشد.');
    }
    const limit = Math.min(50, Math.max(1, Number(args?.limit) || 20));
    const notes = await storage.select('notes', {
      org_id: `eq.${auth.orgId}`,
      module_id: `eq.${moduleId}`,
      record_id: `eq.${recordId}`,
      select: 'id,content,author_name,created_at',
      order: 'created_at.desc',
      limit,
    });
    return { moduleId, recordId, notes };
  }

  if (!canWrite) {
    throw new Error(auth.isReadonlyOrg
      ? 'حساب سازمان در حالت فقط‌خواندنی است و عملیات تغییر مجاز نیست.'
      : 'توکن فعلی فقط دسترسی خواندنی (mcp:read) دارد.');
  }

  if (toolName === 'create_record') {
    const moduleId = String(args?.moduleId || '').trim();
    const perm = getMcpModulePermission(auth.permissions, moduleId);
    if (!canMcpViewModule(auth.planContext, auth.permissions, moduleId, auth.isOwner) || !canMcpCreateModule(perm)) {
      throw new Error('اجازهٔ ایجاد رکورد جدید در این ماژول را ندارید.');
    }
    const schema = await loadWritableSchemaForMcp(auth, storage, moduleId);
    const rawFields = args?.fields && typeof args.fields === 'object' && !Array.isArray(args.fields) ? args.fields : {};
    const sanitized = sanitizeWriteFields(rawFields, schema, perm, 'create');

    const optionPrep = prepareAiRecordOptions([{ fields: sanitized }], schema, canAddAiDynamicOption(perm));
    if (optionPrep.questions.length) {
      throw new Error(optionPrep.questions.join('\n'));
    }
    const requiredQuestions = getAiRecordRequiredQuestions(optionPrep.records, optionPrep.schema, false);
    if (requiredQuestions.length) {
      throw new Error(requiredQuestions.join('\n'));
    }
    if (optionPrep.proposals.length && storage.upsert) {
      for (const opt of optionPrep.proposals) {
        await storage.upsert('dynamic_options', [{
          org_id: auth.orgId,
          category: opt.category,
          label: opt.label,
          value: opt.value,
          is_active: true,
        }], 'org_id,category,value');
      }
    }

    const finalFields = optionPrep.records[0]?.fields || sanitized;
    const inserted = await storage.insert(getModuleTable(moduleId), [{
      org_id: auth.orgId,
      created_by: auth.userId,
      ...finalFields,
    }]);
    const created = inserted[0];
    if (!created) throw new Error('ثبت رکورد انجام نشد.');
    const safeCreated = sanitizeRowForMcp(created, perm);
    return {
      moduleId,
      created: true,
      display: describeAiRecord(safeCreated),
      record: safeCreated,
    };
  }

  if (toolName === 'update_record') {
    const moduleId = String(args?.moduleId || '').trim();
    const id = String(args?.id || '').trim();
    if (!isUuid(id)) throw new Error('شناسه رکورد معتبر نیست.');
    const perm = getMcpModulePermission(auth.permissions, moduleId);
    if (!canMcpViewModule(auth.planContext, auth.permissions, moduleId, auth.isOwner) || !canMcpEditModule(perm)) {
      throw new Error('اجازهٔ ویرایش رکورد در این ماژول را ندارید.');
    }
    const table = getModuleTable(moduleId);
    const existingRows = await storage.select(table, { org_id: `eq.${auth.orgId}`, id: `eq.${id}`, select: '*', limit: 1 });
    const existing = existingRows[0];
    if (!existing || !canMcpAccessRecord(existing, auth, getMcpRecordScope(perm), perm)) {
      throw new Error('رکورد مورد نظر پیدا نشد یا اجازهٔ ویرایش آن را ندارید.');
    }
    const schema = await loadWritableSchemaForMcp(auth, storage, moduleId);
    const rawFields = args?.fields && typeof args.fields === 'object' && !Array.isArray(args.fields) ? args.fields : {};
    if (Object.keys(rawFields).length === 0) throw new Error('هیچ فیلدی برای ویرایش ارسال نشده است.');
    const sanitized = sanitizeWriteFields(rawFields, schema, perm, 'edit');

    const optionPrep = prepareAiRecordOptions([{ record_id: id, fields: sanitized, original: existing }], schema, canAddAiDynamicOption(perm));
    if (optionPrep.questions.length) throw new Error(optionPrep.questions.join('\n'));
    if (optionPrep.proposals.length && storage.upsert) {
      for (const opt of optionPrep.proposals) {
        await storage.upsert('dynamic_options', [{
          org_id: auth.orgId,
          category: opt.category,
          label: opt.label,
          value: opt.value,
          is_active: true,
        }], 'org_id,category,value');
      }
    }

    const finalFields = optionPrep.records[0]?.fields || sanitized;
    const patched = await storage.patch(table, { org_id: `eq.${auth.orgId}`, id: `eq.${id}` }, {
      ...finalFields,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    });
    const updated = patched[0];
    if (!updated) throw new Error('ویرایش رکورد انجام نشد.');
    const safeUpdated = sanitizeRowForMcp(updated, perm);
    return {
      moduleId,
      updated: true,
      display: describeAiRecord(safeUpdated),
      record: safeUpdated,
    };
  }

  if (toolName === 'delete_record') {
    const moduleId = String(args?.moduleId || '').trim();
    const id = String(args?.id || '').trim();
    if (!isUuid(id)) throw new Error('شناسه رکورد معتبر نیست.');
    const perm = getMcpModulePermission(auth.permissions, moduleId);
    if (!canMcpViewModule(auth.planContext, auth.permissions, moduleId, auth.isOwner) || !canMcpDeleteModule(perm)) {
      throw new Error('اجازهٔ حذف رکورد در این ماژول را ندارید.');
    }
    const table = getModuleTable(moduleId);
    const existingRows = await storage.select(table, { org_id: `eq.${auth.orgId}`, id: `eq.${id}`, select: '*', limit: 1 });
    const existing = existingRows[0];
    if (!existing || !canMcpAccessRecord(existing, auth, getMcpRecordScope(perm), perm)) {
      throw new Error('رکورد مورد نظر پیدا نشد یا اجازهٔ حذف آن را ندارید.');
    }
    await storage.remove(table, { org_id: `eq.${auth.orgId}`, id: `eq.${id}` });
    return { moduleId, deleted: true, id };
  }

  if (toolName === 'add_record_note') {
    const moduleId = String(args?.moduleId || '').trim();
    const recordId = String(args?.recordId || '').trim();
    const content = String(args?.content || '').trim();
    if (!isUuid(recordId)) throw new Error('شناسه رکورد معتبر نیست.');
    if (!content || content.length > 8000) throw new Error('متن یادداشت نامعتبر یا بیش از حد طولانی است.');
    const mod = dataAccess.modules.find((m) => m.id === moduleId);
    if (!mod) throw new Error('ماژول درخواستی در محدودهٔ دسترسی شما نیست.');
    const perm = getMcpModulePermission(auth.permissions, moduleId);
    if (perm?.fields?.__notes_create === false) {
      throw new Error('اجازهٔ ثبت یادداشت روی رکوردهای این ماژول را ندارید.');
    }
    const rows = await storage.select(mod.table, { org_id: `eq.${auth.orgId}`, id: `eq.${recordId}`, select: '*', limit: 1 });
    if (!rows[0] || !canMcpAccessRecord(rows[0], auth, mod.recordScope, perm)) {
      throw new Error('دسترسی به این رکورد تأیید نشد.');
    }
    const inserted = await storage.insert('notes', [{
      org_id: auth.orgId,
      module_id: moduleId,
      record_id: recordId,
      content,
      author_id: auth.userId,
      author_name: auth.userName,
      source_type: 'user',
    }]);
    return { created: true, note: inserted[0] || null };
  }

  throw new Error(`ابزار «${toolName}» وجود ندارد.`);
};

export const handleMcpJsonRpcMessage = async (
  message: any,
  auth: McpAuthContext,
  storage: McpStorageAdapter,
): Promise<Record<string, any> | null> => {
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return {
      jsonrpc: '2.0',
      id: message?.id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request' },
    };
  }

  const hasId = message.id !== undefined && message.id !== null;
  const method = message.method;
  const params = message.params && typeof message.params === 'object' ? message.params : {};

  if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
    return null;
  }

  if (method === 'ping') {
    return hasId ? { jsonrpc: '2.0', id: message.id, result: {} } : null;
  }

  if (method === 'initialize') {
    const requestedVersion = String(params.protocolVersion || '');
    const protocolVersion = (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requestedVersion)
      ? requestedVersion
      : MCP_SUPPORTED_PROTOCOL_VERSIONS[0];
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: MCP_SERVER_INFO,
        instructions: `این سرور به فضای کاری «${auth.orgName}» متصل است. همهٔ داده‌ها و عملیات دقیقاً مطابق دسترسی پلن سازمان و نقش کاربری «${auth.userName}» اعمال می‌شوند.`,
      },
    };
  }

  if (method === 'resources/list') {
    return { jsonrpc: '2.0', id: message.id, result: { resources: [] } };
  }

  if (method === 'prompts/list') {
    return { jsonrpc: '2.0', id: message.id, result: { prompts: [] } };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: { tools: getMcpToolsDefinition(auth) },
    };
  }

  if (method === 'tools/call') {
    const toolName = String(params.name || '').trim();
    const toolArgs = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
    try {
      const output = await executeMcpTool(auth, storage, toolName, toolArgs);
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
          isError: false,
        },
      };
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: String(error?.message || 'اجرای ابزار ناموفق بود.') }],
          isError: true,
        },
      };
    }
  }

  return hasId
    ? { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${method}` } }
    : null;
};
