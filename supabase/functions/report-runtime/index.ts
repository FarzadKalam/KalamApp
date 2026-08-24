// @ts-nocheck
// Authoritative report execution endpoint. It never returns source records;
// browsers receive only calculated buckets, totals and chart-ready series.

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
const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
const safeColumn = (value: unknown) =>
  /^[a-z][a-z0-9_]*$/.test(String(value || "").trim());
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
      assets: "assets",
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
      jobDescription: "job_descriptions",
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
const metricId = (metric: any) =>
  `${String(metric?.report_id || "")}::${String(metric?.metric_key || "")}`;
const readArray = (value: any) => (Array.isArray(value) ? value : []);
const RUNTIME_PAGE_SIZE = 750;
const RUNTIME_MAX_ROWS = 100000;
const REPORT_TABLE_SOURCE_PREFIX = "__report_table__";
const REPORT_TABLE_FIELD_PREFIX = "__report_table_field__";
const REPORT_TABLE_RELATION_FIELD_PREFIX = "__report_table_relation_field__";
const parseTableSource = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw.startsWith(REPORT_TABLE_SOURCE_PREFIX)) return null;
  const blockId = raw
    .slice(REPORT_TABLE_SOURCE_PREFIX.length)
    .replace(/^::/, "");
  return safeColumn(blockId) ? blockId : null;
};
const parseTableField = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw.startsWith(REPORT_TABLE_FIELD_PREFIX)) return null;
  const [blockId, columnKey] = raw
    .slice(REPORT_TABLE_FIELD_PREFIX.length)
    .split("::");
  return safeColumn(blockId) && safeColumn(columnKey)
    ? { blockId, columnKey }
    : null;
};
const parseTableRelationField = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw.startsWith(REPORT_TABLE_RELATION_FIELD_PREFIX)) return null;
  const [blockId, relationColumnKey, targetModuleId, targetFieldKey] = raw
    .slice(REPORT_TABLE_RELATION_FIELD_PREFIX.length)
    .split("::");
  return safeColumn(blockId) &&
    safeColumn(relationColumnKey) &&
    targetModuleId &&
    safeColumn(targetFieldKey)
    ? { blockId, relationColumnKey, targetModuleId, targetFieldKey }
    : null;
};
const isTableRuntimeField = (value: unknown) =>
  !!parseTableField(value) || !!parseTableRelationField(value);
const normalizeNestedRows = (value: unknown) => {
  if (Array.isArray(value))
    return value.filter((item) => item && typeof item === "object");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item === "object")
      : [];
  } catch {
    return [];
  }
};
const isDeletedNestedRow = (row: any) =>
  row?.is_deleted === true ||
  row?.deleted === true ||
  row?._deleted === true ||
  !!row?.deleted_at;
const normalizeRelationId = (value: any) => {
  if (Array.isArray(value)) return normalizeRelationId(value[0]);
  if (value && typeof value === "object")
    return String(value.id || value.value || value.record_id || "").trim();
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      return normalizeRelationId(JSON.parse(value));
    } catch {
      /* direct value below */
    }
  }
  return String(value || "").trim();
};
const isSupportedConditionField = (value: unknown) => {
  const field = String(value || "").trim();
  return (
    safeColumn(field) ||
    field === "tags" ||
    field === "__workflow_assignee" ||
    field.startsWith("__workflow_related__") ||
    field.startsWith("__workflow_multi_relation__") ||
    field.startsWith("__linked__") ||
    field.startsWith("__report_task_process_field__") ||
    field.startsWith("__survey_template__::") ||
    isTableRuntimeField(field)
  );
};
const conditionBaseColumns = (conditions: any[]) =>
  Array.from(
    new Set(
      (conditions || [])
        .flatMap((condition: any) => {
          const field = String(condition?.field || "").trim();
          if (safeColumn(field)) return [field];
          if (field.startsWith("__workflow_related__"))
            return [field.slice("__workflow_related__".length).split("::")[0]];
          if (field.startsWith("__workflow_multi_relation__"))
            return [
              field.slice("__workflow_multi_relation__".length).split("::")[0],
            ];
          if (
            field.startsWith("__linked__") ||
            field.startsWith("__report_task_process_field__")
          )
            return [
              "recurrence_info",
              "process_run_id",
              "source_template_id",
              "process_node_key",
            ];
          if (field.startsWith("__survey_template__::"))
            return ["template_field_values"];
          if (field === "tags") return [];
          return [];
        })
        .filter(safeColumn),
    ),
  );
const assignedId = (row: any) =>
  String(
    row?.assignee_type === "role"
      ? row?.assignee_role_id || row?.assignee_id || ""
      : row?.assignee_id || row?.assignee_role_id || "",
  ).trim();
const allowedByScope = (
  row: any,
  scope: string,
  userId: string,
  roleId: string,
  allowedUsers: Set<string>,
  allowedRoles: Set<string>,
) => {
  if (scope === "all") return true;
  const id = assignedId(row);
  if (!id) return false;
  const assigneeType = String(row?.assignee_type || "");
  if (scope === "own") return assigneeType === "user" && id === userId;
  if (scope === "team") {
    if (assigneeType === "role") return id === roleId;
    if (assigneeType === "user") return id === userId;
    return false;
  }
  if (assigneeType === "role") return allowedRoles.has(id);
  if (assigneeType === "user") return allowedUsers.has(id);
  return false;
};

const fetchAllRows = async (
  url: string,
  path: string,
  query: URL,
  headers: Record<string, string>,
  maxRows = RUNTIME_MAX_ROWS,
) => {
  const rows: any[] = [];
  query.searchParams.set("order", "id.asc");
  for (let start = 0; start < maxRows; start += RUNTIME_PAGE_SIZE) {
    const response = await fetch(query, {
      headers: {
        ...headers,
        Range: `${start}-${start + RUNTIME_PAGE_SIZE - 1}`,
      },
    });
    if (!response.ok)
      throw new Error(`report_rows_fetch_failed:${path}:${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`report_rows_invalid:${path}`);
    rows.push(...page);
    if (page.length < RUNTIME_PAGE_SIZE) return rows;
  }
  const probe = await fetch(query, {
    headers: { ...headers, Range: `${maxRows}-${maxRows}` },
  });
  if (!probe.ok)
    throw new Error(`report_rows_fetch_failed:${path}:${probe.status}`);
  const extra = await probe.json();
  if (Array.isArray(extra) && extra.length > 0)
    throw new Error("report_row_limit_exceeded");
  return rows;
};

const expandTableRows = async (
  parentRows: any[],
  tableBlockIds: string[],
  tableFieldKeys: string[],
  relationFieldKeys: string[],
  orgId: string,
  url: string,
  headers: Record<string, string>,
) => {
  const relationCache = new Map<string, Promise<Record<string, any> | null>>();
  const fetchRelationValue = (
    meta: NonNullable<ReturnType<typeof parseTableRelationField>>,
    relationId: string,
  ) => {
    const targetTable = resolveTable(meta.targetModuleId);
    const cacheKey = `${targetTable}:${relationId}:${meta.targetFieldKey}`;
    if (!relationCache.has(cacheKey))
      relationCache.set(
        cacheKey,
        (async () => {
          if (!safeColumn(targetTable) || !isUuid(relationId)) return null;
          const query = new URL(`${url}/rest/v1/${targetTable}`);
          query.searchParams.set("select", meta.targetFieldKey);
          query.searchParams.set("id", `eq.${relationId}`);
          query.searchParams.set("org_id", `eq.${orgId}`);
          query.searchParams.set("limit", "1");
          const response = await fetch(query, { headers });
          if (!response.ok)
            throw new Error(`table_relation_fetch_failed:${response.status}`);
          return (await response.json())?.[0] || null;
        })(),
      );
    return relationCache.get(cacheKey)!;
  };

  const output: any[] = [];
  for (const parent of parentRows) {
    const tableRows = tableBlockIds.flatMap((blockId) =>
      normalizeNestedRows(parent?.[blockId])
        .filter((row) => !isDeletedNestedRow(row))
        .map((row, index) => ({ blockId, row, index })),
    );
    const combinations =
      tableBlockIds.length === 0
        ? [{ rowsByBlockId: {}, key: "" }]
        : tableRows.length > 0
          ? tableRows.map((item) => ({
              rowsByBlockId: { [item.blockId]: item.row },
              key: `${item.blockId}:${item.index}`,
            }))
          : [{ rowsByBlockId: {}, key: "" }];
    for (const combination of combinations) {
      const candidate = {
        ...parent,
        __report_runtime_key: `${String(parent?.id || "")}:${combination.key}`,
      };
      tableBlockIds.forEach((blockId) => {
        delete candidate[blockId];
      });
      tableFieldKeys.forEach((fieldKey) => {
        const meta = parseTableField(fieldKey);
        if (meta)
          candidate[fieldKey] =
            combination.rowsByBlockId?.[meta.blockId]?.[meta.columnKey] ?? null;
      });
      for (const fieldKey of relationFieldKeys) {
        const meta = parseTableRelationField(fieldKey);
        if (!meta) continue;
        const relationId = normalizeRelationId(
          combination.rowsByBlockId?.[meta.blockId]?.[meta.relationColumnKey],
        );
        if (!relationId) {
          candidate[fieldKey] = null;
          continue;
        }
        const related = await fetchRelationValue(meta, relationId);
        candidate[fieldKey] = related?.[meta.targetFieldKey] ?? null;
      }
      output.push(candidate);
      if (output.length > RUNTIME_MAX_ROWS)
        throw new Error("report_expanded_row_limit_exceeded");
    }
  }
  return output;
};

const resolvePassedIds = async (
  url: string,
  headers: Record<string, string>,
  source: any,
  table: string,
  columns: string[],
  rows: any[],
  conditionsAll: any[],
  conditionsAny: any[],
  reportFieldKeys: string[],
) => {
  if (rows.length === 0) return { passedIds: new Set<string>(), resolvedRows: {} as Record<string, any> };
  if (conditionsAll.length === 0 && conditionsAny.length === 0 && reportFieldKeys.length === 0)
    return {
      passedIds: new Set(rows.map((row) => String(row?.__report_runtime_key || row?.id || "")).filter(Boolean)),
      resolvedRows: {},
    };
  const passedIds = new Set<string>();
  const resolvedRows: Record<string, any> = {};
  for (let offset = 0; offset < rows.length; offset += 500) {
    const slice = rows.slice(offset, offset + 500);
    const response = await fetch(`${url}/functions/v1/goal-progress`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            key: "conditions",
            kind: "report_conditions",
            table,
            moduleId: source.module_id,
            recordIds: slice.map((row: any) => row.id),
            recordOverrides: slice,
            selectColumns: columns.join(","),
            conditionsAll,
            conditionsAny,
            reportFieldKeys,
          },
        ],
      }),
    });
    if (!response.ok)
      throw new Error(`report_conditions_failed:${response.status}`);
    const payload = await response.json().catch(() => null);
    const item = payload?.items?.conditions;
    if (item?.mode !== "server" || !Array.isArray(item?.passedIds))
      throw new Error("report_conditions_unavailable");
    item.passedIds.forEach((id: unknown) => passedIds.add(String(id || "")));
    if (item?.resolvedRows && typeof item.resolvedRows === "object") {
      Object.assign(resolvedRows, item.resolvedRows);
    }
  }
  return { passedIds, resolvedRows };
};

const jalaliBucket = (value: any, granularity: string) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-u-ca-persian", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  })
    .formatToParts(date)
    .reduce((acc: any, part) => ({ ...acc, [part.type]: part.value }), {});
  const year = Number(parts.year || 0),
    month = Number(parts.month || 0),
    day = Number(parts.day || 0);
  if (!year || !month || !day) return null;
  const months = [
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
  ];
  const quarters = ["بهار", "تابستان", "پاییز", "زمستان"];
  const fa = (number: number) =>
    String(number).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  if (granularity === "yearly")
    return { key: `${year}`, label: `سال ${fa(year)}` };
  if (granularity === "quarterly") {
    const q = Math.floor((month - 1) / 3);
    return { key: `${year}-q${q + 1}`, label: `${quarters[q]} ${fa(year)}` };
  }
  if (granularity === "monthly")
    return {
      key: `${year}-${String(month).padStart(2, "0")}`,
      label: `${months[month - 1]} ${fa(year)}`,
    };
  if (granularity === "weekly") {
    const w = Math.ceil(day / 7);
    return {
      key: `${year}-${String(month).padStart(2, "0")}-w${w}`,
      label: `هفته ${fa(w)} ${months[month - 1]} ${fa(year)}`,
    };
  }
  return {
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    label: `${fa(day)} ${months[month - 1]} ${fa(year)}`,
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return json(405, { error: "method_not_allowed" });
  const authorization = String(
    request.headers.get("authorization") || "",
  ).trim();
  const url = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  ).trim();
  if (!authorization || !url || !anonKey || !serviceRoleKey)
    return json(401, { error: "unauthorized" });
  try {
    const { reportId } = await request.json();
    if (!isUuid(reportId)) return json(400, { error: "invalid_report" });
    const serviceHeaders = {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    };
    const internalInvocation =
      authorization === `Bearer ${serviceRoleKey}` &&
      request.headers.get("x-report-runtime-internal") === "1";
    const headers = internalInvocation
      ? serviceHeaders
      : { apikey: anonKey, authorization };
    const reportQuery = new URL(`${url}/rest/v1/report_definitions`);
    reportQuery.searchParams.set(
      "select",
      "id,org_id,name,module_id,config,is_active",
    );
    reportQuery.searchParams.set("id", `eq.${reportId}`);
    reportQuery.searchParams.set("is_active", "eq.true");
    reportQuery.searchParams.set("limit", "1");
    const reportResponse = await fetch(reportQuery, { headers });
    if (!reportResponse.ok)
      return json(403, { error: "report_not_accessible" });
    const report = (await reportResponse.json())?.[0];
    if (!report?.id || !report?.org_id)
      return json(404, { error: "report_not_found" });
    const config =
      report.config && typeof report.config === "object" ? report.config : {};
    // A report is first read with the caller JWT. The interval worker is the only
    // exception: it authenticates with the service key and an internal-only marker.
    let userId = "";
    let roleId = "";
    let explicitViewer = internalInvocation;
    let permissions: any = {};
    let recordScope = "all";
    if (!internalInvocation) {
      const userResponse = await fetch(`${url}/auth/v1/user`, { headers });
      userId = String(
        (await userResponse.json().catch(() => ({})))?.id || "",
      ).trim();
      if (!isUuid(userId)) return json(401, { error: "unauthorized" });
      const profileQuery = new URL(`${url}/rest/v1/profiles`);
      profileQuery.searchParams.set("select", "id,org_id,role_id");
      profileQuery.searchParams.set("id", `eq.${userId}`);
      profileQuery.searchParams.set("limit", "1");
      const profileResponse = await fetch(profileQuery, {
        headers: serviceHeaders,
      });
      const profile = (await profileResponse.json().catch(() => []))?.[0];
      if (!profile || String(profile.org_id || "") !== String(report.org_id))
        return json(403, { error: "org_access_denied" });
      roleId = String(profile.role_id || "").trim();
      explicitViewer =
        readArray(config.viewer_user_ids).map(String).includes(userId) ||
        readArray(config.viewer_role_ids).map(String).includes(roleId);
    }
    if (roleId && !internalInvocation) {
      const roleQuery = new URL(`${url}/rest/v1/org_roles`);
      roleQuery.searchParams.set("select", "permissions");
      roleQuery.searchParams.set("id", `eq.${roleId}`);
      roleQuery.searchParams.set("org_id", `eq.${report.org_id}`);
      roleQuery.searchParams.set("limit", "1");
      const roleResponse = await fetch(roleQuery, { headers: serviceHeaders });
      permissions =
        (await roleResponse.json().catch(() => []))?.[0]?.permissions || {};
    }
    const directoryQuery = new URL(`${url}/rest/v1/profiles`);
    directoryQuery.searchParams.set("select", "id,role_id");
    directoryQuery.searchParams.set("org_id", `eq.${report.org_id}`);
    directoryQuery.searchParams.set("is_active", "eq.true");
    const directoryUsers = await fetchAllRows(
      url,
      "profiles",
      directoryQuery,
      serviceHeaders,
    );
    const rolesQuery = new URL(`${url}/rest/v1/org_roles`);
    rolesQuery.searchParams.set("select", "id,parent_id");
    rolesQuery.searchParams.set("org_id", `eq.${report.org_id}`);
    const directoryRoles = await fetchAllRows(
      url,
      "org_roles",
      rolesQuery,
      serviceHeaders,
    );
    const allowedRoles = new Set<string>([roleId]);
    (directoryRoles || [])
      .filter((item: any) => String(item?.parent_id || "") === roleId)
      .forEach((item: any) => allowedRoles.add(String(item.id)));
    const allowedUsers = new Set<string>([userId]);
    (directoryUsers || [])
      .filter((item: any) => allowedRoles.has(String(item?.role_id || "")))
      .forEach((item: any) => allowedUsers.add(String(item.id)));
    const mode = ["difference", "percentage"].includes(
      String(config.calculation_mode || ""),
    )
      ? config.calculation_mode
      : "normal";
    const referenceIds =
      mode === "normal"
        ? [String(report.id)]
        : Array.from(
            new Set(
              readArray(config.reference_report_ids).map(String).filter(isUuid),
            ),
          );
    if (referenceIds.length === 0)
      return json(422, { error: "missing_reference_reports" });
    const refsQuery = new URL(`${url}/rest/v1/report_definitions`);
    refsQuery.searchParams.set(
      "select",
      "id,org_id,name,module_id,config,is_active,updated_at",
    );
    refsQuery.searchParams.set("id", `in.(${referenceIds.join(",")})`);
    refsQuery.searchParams.set("is_active", "eq.true");
    const refsResponse = await fetch(refsQuery, { headers: serviceHeaders });
    if (!refsResponse.ok)
      return json(403, { error: "reference_not_accessible" });
    const references = await refsResponse.json();
    if (
      !Array.isArray(references) ||
      references.length !== referenceIds.length ||
      references.some(
        (item) => String(item?.org_id || "") !== String(report.org_id),
      )
    )
      return json(422, { error: "invalid_reference_reports" });
    const groupings = readArray(config.group_bys).slice(0, 3);
    const buckets = new Map<string, any>();
    for (const source of references) {
      const sourceConfig =
        source?.config && typeof source.config === "object"
          ? source.config
          : {};
      if (String(sourceConfig.calculation_mode || "normal") !== "normal")
        return json(422, { error: "nested_composite_report" });
      const sourceId = String(source.id);
      const table = resolveTable(String(source.module_id || ""));
      if (!safeColumn(table))
        return json(422, { error: "invalid_report_source" });
      const modulePermission =
        permissions?.[String(source.module_id || "")] || {};
      if (!explicitViewer && modulePermission.view === false)
        return json(403, { error: "module_access_denied" });
      const sourceScope = explicitViewer
        ? "all"
        : String(modulePermission.record_scope || "all");
      const selected =
        mode === "difference"
          ? [
              ...readArray(config.increase_metrics),
              ...readArray(config.decrease_metrics),
            ].filter((item: any) => String(item?.report_id || "") === sourceId)
          : mode === "percentage"
            ? [
                config.percentage_target_metric,
                config.percentage_total_metric,
              ].filter(
                (item: any) => String(item?.report_id || "") === sourceId,
              )
            : ["sum", "avg"].includes(String(sourceConfig.metric_type || ""))
              ? readArray(sourceConfig.metric_fields).map(
                  (metric_key: string) => ({ report_id: sourceId, metric_key }),
                )
              : [{ report_id: sourceId, metric_key: "__count" }];
      if (!selected.length) continue;
      const groupFields = groupings.map((grouping: any) =>
        String(grouping?.source_fields?.[sourceId] || grouping?.field || ""),
      );
      if (
        groupFields.some(
          (field) => field !== "__report_date__" && !isSupportedConditionField(field),
        )
      )
        return json(422, { error: "unsupported_report_grouping" });
      const reportConditions = [
        ...readArray(sourceConfig.conditions_all),
        ...readArray(sourceConfig.conditions_any),
      ];
      if (
        reportConditions.some(
          (condition: any) => !isSupportedConditionField(condition?.field),
        )
      )
        return json(422, { error: "unsupported_report_condition" });
      const conditionFields = conditionBaseColumns(reportConditions);
      // جدول‌های داخلی فقط با انتخاب یک ستون فعال نمی‌شوند: انتخاب خودِ بلوک
      // در سازنده نیز، درست مثل نسخهٔ قبلی مرورگر، هر ردیف داخلی را یک ورودی
      // مستقل برای شمارش و محاسبه می‌کند. این‌جا هر دو منبع را در نظر می‌گیریم.
      const selectedTableBlockIds = readArray(sourceConfig.secondary_module_ids)
        .map(parseTableSource)
        .filter(safeColumn);
      const tableRuntimeKeys = Array.from(
        new Set(
          [
            ...groupFields,
            ...selected.map((item: any) => String(item?.metric_key || "")),
            ...reportConditions.map((condition: any) =>
              String(condition?.field || ""),
            ),
            ...readArray(sourceConfig.columns).map((column: any) =>
              String(column || ""),
            ),
          ].filter(isTableRuntimeField),
        ),
      );
      const tableFieldKeys = tableRuntimeKeys.filter(
        (field) => !!parseTableField(field),
      );
      const relationFieldKeys = tableRuntimeKeys.filter(
        (field) => !!parseTableRelationField(field),
      );
      const tableBlockIds = Array.from(
        new Set([
          ...selectedTableBlockIds,
          ...tableRuntimeKeys
            .map((field) => {
              const plain = parseTableField(field);
              const relation = parseTableRelationField(field);
              return plain?.blockId || relation?.blockId || "";
            })
            .filter(safeColumn),
        ]),
      );
      const metricFields = selected
        .map((item: any) => String(item?.metric_key || ""))
        .filter((field) => field !== "__count" && safeColumn(field));
      if (
        selected.some(
          (item: any) =>
            String(item?.metric_key || "") !== "__count" &&
            !isSupportedConditionField(item?.metric_key),
        )
      )
        return json(422, { error: "unsupported_report_metric" });
      const runtimeFieldKeys = Array.from(new Set([
        ...groupFields.filter((field) => field !== "__report_date__"),
        ...selected.map((item: any) => String(item?.metric_key || "")).filter((field) => field !== "__count"),
      ]));
      const runtimeBaseColumns = conditionBaseColumns(runtimeFieldKeys.map((field) => ({ field })));
      const columns = Array.from(
        new Set([
          "id",
          "org_id",
          "assignee_id",
          "assignee_role_id",
          "assignee_type",
          "updated_at",
          ...(String(source.module_id || "") === "tasks" && reportConditions.some((condition: any) => String(condition?.field || "").trim() === "status") ? ["recurrence_info"] : []),
          ...conditionFields,
          ...metricFields,
          ...groupFields.filter(safeColumn),
          ...runtimeBaseColumns,
          ...tableBlockIds,
        ]),
      );
      const rowsQuery = new URL(`${url}/rest/v1/${table}`);
      rowsQuery.searchParams.set("select", columns.join(","));
      rowsQuery.searchParams.set("org_id", `eq.${report.org_id}`);
      const parentRows = (
        await fetchAllRows(url, table, rowsQuery, serviceHeaders)
      ).filter((row: any) =>
        allowedByScope(
          row,
          sourceScope,
          userId,
          roleId,
          allowedUsers,
          allowedRoles,
        ),
      );
      const rawRows = await expandTableRows(
        parentRows,
        tableBlockIds,
        tableFieldKeys,
        relationFieldKeys,
        String(report.org_id),
        url,
        serviceHeaders,
      );
      const evaluated = await resolvePassedIds(
        url,
        serviceHeaders,
        source,
        table,
        columns,
        rawRows,
        readArray(sourceConfig.conditions_all),
        readArray(sourceConfig.conditions_any),
        runtimeFieldKeys.filter((field) => field !== "__report_date__"),
      );
      for (const row of rawRows) {
        const rowKey = String(row?.__report_runtime_key || row?.id || "");
        if (!evaluated.passedIds.has(rowKey))
          continue;
        const resolvedValues = evaluated.resolvedRows?.[rowKey] || {};
        const valueFor = (field: string) => resolvedValues?.[field]?.value ?? row[field];
        const labelFor = (field: string, fallback: any) => String(resolvedValues?.[field]?.label || fallback || "").trim();
        const values: Array<{ key: string; label: string }> = [];
        if (groupings.length > 0) {
          let completeGroup = true;
          groupings.forEach((grouping: any, index: number) => {
            if (!completeGroup) return;
            const field = groupFields[index];
            // «زمان گزارش‌ها» در گزارش ترکیبی، زمان آخرین به‌روزرسانی گزارش
            // مرجع است؛ سایر گروه‌ها از مقدار واقعی همان ردیف استفاده می‌کنند.
            const rawValue = field === "__report_date__" ? source.updated_at : valueFor(field);
            const temporal = grouping?.date_granularity
              ? jalaliBucket(rawValue, String(grouping.date_granularity))
              : null;
            if (grouping?.date_granularity) {
              if (!temporal) {
                completeGroup = false;
                return;
              }
              values.push(temporal);
              return;
            }
            if (
              rawValue === null ||
              rawValue === undefined ||
              rawValue === ""
            ) {
              completeGroup = false;
              return;
            }
            const rawLabel = labelFor(field, isUuid(rawValue) ? "رکورد انتخاب‌شده" : rawValue);
            values.push({ key: String(rawValue), label: rawLabel });
          });
          if (!completeGroup || values.length !== groupings.length) continue;
        }
        // هر عمق گروه به‌عنوان یک bucket مستقل نگه‌داری می‌شود. به این ترتیب
        // جدول نتیجه می‌تواند گروه‌های تو‌در‌تو را بدون از دست دادن ردیف‌های
        // داخلی نشان دهد، نه فقط برچسب ترکیب‌شدهٔ برگ‌ها را.
        const depths = groupings.length > 0
          ? Array.from({ length: values.length }, (_, depth) => depth)
          : [-1];
        for (const depth of depths) {
          const active = depth < 0 ? [] : values.slice(0, depth + 1);
          const key = active.length > 0
            ? active.map((item, index) => `${index}:${item.key}`).join("|")
            : "__total__";
          const parentKey = active.length > 1
            ? active.slice(0, -1).map((item, index) => `${index}:${item.key}`).join("|")
            : undefined;
          const bucket = buckets.get(key) || {
            key,
            parent_key: parentKey,
            group_depth: depth,
            group_label: active[active.length - 1]?.label || "کل گزارش",
            group_values: Object.fromEntries(active.map((item, index) => [String(groupings[index]?.field || index), item.key])),
            group_labels: Object.fromEntries(active.map((item, index) => [String(groupings[index]?.field || index), item.label])),
            label: active.length > 0 ? active.map((item) => item.label).join(" / ") : "کل گزارش",
            row_count: 0,
            increase: 0,
            decrease: 0,
            target: 0,
            total: 0,
            metrics: {},
            metric_counts: {},
            metric_modes: {},
          };
          bucket.row_count += 1;
          for (const metric of selected) {
            const value = metric.metric_key === "__count" ? 1 : Number(valueFor(String(metric.metric_key || "")) || 0);
            if (!Number.isFinite(value)) continue;
            const id = metricId(metric);
            const resultMetricKey = mode === "normal" ? String(metric.metric_key) : id;
            bucket.metrics[resultMetricKey] = Number(bucket.metrics[resultMetricKey] || 0) + value;
            bucket.metric_counts[resultMetricKey] = Number(bucket.metric_counts[resultMetricKey] || 0) + 1;
            if (mode === "normal") bucket.metric_modes[resultMetricKey] = String(sourceConfig.metric_type || "count");
            if (readArray(config.increase_metrics).some((item: any) => metricId(item) === id)) bucket.increase += value;
            if (readArray(config.decrease_metrics).some((item: any) => metricId(item) === id)) bucket.decrease += value;
            if (metricId(config.percentage_target_metric) === id) bucket.target += value;
            if (metricId(config.percentage_total_metric) === id) bucket.total += value;
          }
          buckets.set(key, bucket);
        }
      }
    }
    const allGroups = Array.from(buckets.values())
      .map((bucket: any) => {
        Object.keys(bucket.metrics || {}).forEach((key) => {
          if (bucket.metric_modes?.[key] === "avg")
            bucket.metrics[key] =
              Number(bucket.metrics[key] || 0) /
              Math.max(1, Number(bucket.metric_counts?.[key] || 0));
        });
        return bucket;
      })
      .sort((a: any, b: any) =>
        String(a.key).localeCompare(String(b.key), "fa", { numeric: true }),
      );
    const rowsByKey = new Map(allGroups.map((group: any) => [group.key, { ...group, children: [] as any[] }]));
    const groupTree: any[] = [];
    rowsByKey.forEach((group: any) => {
      if (group.parent_key && rowsByKey.has(group.parent_key)) {
        rowsByKey.get(group.parent_key).children.push(group);
        return;
      }
      groupTree.push(group);
    });
    const leafDepth = groupings.length - 1;
    const groups = groupings.length > 0
      ? allGroups.filter((group: any) => Number(group.group_depth) === leafDepth)
      : allGroups;
    return json(200, {
      mode,
      report: { id: report.id, name: report.name },
      groups,
      group_tree: groupTree,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return json(500, {
      error: String((error as Error)?.message || "report_runtime_failed"),
    });
  }
});
