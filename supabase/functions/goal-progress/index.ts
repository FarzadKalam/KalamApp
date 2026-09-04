// @ts-nocheck
// مسیر سروری واکشی و فیلتر هدف‌ها. ارزیابی شرط‌ها از همان قرارداد مشترک
// workflow-interval-runner استفاده می‌کند تا نتیجهٔ اهداف و گردش‌کارها هم‌معنا باشد.

import {
  evaluateWorkflowConditionCollectionWithResolver,
  evaluateWorkflowConditionWithResolver,
} from "./_runtime-deps/workflowConditionRuntime.ts";
import {
  getOfficialCalendarEventsForDate,
  isFridayAtTehranDate,
} from "../_shared/persian-calendar-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });

const PAGE_SIZE = 1000;
const ROW_CACHE_TTL_MS = 60_000;
const ROW_CACHE_MAX_ENTRIES = 240;
const rowCache = new Map<string, { expiresAt: number; rows: any[] }>();
const rowPromises = new Map<string, Promise<any[]>>();
const orgModuleFieldConfigCache = new Map<string, Promise<{ fields: Map<string, any>; tableFields: Map<string, any> }>>();
const dynamicOptionLabelCache = new Map<string, Promise<string | null>>();
const dynamicOptionValueCache = new Map<string, Promise<string | null>>();
const identityLabelCache = new Map<string, Promise<string | null>>();

const safeTableName = (value: unknown) =>
  /^[a-z][a-z0-9_]*$/.test(String(value || "").trim());
const safeRecordId = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
const safeColumns = (value: unknown) =>
  String(value || "")
    .split(",")
    .map((column) => column.trim())
    .filter((column) => /^[a-z][a-z0-9_]*$/.test(column));

const toEnglishDigits = (value: unknown) =>
  String(value ?? "")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
const getHolidayEvents = async (value: unknown): Promise<any[]> => {
  const lookup = await getOfficialCalendarEventsForDate(value);
  return lookup.events;
};
const occasionValues = (value: any): string[] =>
  (Array.isArray(value) ? value : [value])
    .flatMap((item) =>
      item && typeof item === "object"
        ? [item.value, item.label, item.title, item.event]
        : [item],
    )
    .map((item) => toEnglishDigits(item).trim().toLocaleLowerCase("fa-IR"))
    .filter(Boolean);
const dateHasOccasion = async (value: unknown, expected: unknown) => {
  const values = occasionValues(expected);
  if (values.length === 0) return false;
  const titles = (await getHolidayEvents(value))
    .map((event) =>
      toEnglishDigits(event?.event).trim().toLocaleLowerCase("fa-IR"),
    )
    .filter(Boolean);
  return titles.some((title) =>
    values.some(
      (candidate) =>
        title === candidate ||
        title.includes(candidate) ||
        candidate.includes(title),
    ),
  );
};

const WORKFLOW_RELATED_FIELD_PREFIX = "__workflow_related__";
const WORKFLOW_MULTI_RELATION_PREFIX = "__workflow_multi_relation__";
const PROCESS_LINKED_FIELD_PREFIX = "__linked__";
const TASK_PROCESS_FIELD_PREFIX = "__report_task_process_field__";
const SURVEY_TEMPLATE_FIELD_PREFIX = "__survey_template__::";
const REPORT_TABLE_FIELD_PREFIX = "__report_table_field__";
const REPORT_TABLE_RELATION_FIELD_PREFIX = "__report_table_relation_field__";

const getOrgModuleFieldConfigs = async (
  url: string,
  headers: Record<string, string>,
  orgId: string,
  moduleId: string,
) => {
  const cacheKey = `${orgId}:${moduleId}`;
  if (!orgModuleFieldConfigCache.has(cacheKey)) {
    orgModuleFieldConfigCache.set(cacheKey, (async () => {
      const query = new URL(`${url}/rest/v1/integration_settings`);
      query.searchParams.set("select", "settings");
      query.searchParams.set("org_id", `eq.${orgId}`);
      query.searchParams.set("connection_type", "eq.module_settings");
      query.searchParams.set("is_active", "eq.true");
      query.searchParams.set("order", "updated_at.desc");
      query.searchParams.set("limit", "1");
      const response = await fetch(query, { headers });
      const settings = response.ok ? (await response.json())?.[0]?.settings : null;
      const schema = settings?.modules?.[moduleId]?.schema || {};
      const fields = Array.isArray(schema?.fields) ? schema.fields : [];
      const blocks = Array.isArray(schema?.blocks) ? schema.blocks : [];
      const columns = blocks.flatMap((block: any) => Array.isArray(block?.tableColumns) ? block.tableColumns : []);
      const tableFields = new Map(blocks.flatMap((block: any) =>
        (Array.isArray(block?.tableColumns) ? block.tableColumns : []).map((field: any) => [
          `${String(block?.id || "").trim()}::${String(field?.key || "").trim()}`,
          field,
        ] as const)
      ).filter(([fieldKey]) => fieldKey !== "::"));
      return {
        fields: new Map([...fields, ...columns]
        .map((field: any) => [String(field?.key || "").trim(), field] as const)
        .filter(([fieldKey]) => !!fieldKey)),
        tableFields,
      };
    })());
  }
  return orgModuleFieldConfigCache.get(cacheKey)!;
};

const findOptionLabel = (options: any, value: unknown) => {
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedValue || !Array.isArray(options)) return null;
  const option = options.find((item: any) => String(item?.value ?? "").trim() === normalizedValue);
  return String(option?.label ?? "").trim() || null;
};

const getDynamicOptionLabel = async (
  url: string,
  headers: Record<string, string>,
  orgId: string,
  category: string,
  value: unknown,
) => {
  const normalizedValue = String(value ?? "").trim();
  if (!orgId || !category || !normalizedValue) return null;
  const cacheKey = `${orgId}:${category}:${normalizedValue}`;
  if (!dynamicOptionLabelCache.has(cacheKey)) {
    dynamicOptionLabelCache.set(cacheKey, (async () => {
      const query = new URL(`${url}/rest/v1/dynamic_options`);
      query.searchParams.set("select", "label");
      query.searchParams.set("org_id", `eq.${orgId}`);
      query.searchParams.set("category", `eq.${category}`);
      query.searchParams.set("value", `eq.${normalizedValue}`);
      query.searchParams.set("is_active", "eq.true");
      query.searchParams.set("limit", "1");
      const response = await fetch(query, { headers });
      return response.ok ? String((await response.json())?.[0]?.label || "").trim() || null : null;
    })());
  }
  return dynamicOptionLabelCache.get(cacheKey)!;
};

const getDynamicOptionValueByLabel = async (
  url: string,
  headers: Record<string, string>,
  orgId: string,
  category: string,
  label: unknown,
) => {
  const normalizedLabel = String(label ?? "").trim();
  if (!orgId || !category || !normalizedLabel) return null;
  const cacheKey = `${orgId}:${category}:label:${normalizedLabel}`;
  if (!dynamicOptionValueCache.has(cacheKey)) {
    dynamicOptionValueCache.set(cacheKey, (async () => {
      const query = new URL(`${url}/rest/v1/dynamic_options`);
      query.searchParams.set("select", "value");
      query.searchParams.set("org_id", `eq.${orgId}`);
      query.searchParams.set("category", `eq.${category}`);
      query.searchParams.set("label", `eq.${normalizedLabel}`);
      query.searchParams.set("is_active", "eq.true");
      query.searchParams.set("limit", "1");
      const response = await fetch(query, { headers });
      return response.ok ? String((await response.json())?.[0]?.value || "").trim() || null : null;
    })());
  }
  return dynamicOptionValueCache.get(cacheKey)!;
};

const getIdentityLabel = async (
  url: string,
  headers: Record<string, string>,
  orgId: string,
  identity: unknown,
) => {
  const token = String(identity ?? "").trim();
  const [kind, id] = token.split(":", 2);
  if ((kind !== "user" && kind !== "role") || !safeRecordId(id)) return null;
  const cacheKey = `${orgId}:${token}`;
  if (!identityLabelCache.has(cacheKey)) {
    identityLabelCache.set(cacheKey, (async () => {
      const table = kind === "user" ? "profiles" : "org_roles";
      const query = new URL(`${url}/rest/v1/${table}`);
      query.searchParams.set("select", kind === "user" ? "full_name,display_name" : "title,name");
      query.searchParams.set("org_id", `eq.${orgId}`);
      query.searchParams.set("id", `eq.${id}`);
      query.searchParams.set("limit", "1");
      const response = await fetch(query, { headers });
      const row = response.ok ? (await response.json())?.[0] : null;
      return String(row?.display_name || row?.full_name || row?.title || row?.name || "").trim() || null;
    })());
  }
  return identityLabelCache.get(cacheKey)!;
};

const parseLooseObject = (value: any): Record<string, any> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
const normalizeTaskStatusConditionForRecord = (condition: any, record: any) => {
  if (String(condition?.field || "").trim() !== "status") return condition;
  const recurrence = parseLooseObject(record?.recurrence_info);
  const options = Array.isArray(recurrence?.process_task_status_options)
    ? recurrence.process_task_status_options
    : [];
  const resolve = (candidate: any) => {
    const raw = String(candidate ?? "").trim();
    if (!raw) return candidate;
    const match = options.find((option: any) => (
      String(option?.value || "").trim() === raw
      || String(option?.label || "").trim() === raw
    ));
    return match?.value ?? candidate;
  };
  const rawValue = condition?.value;
  return { ...condition, value: Array.isArray(rawValue) ? rawValue.map(resolve) : resolve(rawValue) };
};

const getFieldValue = (
  record: Record<string, any> | null | undefined,
  field: string,
) => {
  if (!record) return null;
  if (Object.prototype.hasOwnProperty.call(record, field)) return record[field];
  return field.split(".").reduce((value, key) => value?.[key], record as any);
};
const parseRelatedField = (value: string) => {
  const parts = String(value || "")
    .trim()
    .startsWith(WORKFLOW_RELATED_FIELD_PREFIX)
    ? String(value).slice(WORKFLOW_RELATED_FIELD_PREFIX.length).split("::")
    : [];
  return parts.length >= 3 && parts.every(Boolean)
    ? {
        relationFieldKey: parts[0],
        targetModuleId: parts[1],
        targetFieldKey: parts[2],
      }
    : null;
};
const parseMultiRelationField = (value: string) => {
  const parts = String(value || "")
    .trim()
    .startsWith(WORKFLOW_MULTI_RELATION_PREFIX)
    ? String(value).slice(WORKFLOW_MULTI_RELATION_PREFIX.length).split("::")
    : [];
  return parts.length >= 3 && parts.every(Boolean)
    ? { fieldKey: parts[0], targetModuleId: parts[1], targetFieldKey: parts[2] }
    : null;
};
const normalizeIds = (value: any): string[] => {
  if (Array.isArray(value)) return value.flatMap(normalizeIds);
  if (value && typeof value === "object")
    return [value.id, value.value, value.record_id].map(String).filter(Boolean);
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      return normalizeIds(JSON.parse(value));
    } catch {
      /* direct id below */
    }
  }
  return value === null || value === undefined || value === ""
    ? []
    : [String(value)];
};
const parseObject = (value: any): Record<string, any> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
};
const resolveTable = (moduleId: string) =>
  (
    ({
      productBundles: "product_bundles",
      purchaseInvoices: "purchase_invoices",
      priceLists: "price_lists",
      marketingLeads: "marketing_leads",
      deliveryForms: "delivery_forms",
      salesCatalog: "sales_catalog",
      stockTransfers: "stock_transfers",
      productionBOM: "production_bom",
      productionOrders: "production_orders",
      productionGroupOrders: "production_group_orders",
      fiscalYears: "fiscal_years",
      chartOfAccounts: "chart_of_accounts",
      journalEntries: "journal_entries",
      accountingEventRules: "accounting_event_rules",
      costCenters: "cost_centers",
      cashBoxes: "cash_boxes",
      bankAccounts: "bank_accounts",
      pettyFunds: "petty_funds",
      cashBankOperations: "cash_bank_operations",
      expenseDocuments: "expense_documents",
      attendanceLogs: "attendance_logs",
      workSchedules: "work_schedules",
      leaveRequests: "leave_requests",
      overtimeRequests: "overtime_requests",
      missionRequests: "mission_requests",
      employeeAdvances: "employee_advances",
      employeeBonusRequests: "employee_bonus_requests",
      employeePenaltyRequests: "employee_penalty_requests",
      employeeContracts: "employee_contracts",
      jobDescriptions: "job_descriptions",
      payrollSlips: "payroll_slips",
      recruitmentApplicants: "recruitment_applicants",
      processTemplates: "process_templates",
      processRuns: "process_runs",
      webForms: "web_forms",
      secretariatDocuments: "secretariat_documents",
      smsDeliveryReports: "sms_delivery_reports",
      voipCallReports: "voip_call_reports",
      automationExecutionReports: "automation_execution_reports",
      counterpartyBotGroups: "counterparty_bot_groups",
    }) as Record<string, string>
  )[moduleId] || moduleId;

const getConditionResolver = ({ url, headers, orgId, moduleId }: any) => {
  const relatedCache = new Map<string, Promise<Record<string, any> | null>>();
  const tagCache = new Map<string, Promise<string[]>>();
  const processLinkCache = new Map<string, Promise<string | null>>();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  ).trim();
  const internalHeaders = serviceRoleKey
    ? { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` }
    : headers;
  const fetchRelated = (targetModuleId: string, id: string) => {
    const table = resolveTable(targetModuleId);
    const cacheKey = `${table}:${id}`;
    if (!relatedCache.has(cacheKey))
      relatedCache.set(
        cacheKey,
        (async () => {
          if (!safeTableName(table) || !id) return null;
          const query = new URL(`${url}/rest/v1/${table}`);
          query.searchParams.set("select", "*");
          query.searchParams.set("id", `eq.${id}`);
          query.searchParams.set("org_id", `eq.${orgId}`);
          query.searchParams.set("limit", "1");
          const response = await fetch(query, { headers: internalHeaders });
          if (!response.ok) return null;
          return (await response.json())?.[0] || null;
        })(),
      );
    return relatedCache.get(cacheKey)!;
  };
  const fetchTags = (targetModuleId: string, id: string) => {
    const cacheKey = `${targetModuleId}:${id}`;
    if (!tagCache.has(cacheKey))
      tagCache.set(
        cacheKey,
        (async () => {
          if (!targetModuleId || !id) return [];
          const query = new URL(`${url}/rest/v1/record_tags`);
          query.searchParams.set("select", "tag_id");
          query.searchParams.set("module_id", `eq.${targetModuleId}`);
          query.searchParams.set("record_id", `eq.${id}`);
          query.searchParams.set("org_id", `eq.${orgId}`);
          const response = await fetch(query, { headers: internalHeaders });
          if (!response.ok) return [];
          return Array.from(
            new Set(
              (await response.json())
                .map((row: any) => String(row?.tag_id || "").trim())
                .filter(Boolean),
            ),
          );
        })(),
      );
    return tagCache.get(cacheKey)!;
  };
  const assignee = (record: any) =>
    String(record?.assignee_type || "").toLowerCase() === "role" ||
    record?.assignee_role_id
      ? record?.assignee_role_id || record?.assignee_id
        ? `role:${record?.assignee_role_id || record?.assignee_id}`
        : null
      : record?.assignee_id
        ? `user:${record.assignee_id}`
        : null;
  const resolveProcessLinkId = (record: any, linkedModuleId: string) => {
    const recurrence = parseObject(record?.recurrence_info);
    const direct = String(
      parseObject(record?.process_links)?.[linkedModuleId] ||
        parseObject(record?.process_link_map)?.[linkedModuleId] ||
        parseObject(recurrence?.process_links)?.[linkedModuleId] ||
        record?.[`__linked__${linkedModuleId}__id`] ||
        "",
    ).trim();
    const processRunId = String(
      record?.process_run_id || recurrence?.process_run_id || "",
    ).trim();
    if (!processRunId || !linkedModuleId)
      return Promise.resolve(direct || null);
    const cacheKey = `${processRunId}:${linkedModuleId}`;
    if (!processLinkCache.has(cacheKey))
      processLinkCache.set(
        cacheKey,
        (async () => {
          const query = new URL(`${url}/rest/v1/process_run_links`);
          query.searchParams.set("select", "record_id");
          query.searchParams.set("org_id", `eq.${orgId}`);
          query.searchParams.set("process_run_id", `eq.${processRunId}`);
          query.searchParams.set("module_id", `eq.${linkedModuleId}`);
          query.searchParams.set("order", "is_primary.desc,created_at.asc");
          query.searchParams.set("limit", "1");
          const response = await fetch(query, { headers: internalHeaders });
          if (!response.ok) return null;
          return (
            String((await response.json())?.[0]?.record_id || "").trim() || null
          );
        })(),
      );
    return processLinkCache
      .get(cacheKey)!
      .then((canonicalLinkId) => canonicalLinkId || direct || null);
  };
  const resolveTaskProcessField = (fieldKey: string, record: any) => {
    if (!fieldKey.startsWith(TASK_PROCESS_FIELD_PREFIX)) return null;
    const [templateId, processNodeKey, customFieldKey] = fieldKey
      .slice(TASK_PROCESS_FIELD_PREFIX.length)
      .split("::");
    if (!templateId || !processNodeKey || !customFieldKey) return null;
    const recurrence = parseObject(record?.recurrence_info);
    const group = parseObject(recurrence?.process_group);
    const actualTemplateId = String(
      record?.source_template_id || group?.template_id || "",
    ).trim();
    const actualNodeKey = String(
      record?.process_node_key || recurrence?.process_node_key || "",
    ).trim();
    if (actualTemplateId !== templateId || actualNodeKey !== processNodeKey)
      return null;
    const fields = Array.isArray(recurrence?.process_task_custom_fields)
      ? recurrence.process_task_custom_fields
      : [];
    if (
      !fields.some(
        (field: any) => String(field?.key || "").trim() === customFieldKey,
      )
    )
      return null;
    return (
      parseObject(recurrence?.process_task_custom_field_values)?.[
        customFieldKey
      ] ?? null
    );
  };
  const getRuntimeFieldConfig = async (fieldKey: string, record: any) => {
    const tableMatch = fieldKey.startsWith(REPORT_TABLE_FIELD_PREFIX)
      ? fieldKey.slice(REPORT_TABLE_FIELD_PREFIX.length).split("::")
      : null;
    const normalizedFieldKey = tableMatch?.[1] || fieldKey;
    const tableRelationMatch = fieldKey.startsWith(REPORT_TABLE_RELATION_FIELD_PREFIX)
      ? fieldKey.slice(REPORT_TABLE_RELATION_FIELD_PREFIX.length).split("::")
      : null;
    const relatedMatch = fieldKey.startsWith(WORKFLOW_RELATED_FIELD_PREFIX)
      ? fieldKey.slice(WORKFLOW_RELATED_FIELD_PREFIX.length).split("::")
      : fieldKey.startsWith(WORKFLOW_MULTI_RELATION_PREFIX)
        ? fieldKey.slice(WORKFLOW_MULTI_RELATION_PREFIX.length).split("::")
        : null;
    const linkedMatch = fieldKey.match(/^__linked__(.+?)__(.+)$/);
    if (fieldKey.startsWith(TASK_PROCESS_FIELD_PREFIX)) {
      const customFieldKey = fieldKey.slice(TASK_PROCESS_FIELD_PREFIX.length).split("::")[2] || "";
      const recurrence = parseObject(record?.recurrence_info);
      return (Array.isArray(recurrence?.process_task_custom_fields) ? recurrence.process_task_custom_fields : [])
        .find((field: any) => String(field?.key || "").trim() === customFieldKey) || null;
    }
    const configModuleId = tableRelationMatch?.[2] || relatedMatch?.[1] || linkedMatch?.[1] || moduleId;
    const configFieldKey = tableRelationMatch?.[3] || relatedMatch?.[2] || linkedMatch?.[2] || normalizedFieldKey;
    const configs = await getOrgModuleFieldConfigs(url, internalHeaders, orgId, configModuleId);
    return tableMatch
      ? configs.tableFields.get(`${String(tableMatch[0] || "").trim()}::${String(tableMatch[1] || "").trim()}`) || configs.fields.get(configFieldKey) || null
      : configs.fields.get(configFieldKey) || null;
  };
  const resolveDisplayValue = async (fieldKey: string, record: any, value: any) => {
    if (value === null || value === undefined || value === "") return "";
    if (Array.isArray(value)) {
      const labels = await Promise.all(value.map((item) => resolveDisplayValue(fieldKey, record, item)));
      return labels.filter(Boolean).join("، ");
    }
    if (fieldKey === "__workflow_assignee") return await getIdentityLabel(url, internalHeaders, orgId, value) || "مسئول تعیین‌شده";
    if (fieldKey === "status") {
      const recurrence = parseObject(record?.recurrence_info);
      const taskLabel = findOptionLabel(recurrence?.process_task_status_options, value)
        || String(record?.status_label || record?.task_status_label || "").trim();
      if (taskLabel) return taskLabel;
    }
    const field = await getRuntimeFieldConfig(fieldKey, record);
    if (String(field?.type || "").toLowerCase() === "user") {
      return await getIdentityLabel(url, internalHeaders, orgId, `user:${String(value || "").trim()}`) || "کاربر انتخاب‌شده";
    }
    const staticLabel = findOptionLabel(field?.options, value);
    if (staticLabel) return staticLabel;
    const category = String(field?.dynamicOptionsCategory || field?.dynamic_options_category || "").trim();
    const dynamicLabel = category
      ? await getDynamicOptionLabel(url, internalHeaders, orgId, category, value)
      : null;
    if (dynamicLabel) return dynamicLabel;
    const text = String(value ?? "").trim();
    return safeRecordId(text) ? "رکورد انتخاب‌شده" : text;
  };
  const normalizeCondition = async (condition: any, record: any) => {
    const statusNormalized = normalizeTaskStatusConditionForRecord(condition, record);
    const fieldKey = String(statusNormalized?.field || "").trim();
    if (!fieldKey || !Object.prototype.hasOwnProperty.call(statusNormalized || {}, "value")) return statusNormalized;
    const field = await getRuntimeFieldConfig(fieldKey, record);
    if (!field) return statusNormalized;
    const resolveOptionValue = async (candidate: any) => {
      const raw = String(candidate ?? "").trim();
      if (!raw) return candidate;
      const staticOption = Array.isArray(field?.options)
        ? field.options.find((option: any) => String(option?.value ?? "").trim() === raw || String(option?.label ?? "").trim() === raw)
        : null;
      if (staticOption?.value !== undefined) return staticOption.value;
      const category = String(field?.dynamicOptionsCategory || field?.dynamic_options_category || "").trim();
      return category ? await getDynamicOptionValueByLabel(url, internalHeaders, orgId, category, raw) || candidate : candidate;
    };
    const rawValue = statusNormalized.value;
    return {
      ...statusNormalized,
      value: Array.isArray(rawValue)
        ? await Promise.all(rawValue.map(resolveOptionValue))
        : await resolveOptionValue(rawValue),
    };
  };
  const resolve = async (fieldKey: string, record: any): Promise<any> => {
    if (!record) return null;
    if (fieldKey === "__workflow_assignee") return assignee(record);
    if (fieldKey === "tags")
      return fetchTags(moduleId, String(record.id || ""));
    if (fieldKey.startsWith(TASK_PROCESS_FIELD_PREFIX))
      return resolveTaskProcessField(fieldKey, record);
    const surveyField = fieldKey.startsWith(SURVEY_TEMPLATE_FIELD_PREFIX)
      ? fieldKey.slice(SURVEY_TEMPLATE_FIELD_PREFIX.length)
      : "";
    if (surveyField)
      return record?.template_field_values?.[surveyField] ?? null;
    const linked = fieldKey.match(/^__linked__(.+?)__(.+)$/);
    if (linked?.[1] && linked?.[2]) {
      const linkedId = await resolveProcessLinkId(record, linked[1]);
      const linkedRecord = linkedId
        ? await fetchRelated(linked[1], linkedId)
        : null;
      if (!linkedRecord) return linked[2] === "tags" ? [] : null;
      if (linked[2] === "__workflow_assignee") return assignee(linkedRecord);
      if (linked[2] === "tags") return fetchTags(linked[1], linkedId);
      return getFieldValue(linkedRecord, linked[2]);
    }
    const related = parseRelatedField(fieldKey);
    if (related) {
      const relatedId = String(
        getFieldValue(record, related.relationFieldKey) || "",
      ).trim();
      const relatedRecord = relatedId
        ? await fetchRelated(related.targetModuleId, relatedId)
        : null;
      if (!relatedRecord) return related.targetFieldKey === "tags" ? [] : null;
      if (related.targetFieldKey === "__workflow_assignee")
        return assignee(relatedRecord);
      if (related.targetFieldKey === "tags")
        return fetchTags(related.targetModuleId, relatedId);
      return getFieldValue(relatedRecord, related.targetFieldKey);
    }
    const multi = parseMultiRelationField(fieldKey);
    if (multi) {
      const records = await Promise.all(
        Array.from(
          new Set(normalizeIds(getFieldValue(record, multi.fieldKey))),
        ).map((id) => fetchRelated(multi.targetModuleId, id)),
      );
      return records.flatMap((relatedRecord) => {
        if (!relatedRecord) return [];
        const value =
          multi.targetFieldKey === "__workflow_assignee"
            ? assignee(relatedRecord)
            : getFieldValue(relatedRecord, multi.targetFieldKey);
        return Array.isArray(value)
          ? value
          : value === null || value === undefined || value === ""
            ? []
            : [value];
      });
    }
    return getFieldValue(record, fieldKey);
  };
  return { resolve, resolveDisplayValue, getRuntimeFieldConfig, normalizeCondition };
};

const evaluateAsyncWorkflowOperator = async ({
  operator,
  currentValue,
  expectedValue,
}: any) => {
  if (operator === "is_friday")
    return isFridayAtTehranDate(currentValue);
  if (operator === "is_official_holiday")
    return (await getHolidayEvents(currentValue)).some(
      (event) => event?.isHoliday === true,
    );
  if (operator === "occasion_eq" || operator === "occasion_contains")
    return dateHasOccasion(currentValue, expectedValue);
  if (operator === "occasion_neq" || operator === "occasion_not_contains")
    return !(await dateHasOccasion(currentValue, expectedValue));
  if (operator === "days_before_occasion") {
    const date = currentValue ? new Date(String(currentValue)) : null;
    const config =
      expectedValue &&
      typeof expectedValue === "object" &&
      !Array.isArray(expectedValue)
        ? expectedValue
        : {};
    const days = Number(config.days ?? config.count ?? 0);
    const occasion = config.occasion ?? config.event ?? config.value;
    if (
      !date ||
      Number.isNaN(date.getTime()) ||
      !Number.isFinite(days) ||
      days < 0 ||
      occasionValues(occasion).length === 0
    )
      return false;
    const target = new Date(date);
    target.setDate(target.getDate() + days);
    return dateHasOccasion(target.toISOString(), occasion);
  }
  return false;
};

const passesConditions = async (
  record: Record<string, any>,
  conditionsAll: any[],
  conditionsAny: any[],
  resolveField: any,
) =>
  evaluateWorkflowConditionCollectionWithResolver({
    conditionsAll,
    conditionsAny,
    evaluate: (condition) =>
      evaluateWorkflowConditionWithResolver({
        condition,
        resolveValues: async () => ({
          currentValue: await resolveField(
            String(condition?.field || ""),
            record,
          ),
        }),
        evaluateAsyncOperator: evaluateAsyncWorkflowOperator,
      }),
  });

const fetchRows = async ({
  url,
  headers,
  table,
  columns,
  orgId,
  dateField,
  startIso,
  endIso,
  cacheKey,
}: any) => {
  const cached = rowCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const pending = rowPromises.get(cacheKey);
  if (pending) return pending;
  const request = (async () => {
    const rows: any[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const query = new URL(`${url}/rest/v1/${table}`);
      query.searchParams.set("select", columns.join(","));
      query.searchParams.set("org_id", `eq.${orgId}`);
      query.searchParams.set(dateField, `gte.${startIso}`);
      query.searchParams.append(dateField, `lte.${endIso}`);
      query.searchParams.set("offset", String(offset));
      query.searchParams.set("limit", String(PAGE_SIZE));
      const response = await fetch(query, { headers });
      if (!response.ok)
        throw new Error(`goal_rows_fetch_failed:${response.status}`);
      const page = await response.json();
      rows.push(...(Array.isArray(page) ? page : []));
      if (!Array.isArray(page) || page.length < PAGE_SIZE) break;
    }
    return rows;
  })();
  rowPromises.set(cacheKey, request);
  try {
    const rows = await request;
    rowCache.set(cacheKey, { rows, expiresAt: Date.now() + ROW_CACHE_TTL_MS });
    while (rowCache.size > ROW_CACHE_MAX_ENTRIES) {
      const oldestKey = rowCache.keys().next().value;
      if (!oldestKey) break;
      rowCache.delete(oldestKey);
    }
    return rows;
  } finally {
    rowPromises.delete(cacheKey);
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return json(405, { error: "method_not_allowed" });
  const authorization = String(
    request.headers.get("authorization") || "",
  ).trim();
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").replace(
    /\/+$/,
    "",
  );
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "");
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  ).trim();
  if (!authorization || !supabaseUrl || !anonKey)
    return json(401, { error: "unauthorized" });

  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const headers = { apikey: anonKey, authorization };
    const output: Record<string, any> = {};
    await Promise.all(
      items.map(async (item: any) => {
        const key = String(item?.key || "").trim();
        try {
          if (item?.kind === "report_conditions") {
            const table = String(item?.table || "").trim();
            const moduleId = String(item?.moduleId || "").trim();
            // فقط Runtime گزارش، که با کلید سرویس فراخوانی می‌شود، اجازه دارد
            // کاندیدهای بازشده از جدول داخلی را بفرستد. فراخوانی عادی همیشه
            // دوباره رکوردهای مجاز را با JWT کاربر می‌خواند.
            const internalReportRuntime =
              !!serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`;
            const reportFieldKeys = internalReportRuntime && Array.isArray(item?.reportFieldKeys)
              ? Array.from(new Set(item.reportFieldKeys
                .map((field: any) => String(field || "").trim())
                .filter((field: string) => safeTableName(field)
                  || field === "tags"
                  || field === "__workflow_assignee"
                  || field.startsWith("__workflow_related__")
                  || field.startsWith("__workflow_multi_relation__")
                  || field.startsWith("__linked__")
                  || field.startsWith(TASK_PROCESS_FIELD_PREFIX)
                  || field.startsWith(SURVEY_TEMPLATE_FIELD_PREFIX)
                  || field.startsWith(REPORT_TABLE_FIELD_PREFIX)
                  || field.startsWith(REPORT_TABLE_RELATION_FIELD_PREFIX))))
                .slice(0, 48)
              : [];
            const recordOverrides =
              internalReportRuntime && Array.isArray(item?.recordOverrides)
                ? item.recordOverrides
                    .filter(
                      (row: any) =>
                        row && typeof row === "object" && safeRecordId(row?.id),
                    )
                    .slice(0, 500)
                : [];
            const recordIds = Array.from(
              new Set(
                (Array.isArray(item?.recordIds) ? item.recordIds : [])
                  .map((id) => String(id || "").trim())
                  .filter(safeRecordId),
              ),
            ).slice(0, 1000);
            const columns = Array.from(
              new Set(["id", "org_id", ...safeColumns(item?.selectColumns)]),
            ).filter(Boolean);
            // Report runtime uses this same resolver for every module.  Keeping the
            // condition evaluator here prevents server reports from drifting away
            // from workflow operators (relations, tags, dates and process fields).
            if (
              !key ||
              !moduleId ||
              !safeTableName(table) ||
              (recordOverrides.length === 0 && recordIds.length === 0)
            ) {
              output[key] = { mode: "fallback" };
              return;
            }
            let rows: any[];
            if (recordOverrides.length > 0) {
              rows = recordOverrides;
            } else {
              const query = new URL(`${supabaseUrl}/rest/v1/${table}`);
              query.searchParams.set("select", columns.join(","));
              query.searchParams.set("id", `in.(${recordIds.join(",")})`);
              query.searchParams.set("limit", String(recordIds.length));
              // فهرست فعالیت‌ها با توکن کاربر خوانده می‌شود تا محدودهٔ دسترسی خودِ فعالیت
              // حفظ شود؛ فقط حل داخلی لینک‌های فرآیند مجاز است از کلید سرویس استفاده کند.
              const response = await fetch(query, { headers });
              if (!response.ok)
                throw new Error(`report_rows_fetch_failed:${response.status}`);
              rows = await response.json();
            }
            const orgId = String(rows?.[0]?.org_id || "").trim();
            if (!orgId) {
              output[key] = { mode: "server", passedIds: [] };
              return;
            }
            const fieldResolver = getConditionResolver({
              url: supabaseUrl,
              headers,
              orgId,
              moduleId,
            });
            const passedIds: string[] = [];
            const resolvedRows: Record<string, Record<string, { value: any; label: string }>> = {};
            for (const row of Array.isArray(rows) ? rows : []) {
              if (String(row?.org_id || "").trim() !== orgId) continue;
              const conditionsAll = await Promise.all((item?.conditionsAll || []).map((condition: any) => fieldResolver.normalizeCondition(condition, row)));
              const conditionsAny = await Promise.all((item?.conditionsAny || []).map((condition: any) => fieldResolver.normalizeCondition(condition, row)));
              if (
                await passesConditions(
                  row,
                  conditionsAll,
                  conditionsAny,
                  fieldResolver.resolve,
                )
              ) {
                const id = String(
                  row?.__report_runtime_key || row?.id || "",
                ).trim();
                if (id) {
                  passedIds.push(id);
                  if (reportFieldKeys.length > 0) {
                    const values = await Promise.all(reportFieldKeys.map(async (fieldKey: string) => {
                      const value = await fieldResolver.resolve(fieldKey, row);
                      const label = await fieldResolver.resolveDisplayValue(fieldKey, row, value);
                      return [fieldKey, { value, label }] as const;
                    }));
                    resolvedRows[id] = Object.fromEntries(values);
                  }
                }
              }
            }
            output[key] = { mode: "server", passedIds, resolvedRows };
            return;
          }
          const goalId = String(item?.goalId || "").trim();
          const table = String(item?.table || "").trim();
          const moduleId = String(item?.moduleId || "").trim();
          const dateField = String(item?.dateField || "").trim();
          const columns = Array.from(
            new Set([
              "id",
              "org_id",
              ...safeColumns(item?.selectColumns),
              dateField,
            ]),
          ).filter(Boolean);
          const conditionsAll = Array.isArray(item?.conditionsAll)
            ? item.conditionsAll
            : [];
          const conditionsAny = Array.isArray(item?.conditionsAny)
            ? item.conditionsAny
            : [];
          if (
            !key ||
            !goalId ||
            !moduleId ||
            !safeTableName(table) ||
            !/^[a-z][a-z0-9_]*$/.test(dateField)
          ) {
            output[key] = { mode: "fallback" };
            return;
          }
          const goalUrl = new URL(`${supabaseUrl}/rest/v1/goals`);
          goalUrl.searchParams.set("select", "id,org_id,updated_at");
          goalUrl.searchParams.set("id", `eq.${goalId}`);
          goalUrl.searchParams.set("is_active", "eq.true");
          const goalResponse = await fetch(goalUrl, { headers });
          if (!goalResponse.ok)
            throw new Error(`goal_access_failed:${goalResponse.status}`);
          const goal = (await goalResponse.json())?.[0];
          if (!goal?.org_id) {
            output[key] = { mode: "fallback" };
            return;
          }
          const startIso = String(item?.startIso || "").trim();
          const endIso = String(item?.endIso || "").trim();
          if (!startIso || !endIso) {
            output[key] = { mode: "fallback" };
            return;
          }
          const dateOnly = item?.dateOnly === true;
          const rangeStart = dateOnly ? startIso.slice(0, 10) : startIso;
          const rangeEnd = dateOnly ? endIso.slice(0, 10) : endIso;
          // نتیجهٔ خام به تعریف یک هدف وابسته نیست؛ اشتراک آن بین هدف‌های هم‌ماژول
          // فشار N×M را حذف می‌کند. کلید شامل کاربر و سازمان است تا پاسخ RLS هرگز
          // میان دو کاربر یا tenant مشترک نشود.
          const cacheKey = [
            authorization.slice(-32),
            goal.org_id,
            table,
            dateField,
            columns.join(","),
            rangeStart,
            rangeEnd,
          ].join("::");
          const rows = await fetchRows({
            url: supabaseUrl,
            headers,
            table,
            columns,
            orgId: goal.org_id,
            dateField,
            startIso: rangeStart,
            endIso: rangeEnd,
            cacheKey,
          });
          const fieldResolver = getConditionResolver({
            url: supabaseUrl,
            headers,
            orgId: goal.org_id,
            moduleId,
          });
          const passed = await Promise.all(
            rows.map(async (row) => {
              const normalizedAll = await Promise.all(conditionsAll.map((condition: any) => fieldResolver.normalizeCondition(condition, row)));
              const normalizedAny = await Promise.all(conditionsAny.map((condition: any) => fieldResolver.normalizeCondition(condition, row)));
              return (await passesConditions(
                row,
                normalizedAll,
                normalizedAny,
                fieldResolver.resolve,
              ))
                ? row
                : null;
            }),
          );
          output[key] = { mode: "server", rows: passed.filter(Boolean) };
        } catch {
          // یک هدف ناسازگار یا موقتاً غیرقابل‌دسترسی نباید کل کارت‌های هدف را از کار بیندازد.
          if (key) output[key] = { mode: "fallback" };
        }
      }),
    );
    return json(200, { items: output });
  } catch (error) {
    return json(500, {
      error: String((error as Error)?.message || "goal_progress_failed"),
    });
  }
});
