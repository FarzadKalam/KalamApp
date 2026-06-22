// supabase/functions/workflow-interval-runner/index.ts
var FUNCTION_BUILD = "workflow-interval-runner-2026-06-18-process-workflow-hardening";
var MAX_WORKFLOWS = 30;
var DEFAULT_BATCH_SIZE = 300;
var TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1e3;
var WORKFLOW_ASSIGNEE_FIELD_KEY = "__workflow_assignee";
var WORKFLOW_RELATED_FIELD_PREFIX = "__workflow_related__";
var WORKFLOW_MULTI_RELATION_PREFIX = "__workflow_multi_relation__";
var PROCESS_NEXT_STAGE_FIELD_PREFIX = "__process_next_stage__";
var DEFAULT_AI_BASE_URL = "https://api.avalai.ir/v1";
var DEFAULT_AI_FALLBACK_BASE_URL = "https://api.avalapis.ir/v1";
var UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var CALENDAR_PUBLIC_BASE_URL = String(
  Deno.env.get("KALAMAPP_PUBLIC_BASE_URL") || Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || ""
).trim().replace(/\/+$/, "");
var holidayYearCache = /* @__PURE__ */ new Map();
var CALENDAR_EVENT_MOVES = [
  { from: "1405/03/05", to: "1405/03/06", eventIncludes: "\u0639\u06CC\u062F \u0633\u0639\u06CC\u062F \u0642\u0631\u0628\u0627\u0646", event: { isHoliday: true, event: "\u0639\u06CC\u062F \u0633\u0639\u06CC\u062F \u0642\u0631\u0628\u0627\u0646", calendarType: "hijri" } },
  { from: "1405/03/05", to: "1405/03/06", eventIncludes: "\u0622\u063A\u0627\u0632 \u062F\u0647\u0647\u0654 \u0627\u0645\u0627\u0645\u062A \u0648 \u0648\u0644\u0627\u06CC\u062A", event: { isHoliday: false, event: "\u0622\u063A\u0627\u0632 \u062F\u0647\u0647\u0654 \u0627\u0645\u0627\u0645\u062A \u0648 \u0648\u0644\u0627\u06CC\u062A", calendarType: "hijri" } },
  { from: "1405/03/13", to: "1405/03/14", eventIncludes: "\u0639\u06CC\u062F \u0633\u0639\u06CC\u062F \u063A\u062F\u06CC\u0631 \u062E\u0645", event: { isHoliday: true, event: "\u0639\u06CC\u062F \u0633\u0639\u06CC\u062F \u063A\u062F\u06CC\u0631 \u062E\u0645(\u06F1\u06F0 \u0647\u200D\u200D.\u0642)", calendarType: "hijri" } }
];
function resolveWorkflowActorId(workflow) {
  const actor = String(workflow?.updated_by || workflow?.created_by || "").trim();
  return actor || null;
}
function gregorianToJalali(gy, gm, gd) {
  const j_days_in_month = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  gy -= 1600;
  gm -= 1;
  gd -= 1;
  let g_d_no = 365 * gy + Math.floor((gy + 3) / 4) - Math.floor((gy + 99) / 100) + Math.floor((gy + 399) / 400);
  const g_month_days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let i = 0; i < gm; i++) g_d_no += g_month_days[i];
  if (gm > 1 && (gy % 4 === 0 && gy % 100 !== 0 || gy % 400 === 0)) g_d_no++;
  g_d_no += gd;
  let j_d_no = g_d_no - 79;
  const j_np = Math.floor(j_d_no / 12053);
  j_d_no %= 12053;
  let jy = 979 + 33 * j_np + 4 * Math.floor(j_d_no / 1461);
  j_d_no %= 1461;
  if (j_d_no >= 366) {
    jy += Math.floor((j_d_no - 1) / 365);
    j_d_no = (j_d_no - 1) % 365;
  }
  let jm = 0;
  for (let i = 0; i < 11 && j_d_no >= j_days_in_month[i]; i++) {
    j_d_no -= j_days_in_month[i];
    jm = i + 1;
  }
  return [jy, jm + 1, j_d_no + 1];
}
function formatJalaliDate(isoDate) {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}
function toEnglishDigits(value) {
  return String(value || "").replace(/[۰-۹]/g, (digit) => String("\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(digit)));
}
function normalizeDateKey(value) {
  return toEnglishDigits(value).replace(/-/g, "/").split("/").map((part, index) => index === 0 ? part.padStart(4, "0") : part.padStart(2, "0")).join("/");
}
async function loadHolidayYear(jalaliYear) {
  if (!CALENDAR_PUBLIC_BASE_URL || !Number.isFinite(jalaliYear)) return null;
  if (!holidayYearCache.has(jalaliYear)) {
    holidayYearCache.set(jalaliYear, (async () => {
      const response = await fetch(`${CALENDAR_PUBLIC_BASE_URL}/calendar/${jalaliYear}.json`, { cache: "force-cache" });
      if (!response.ok) return null;
      const data = await response.json();
      return Array.isArray(data) ? data : null;
    })().catch((error) => {
      console.warn(`[workflow-runner] Calendar fetch failed for ${jalaliYear}:`, error?.message || error);
      return null;
    }));
  }
  return holidayYearCache.get(jalaliYear) || null;
}
function applyCalendarEventMoves(dateKey, events) {
  const normalizedDateKey = normalizeDateKey(dateKey);
  let nextEvents = [...events];
  for (const move of CALENDAR_EVENT_MOVES) {
    const from = normalizeDateKey(move.from);
    const to = normalizeDateKey(move.to);
    if (normalizedDateKey === from) {
      nextEvents = nextEvents.filter((item) => !String(item?.event || "").includes(move.eventIncludes));
    }
    if (normalizedDateKey === to && !nextEvents.some((item) => String(item?.event || "").includes(move.eventIncludes))) {
      nextEvents.push(move.event);
    }
  }
  return nextEvents;
}
function normalizeOccasionText(value) {
  return toEnglishDigits(String(value ?? "")).trim().toLocaleLowerCase("fa-IR");
}
function normalizeOccasionValues(value) {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeOccasionValues(item));
  if (value && typeof value === "object") {
    const nested = value?.values || value?.items || value?.selected;
    if (Array.isArray(nested)) return normalizeOccasionValues(nested);
    return [value?.value, value?.label, value?.title, value?.event].filter((item) => item !== void 0 && item !== null && item !== "").map((item) => normalizeOccasionText(item));
  }
  const text = normalizeOccasionText(value);
  return text ? [text] : [];
}
function occasionMatches(title, expected) {
  const normalizedTitle = normalizeOccasionText(title);
  const normalizedExpected = normalizeOccasionText(expected);
  return !!normalizedExpected && (normalizedTitle === normalizedExpected || normalizedTitle.includes(normalizedExpected) || normalizedExpected.includes(normalizedTitle));
}
async function getHolidayEventsForDate(value) {
  const date = value ? new Date(String(value)) : null;
  if (!date || isNaN(date.getTime())) return [];
  const dateKey = formatJalaliDate(date.toISOString());
  const [yearText, monthText, dayText] = normalizeDateKey(dateKey).split("/");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const yearData = await loadHolidayYear(year);
  const monthData = Array.isArray(yearData) ? yearData[month - 1] : null;
  const dayData = monthData?.days?.find((item) => Number(toEnglishDigits(item?.day?.jalali || "0")) === day);
  return applyCalendarEventMoves(dateKey, dayData?.events?.list || []);
}
async function dateHasAnyOccasion(value, expectedValue) {
  const expected = normalizeOccasionValues(expectedValue);
  if (expected.length === 0) return false;
  const titles = (await getHolidayEventsForDate(value)).map((item) => String(item?.event || "").trim()).filter(Boolean);
  return titles.some((title) => expected.some((item) => occasionMatches(title, item)));
}
async function dateIsDaysBeforeOccasion(value, expectedValue) {
  const date = value ? new Date(String(value)) : null;
  if (!date || isNaN(date.getTime())) return false;
  const config = expectedValue && typeof expectedValue === "object" && !Array.isArray(expectedValue) ? expectedValue : {};
  const days = Number(config.days ?? config.count ?? 0);
  if (!Number.isFinite(days) || days < 0) return false;
  const occasion = config.occasion ?? config.event ?? config.value;
  if (normalizeOccasionValues(occasion).length === 0) return false;
  const target = new Date(date);
  target.setDate(target.getDate() + days);
  return dateHasAnyOccasion(target.toISOString(), occasion);
}
function formatJalaliDateTime(isoDate) {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const tehranDate = new Date(isoDate);
  const local = new Date(tehranDate.getTime() + TEHRAN_OFFSET_MS);
  const [jy, jm, jd] = gregorianToJalali(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
  const h = String(local.getUTCHours()).padStart(2, "0");
  const min = String(local.getUTCMinutes()).padStart(2, "0");
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")} ${h}:${min}`;
}
var DATE_LIKE_REGEX = /^\d{4}-\d{2}-\d{2}/;
var asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === void 0 || value === "") return [];
  return [value];
};
var toTehranDate = (date) => new Date(date.getTime() + TEHRAN_OFFSET_MS);
var fromTehranDate = (date) => new Date(date.getTime() - TEHRAN_OFFSET_MS);
function getFieldValue(record, fieldKey) {
  if (Object.prototype.hasOwnProperty.call(record, fieldKey)) return record[fieldKey];
  const parts = fieldKey.split(".");
  let cur = record;
  for (const p of parts) {
    cur = cur?.[p];
    if (cur === void 0) break;
  }
  return cur;
}
function buildResolvedAssigneeCombo(record) {
  const assigneeType = String(record?.assignee_type || "").trim().toLowerCase();
  const roleId = String(record?.assignee_role_id || "").trim();
  const userId = String(record?.assignee_id || "").trim();
  if (assigneeType === "role" || !assigneeType && roleId) {
    const id = roleId || userId;
    return id ? `role_${id}` : null;
  }
  return userId ? `user_${userId}` : null;
}
function parseWorkflowRelatedFieldKey(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith(WORKFLOW_RELATED_FIELD_PREFIX)) return null;
  const parts = raw.slice(WORKFLOW_RELATED_FIELD_PREFIX.length).split("::");
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return { relationFieldKey: parts[0], targetModuleId: parts[1], targetFieldKey: parts[2] };
}
function parseWorkflowMultiRelationFieldKey(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith(WORKFLOW_MULTI_RELATION_PREFIX)) return null;
  const parts = raw.slice(WORKFLOW_MULTI_RELATION_PREFIX.length).split("::");
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return { fieldKey: parts[0], targetModuleId: parts[1], targetFieldKey: parts[2] };
}
function parseProcessNextStageFieldKey(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith(PROCESS_NEXT_STAGE_FIELD_PREFIX)) return null;
  const match = raw.slice(PROCESS_NEXT_STAGE_FIELD_PREFIX.length).match(/^([12])__(.+)$/);
  if (!match?.[1] || !match?.[2]) return null;
  return { offset: Number(match[1]), fieldKey: String(match[2]).trim() };
}
function normalizeMultiRelationIds(value) {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeMultiRelationIds(item));
  if (value && typeof value === "object") {
    return [value.id, value.value, value.record_id].map((item) => String(item || "").trim()).filter(Boolean);
  }
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      return normalizeMultiRelationIds(JSON.parse(raw));
    } catch {
      return [raw];
    }
  }
  return [raw];
}
async function fetchRelatedRecord(url, key, moduleId, recordId) {
  const table = getModuleTable(moduleId);
  const rows = await dbGet(url, key, `${table}?id=eq.${encodeURIComponent(recordId)}&select=*&limit=1`).catch(() => []);
  return rows[0] || null;
}
function normalizeMultiRelationCommunicationValues(targetModuleId, targetFieldKey, values) {
  const normalizedTargetModuleId = String(targetModuleId || "").trim();
  const normalizedTargetFieldKey = String(targetFieldKey || "").trim();
  if (normalizedTargetFieldKey === "related_profile_id" || normalizedTargetModuleId === "profiles" && normalizedTargetFieldKey === "id") {
    return values.map((value) => String(value || "").trim()).filter(Boolean).map((value) => `user_${value}`);
  }
  return values;
}
async function resolveWorkflowFieldValue(url, key, fieldKey, record) {
  const normalizedFieldKey = String(fieldKey || "").trim();
  if (!normalizedFieldKey) return null;
  if (normalizedFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) return buildResolvedAssigneeCombo(record);
  const relatedMeta = parseWorkflowRelatedFieldKey(normalizedFieldKey);
  if (relatedMeta) {
    const relationId = String(getFieldValue(record, relatedMeta.relationFieldKey) || "").trim();
    if (!relationId) return null;
    const relatedRecord = await fetchRelatedRecord(url, key, relatedMeta.targetModuleId, relationId);
    if (!relatedRecord) return null;
    if (relatedMeta.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) return buildResolvedAssigneeCombo(relatedRecord);
    return getFieldValue(relatedRecord, relatedMeta.targetFieldKey);
  }
  const multiRelationMeta = parseWorkflowMultiRelationFieldKey(normalizedFieldKey);
  if (multiRelationMeta) {
    const ids = Array.from(new Set(normalizeMultiRelationIds(getFieldValue(record, multiRelationMeta.fieldKey))));
    const values = [];
    for (const id of ids) {
      const relatedRecord = await fetchRelatedRecord(url, key, multiRelationMeta.targetModuleId, id);
      if (!relatedRecord) continue;
      if (multiRelationMeta.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) {
        const assignee = buildResolvedAssigneeCombo(relatedRecord);
        if (assignee) values.push(assignee);
      } else {
        const value = getFieldValue(relatedRecord, multiRelationMeta.targetFieldKey);
        if (Array.isArray(value)) values.push(...value);
        else if (value !== null && value !== void 0 && value !== "") values.push(value);
      }
    }
    return normalizeMultiRelationCommunicationValues(multiRelationMeta.targetModuleId, multiRelationMeta.targetFieldKey, values);
  }
  return getFieldValue(record, normalizedFieldKey);
}
var orgPublicBaseUrlCache = /* @__PURE__ */ new Map();
function getOrgPublicBaseUrl(url, key, orgId) {
  const normalizedOrgId = String(orgId || "").trim();
  if (!normalizedOrgId) return Promise.resolve("");
  if (!orgPublicBaseUrlCache.has(normalizedOrgId)) {
    orgPublicBaseUrlCache.set(normalizedOrgId, (async () => {
      const rows = await dbGet(url, key, `saas_org_settings?org_id=eq.${normalizedOrgId}&select=resolved_host&limit=1`).catch(() => []);
      const host = String(rows?.[0]?.resolved_host || "").trim().replace(/\/+$/, "");
      return host ? `https://${host}` : CALENDAR_PUBLIC_BASE_URL || "";
    })());
  }
  return orgPublicBaseUrlCache.get(normalizedOrgId);
}
async function formatFieldValue(value, fieldKey, url, key, orgId) {
  if (value === null || value === void 0) return "";
  if (typeof value === "boolean") return value ? "\u0628\u0644\u0647" : "\u062E\u06CC\u0631";
  const str = String(value);
  if (typeof value === "string" && (str.startsWith("/i/") || str.startsWith("/d/"))) {
    const baseUrl = await getOrgPublicBaseUrl(url, key, orgId);
    return baseUrl ? `${baseUrl}${str}` : str;
  }
  if (DATE_LIKE_REGEX.test(str)) {
    if (str.length > 10) return formatJalaliDateTime(str);
    return formatJalaliDate(str);
  }
  if (typeof value === "number") {
    return value.toLocaleString("fa-IR");
  }
  if (Array.isArray(value)) return value.join("\u060C ");
  return str;
}
async function renderTemplateAsync(template, record, url, key, bold = false, orgId = "") {
  const raw = String(template || "");
  const matches = Array.from(raw.matchAll(/\{\{\s*([^}]+)\s*\}\}/g));
  if (matches.length === 0) return raw;
  let rendered = raw;
  for (const match of matches) {
    const token = match[0];
    const fieldKey = String(match[1] || "").trim();
    if (!fieldKey) continue;
    const value = await resolveWorkflowFieldValue(url, key, fieldKey, record);
    const text = await formatFieldValue(value, fieldKey, url, key, orgId);
    rendered = rendered.replaceAll(token, text ? bold ? `**${text}**` : text : "");
  }
  return rendered;
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function daysDiffFromNow(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = /* @__PURE__ */ new Date();
  const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (nStart.getTime() - dStart.getTime()) / (1e3 * 60 * 60 * 24);
}
function hoursDiffFromNow(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (1e3 * 60 * 60);
}
function getFieldValueForCondition(record, field) {
  if (Object.prototype.hasOwnProperty.call(record, field)) return record[field];
  const parts = field.split(".");
  let cur = record;
  for (const p of parts) {
    cur = cur?.[p];
    if (cur === void 0) break;
  }
  return cur;
}
function normalizeConditionValue(value) {
  const PERSIAN = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9";
  const ARABIC = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
  return String(value ?? "").replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d))).replace(/[٠-٩]/g, (d) => String(ARABIC.indexOf(d)));
}
async function evaluateCondition(condition, record) {
  const field = String(condition?.field || "").trim();
  if (!field) return true;
  const operator = String(condition?.operator || "eq").trim();
  const expected = condition?.value;
  const currentRaw = getFieldValueForCondition(record, field);
  const current = currentRaw;
  const currentStr = normalizeConditionValue(currentRaw);
  switch (operator) {
    case "eq":
      return String(current ?? "") === String(expected ?? "");
    case "neq":
      return String(current ?? "") !== String(expected ?? "");
    case "gt":
      return Number(currentStr) > Number(normalizeConditionValue(expected));
    case "gte":
      return Number(currentStr) >= Number(normalizeConditionValue(expected));
    case "lt":
      return Number(currentStr) < Number(normalizeConditionValue(expected));
    case "lte":
      return Number(currentStr) <= Number(normalizeConditionValue(expected));
    case "in": {
      const arr = Array.isArray(expected) ? expected : [expected];
      return arr.map(String).includes(String(current ?? ""));
    }
    case "not_in": {
      const arr = Array.isArray(expected) ? expected : [expected];
      return !arr.map(String).includes(String(current ?? ""));
    }
    case "is_null":
    case "is_empty":
      return current === null || current === void 0 || String(current).trim() === "";
    case "not_null":
    case "not_empty":
      return current !== null && current !== void 0 && String(current).trim() !== "";
    case "is_true":
      return current === true || current === "true" || current === 1;
    case "is_false":
      return current === false || current === "false" || current === 0;
    case "contains":
      return String(current ?? "").includes(String(expected ?? ""));
    case "not_contains":
      return !String(current ?? "").includes(String(expected ?? ""));
    case "starts_with":
      return String(current ?? "").startsWith(String(expected ?? ""));
    case "ends_with":
      return String(current ?? "").endsWith(String(expected ?? ""));
    case "is_today": {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && isSameDay(d, /* @__PURE__ */ new Date());
    }
    case "is_yesterday": {
      const d = current ? new Date(String(current)) : null;
      const y = /* @__PURE__ */ new Date();
      y.setDate(y.getDate() - 1);
      return !!d && !isNaN(d.getTime()) && isSameDay(d, y);
    }
    case "is_tomorrow": {
      const d = current ? new Date(String(current)) : null;
      const t = /* @__PURE__ */ new Date();
      t.setDate(t.getDate() + 1);
      return !!d && !isNaN(d.getTime()) && isSameDay(d, t);
    }
    case "is_this_week": {
      const d = current ? new Date(String(current)) : null;
      if (!d || isNaN(d.getTime())) return false;
      const now = /* @__PURE__ */ new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    }
    case "is_last_week": {
      const d = current ? new Date(String(current)) : null;
      if (!d || isNaN(d.getTime())) return false;
      const now = /* @__PURE__ */ new Date();
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - now.getDay());
      thisWeekStart.setHours(0, 0, 0, 0);
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(thisWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setMilliseconds(-1);
      return d >= lastWeekStart && d <= lastWeekEnd;
    }
    case "is_this_month": {
      const d = current ? new Date(String(current)) : null;
      if (!d || isNaN(d.getTime())) return false;
      const now = /* @__PURE__ */ new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    case "is_last_month": {
      const d = current ? new Date(String(current)) : null;
      if (!d || isNaN(d.getTime())) return false;
      const now = /* @__PURE__ */ new Date();
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getFullYear() === last.getFullYear() && d.getMonth() === last.getMonth();
    }
    case "day_of_month_eq": {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && d.getDate() === Number(expected ?? 0);
    }
    case "day_of_month_neq": {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && d.getDate() !== Number(expected ?? 0);
    }
    case "day_of_week_eq": {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && d.getDay() === Number(expected ?? 0);
    }
    case "day_of_week_neq": {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && d.getDay() !== Number(expected ?? 0);
    }
    case "days_passed_eq": {
      const diff = daysDiffFromNow(String(current ?? ""));
      return diff !== null && Math.floor(diff) === Number(expected ?? 0);
    }
    case "days_passed_gt": {
      const diff = daysDiffFromNow(String(current ?? ""));
      return diff !== null && diff > Number(expected ?? 0);
    }
    case "days_passed_lt": {
      const diff = daysDiffFromNow(String(current ?? ""));
      return diff !== null && diff < Number(expected ?? 0);
    }
    case "days_remaining_eq": {
      const diff = daysDiffFromNow(String(current ?? ""));
      return diff !== null && diff < 0 && Math.floor(Math.abs(diff)) === Number(expected ?? 0);
    }
    case "days_remaining_gt": {
      const diff = daysDiffFromNow(String(current ?? ""));
      return diff !== null && diff < 0 && Math.abs(diff) > Number(expected ?? 0);
    }
    case "days_remaining_lt": {
      const diff = daysDiffFromNow(String(current ?? ""));
      return diff !== null && diff < 0 && Math.abs(diff) < Number(expected ?? 0);
    }
    case "hours_passed_gt": {
      const diff = hoursDiffFromNow(String(current ?? ""));
      return diff !== null && diff > Number(expected ?? 0);
    }
    case "hours_passed_lt": {
      const diff = hoursDiffFromNow(String(current ?? ""));
      return diff !== null && diff < Number(expected ?? 0);
    }
    case "hours_remaining_gt": {
      const diff = hoursDiffFromNow(String(current ?? ""));
      return diff !== null && diff < 0 && Math.abs(diff) > Number(expected ?? 0);
    }
    case "hours_remaining_lt": {
      const diff = hoursDiffFromNow(String(current ?? ""));
      return diff !== null && diff < 0 && Math.abs(diff) < Number(expected ?? 0);
    }
    case "is_friday": {
      const d = current ? new Date(String(current)) : null;
      return !!d && !isNaN(d.getTime()) && d.getDay() === 5;
    }
    case "is_official_holiday": {
      const events = await getHolidayEventsForDate(current);
      return events.some((event) => event?.isHoliday === true);
    }
    case "occasion_eq":
    case "occasion_contains": {
      return dateHasAnyOccasion(current, expected);
    }
    case "occasion_neq":
    case "occasion_not_contains": {
      return !await dateHasAnyOccasion(current, expected);
    }
    case "days_before_occasion": {
      return dateIsDaysBeforeOccasion(current, expected);
    }
    default:
      console.warn(`[workflow-runner] Unknown operator: ${operator}`);
      return true;
  }
}
async function evaluateConditions(conditionsAll, conditionsAny, record) {
  const allConditions = Array.isArray(conditionsAll) ? conditionsAll : [];
  const anyConditions = Array.isArray(conditionsAny) ? conditionsAny : [];
  if (allConditions.length > 0) {
    for (const c of allConditions) {
      if (!await evaluateCondition(c, record)) return false;
    }
  }
  if (anyConditions.length > 0) {
    let anyPassed = false;
    for (const c of anyConditions) {
      if (await evaluateCondition(c, record)) {
        anyPassed = true;
        break;
      }
    }
    if (!anyPassed) return false;
  }
  return true;
}
function parseIntervalAt(value) {
  if (!value) return null;
  const raw = String(value).replace(/[۰-۹]/g, (d) => String("\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9".indexOf(d))).replace(/[٠-٩]/g, (d) => String("\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d)));
  const m = raw.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { hour: h, minute: min };
}
function isHourAllowed(hour, from, to) {
  if (typeof from === "number" && typeof to === "number") {
    if (from <= to) return hour >= from && hour <= to;
    return hour >= from || hour <= to;
  }
  if (typeof from === "number") return hour >= from;
  if (typeof to === "number") return hour <= to;
  return true;
}
function daysInTehranMonth(localDate) {
  return new Date(Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, 0)).getUTCDate();
}
function clampMonthDay(localDate, day) {
  return Math.min(Math.max(1, day), daysInTehranMonth(localDate));
}
function applyScheduledTime(localDate, unit, workflow) {
  const next = new Date(localDate);
  if (unit === "hour") {
    if (typeof workflow.interval_minute === "number") {
      next.setUTCMinutes(Math.min(59, Math.max(0, workflow.interval_minute)), 0, 0);
    }
    return next;
  }
  if (unit === "month" && workflow.interval_day_of_month) {
    next.setUTCDate(clampMonthDay(next, workflow.interval_day_of_month));
  }
  const parsedTime = parseIntervalAt(workflow.interval_at);
  if (parsedTime) {
    next.setUTCHours(parsedTime.hour, parsedTime.minute, 0, 0);
  }
  return next;
}
function addIntervalLocal(localDate, value, unit) {
  const next = new Date(localDate);
  if (unit === "hour") next.setUTCHours(next.getUTCHours() + value);
  else if (unit === "day") next.setUTCDate(next.getUTCDate() + value);
  else if (unit === "week") next.setUTCDate(next.getUTCDate() + value * 7);
  else {
    const originalDay = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + value);
    next.setUTCDate(Math.min(originalDay, daysInTehranMonth(next)));
  }
  return next;
}
function getInitialScheduledDueAt(workflow, unit, now) {
  const firstRun = workflow.interval_first_run_at ? new Date(workflow.interval_first_run_at) : null;
  if (firstRun && !isNaN(firstRun.getTime())) {
    if (now < firstRun) return null;
    if (unit !== "week") {
      return getLatestScheduledDueAtAfter(firstRun, workflow, unit, now) || firstRun;
    }
  }
  const nowLocal = toTehranDate(now);
  let candidateLocal = new Date(nowLocal);
  if (unit === "hour") {
    if (typeof workflow.interval_minute !== "number") return now;
    candidateLocal.setUTCMinutes(Math.min(59, Math.max(0, workflow.interval_minute)), 0, 0);
  } else if (unit === "day" || unit === "week") {
    const parsedTime = parseIntervalAt(workflow.interval_at);
    if (!parsedTime) return now;
    candidateLocal.setUTCHours(parsedTime.hour, parsedTime.minute, 0, 0);
  } else {
    if (workflow.interval_day_of_month) {
      const targetDay = clampMonthDay(candidateLocal, workflow.interval_day_of_month);
      if (candidateLocal.getUTCDate() !== targetDay) return null;
      candidateLocal.setUTCDate(targetDay);
    }
    const parsedTime = parseIntervalAt(workflow.interval_at);
    if (parsedTime) candidateLocal.setUTCHours(parsedTime.hour, parsedTime.minute, 0, 0);
    else if (!workflow.interval_day_of_month) return now;
  }
  const candidate = fromTehranDate(candidateLocal);
  return now >= candidate ? candidate : null;
}
function getLatestScheduledDueAtAfter(anchor, workflow, unit, now) {
  const value = Math.max(1, parseInt(String(workflow.interval_value || 1), 10) || 1);
  let candidateLocal = toTehranDate(anchor);
  let latestDue = null;
  for (let i = 0; i < 1e4; i++) {
    candidateLocal = addIntervalLocal(candidateLocal, value, unit);
    candidateLocal = applyScheduledTime(candidateLocal, unit, workflow);
    const candidate = fromTehranDate(candidateLocal);
    if (candidate <= anchor) continue;
    if (candidate > now) break;
    latestDue = candidate;
  }
  return latestDue;
}
function getWorkflowScheduledDueAt(workflow, now) {
  const unit = String(workflow.interval_unit || "day").toLowerCase();
  const lastRunAt = workflow.last_run_at ? new Date(workflow.last_run_at) : null;
  const tehranNow = toTehranDate(now);
  if (unit === "hour") {
    if (!isHourAllowed(tehranNow.getUTCHours(), workflow.interval_allowed_from_hour, workflow.interval_allowed_to_hour)) {
      return null;
    }
  }
  if (unit === "month" && workflow.interval_day_of_month) {
    const target = clampMonthDay(tehranNow, workflow.interval_day_of_month);
    if (tehranNow.getUTCDate() !== target) return null;
  }
  if (!lastRunAt || isNaN(lastRunAt.getTime())) {
    return getInitialScheduledDueAt(workflow, unit, now);
  }
  return getLatestScheduledDueAtAfter(lastRunAt, workflow, unit, now);
}
async function isOfficialHolidayAtTehranDate(value) {
  const tehranDate = toTehranDate(value);
  const events = await getHolidayEventsForDate(tehranDate.toISOString());
  return events.some((event) => event?.isHoliday === true);
}
async function isFridayOrOfficialHoliday(value) {
  const tehranDate = toTehranDate(value);
  if (tehranDate.getUTCDay() === 5) return true;
  return isOfficialHolidayAtTehranDate(value);
}
async function getDaysSinceLastBlockedDay(now, includeOfficialHolidays) {
  for (let days = 1; days <= 370; days += 1) {
    const candidate = new Date(now.getTime() - days * 24 * 60 * 60 * 1e3);
    const blocked = includeOfficialHolidays ? await isFridayOrOfficialHoliday(candidate) : toTehranDate(candidate).getUTCDay() === 5;
    if (blocked) return days;
  }
  return null;
}
async function checkIntervalDayCondition(condition, now, daysAfterHoliday) {
  const cond = String(condition || "any").trim();
  if (!cond || cond === "any") return true;
  const day = toTehranDate(now).getUTCDay();
  if (cond === "is_friday") return day === 5;
  if (cond === "not_friday") {
    if (day === 5) return false;
    if (typeof daysAfterHoliday !== "number" || daysAfterHoliday <= 0) return true;
    return await getDaysSinceLastBlockedDay(now, false) === Math.max(0, daysAfterHoliday);
  }
  if (cond === "is_friday_or_holiday") return isFridayOrOfficialHoliday(now);
  if (cond === "not_friday_or_holiday") {
    if (await isFridayOrOfficialHoliday(now)) return false;
    if (typeof daysAfterHoliday !== "number" || daysAfterHoliday <= 0) return true;
    return await getDaysSinceLastBlockedDay(now, true) === Math.max(0, daysAfterHoliday);
  }
  if (cond === "is_saturday") return day === 6;
  if (cond === "not_saturday") return day !== 6;
  if (cond === "is_sunday") return day === 0;
  if (cond === "not_sunday") return day !== 0;
  if (cond === "is_monday") return day === 1;
  if (cond === "not_monday") return day !== 1;
  if (cond === "is_tuesday") return day === 2;
  if (cond === "not_tuesday") return day !== 2;
  if (cond === "is_wednesday") return day === 3;
  if (cond === "not_wednesday") return day !== 3;
  if (cond === "is_thursday") return day === 4;
  if (cond === "not_thursday") return day !== 4;
  return true;
}
function dbHeaders(serviceRoleKey, extra = {}) {
  return {
    "apikey": serviceRoleKey,
    "Authorization": `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    ...extra
  };
}
async function dbGet(supabaseUrl, key, path) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
  const r = await fetch(url, { method: "GET", headers: dbHeaders(key) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GET ${path} failed: ${t}`);
  }
  const data = await r.json();
  return Array.isArray(data) ? data : data ? [data] : [];
}
async function dbInsert(supabaseUrl, key, table, body) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}`;
  const r = await fetch(url, { method: "POST", headers: dbHeaders(key), body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`INSERT ${table} failed: ${t}`);
  }
  try {
    const d = await r.json();
    return Array.isArray(d) ? d[0] : d;
  } catch {
    return null;
  }
}
async function dbPatch(supabaseUrl, key, table, filter, body) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}?${filter}`;
  const r = await fetch(url, { method: "PATCH", headers: dbHeaders(key), body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`PATCH ${table} failed: ${t}`);
  }
}
async function callRpc(supabaseUrl, key, fn, args) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fn}`;
  const r = await fetch(url, { method: "POST", headers: dbHeaders(key), body: JSON.stringify(args) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`RPC ${fn} failed: ${t}`);
  }
  return await r.json();
}
async function fetchQueuedWorkflows(url, key) {
  const rows = await dbGet(
    url,
    key,
    `workflows?is_active=eq.true&trigger_type=eq.interval&server_queued_at=not.is.null&order=updated_at.asc&limit=${MAX_WORKFLOWS}`
  );
  return rows;
}
async function claimWorkflow(url, key, workflowId, expectedLastRunAt, scheduledDueAt) {
  const claimedAt = scheduledDueAt.toISOString();
  try {
    const result = await callRpc(url, key, "claim_workflow_interval_run", {
      p_workflow_id: workflowId,
      p_expected_last_run_at: expectedLastRunAt,
      p_claimed_at: claimedAt
    });
    return result === true;
  } catch {
    const filter = expectedLastRunAt ? `id=eq.${workflowId}&is_active=eq.true&trigger_type=eq.interval&last_run_at=eq.${expectedLastRunAt}` : `id=eq.${workflowId}&is_active=eq.true&trigger_type=eq.interval&last_run_at=is.null`;
    try {
      await dbPatch(url, key, "workflows", filter, { last_run_at: claimedAt, server_queued_at: null });
      return true;
    } catch {
      return false;
    }
  }
}
async function clearServerQueued(url, key, workflowId) {
  await dbPatch(url, key, "workflows", `id=eq.${workflowId}`, { server_queued_at: null }).catch(() => {
  });
}
async function fetchModuleRecordsPage(url, key, table, orgId, pageSize, offset) {
  return await dbGet(
    url,
    key,
    `${table}?org_id=eq.${orgId}&select=*&order=id.asc&limit=${pageSize}&offset=${offset}`
  );
}
async function insertWorkflowLog(url, key, log) {
  await dbInsert(url, key, "workflow_logs", {
    workflow_id: log.workflow_id,
    org_id: log.org_id,
    module_id: log.module_id,
    record_id: log.record_id,
    run_type: log.run_type,
    status: log.status,
    message: log.message || null,
    details: log.details || {}
  }).catch((e) => console.warn("[workflow-runner] Failed to insert log:", e.message));
}
function parseRecipientToken(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/^(user|role|chat_group)[:_](.+)$/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const id = m[2].trim();
  if (!id) return null;
  return { kind, id };
}
async function resolveStoryPublisher(url, key, orgId) {
  const companyRows = await dbGet(
    url,
    key,
    `company_settings?org_id=eq.${orgId}&select=logo_url&limit=1`
  ).catch(() => []);
  return {
    creatorId: null,
    creatorName: "\u0633\u06CC\u0633\u062A\u0645",
    creatorAvatar: String(companyRows[0]?.logo_url || "").trim() || null
  };
}
function normalizePhone(p) {
  const raw = String(p ?? "").replace(/[۰-۹]/g, (d) => String("\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9".indexOf(d))).replace(/[٠-٩]/g, (d) => String("\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d))).trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0098")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("98") && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.length === 10 && digits.startsWith("9")) digits = `0${digits}`;
  return digits;
}
function isValidIranMobile(p) {
  return /^09\d{9}$/.test(p);
}
async function loadChatGroups(url, key, groupIds) {
  const ids = Array.from(new Set(groupIds.map((id) => String(id || "").trim()).filter(Boolean)));
  if (ids.length === 0) return [];
  return await dbGet(url, key, `chat_groups?id=in.(${ids.join(",")})&select=id,user_ids,role_ids`).catch(() => []);
}
async function expandChatGroupsIntoSets(url, key, groupIds, userIds, roleIds) {
  const groups = await loadChatGroups(url, key, Array.from(groupIds));
  return groups.map((group) => {
    const groupId = String(group?.id || "").trim();
    const groupUserIds = asArray(group?.user_ids).map((id) => String(id || "").trim()).filter(Boolean);
    const groupRoleIds = asArray(group?.role_ids).map((id) => String(id || "").trim()).filter(Boolean);
    groupUserIds.forEach((id) => userIds.add(id));
    groupRoleIds.forEach((id) => roleIds.add(id));
    return { groupId, userIds: groupUserIds, roleIds: groupRoleIds };
  }).filter((group) => Boolean(group.groupId));
}
async function resolveAssigneesToSmsRecipients(url, key, orgId, recipientAssignees, recipientFields, record) {
  const userIds = /* @__PURE__ */ new Set();
  const roleIds = /* @__PURE__ */ new Set();
  const groupIds = /* @__PURE__ */ new Set();
  const directPhones = [];
  const processEntry = (entry) => {
    const token = parseRecipientToken(String(entry ?? ""));
    if (token?.kind === "user") {
      userIds.add(token.id);
      return;
    }
    if (token?.kind === "role") {
      roleIds.add(token.id);
      return;
    }
    if (token?.kind === "chat_group") {
      groupIds.add(token.id);
      return;
    }
    const phone = normalizePhone(String(entry ?? ""));
    if (phone) directPhones.push(phone);
  };
  (Array.isArray(recipientAssignees) ? recipientAssignees : []).forEach(processEntry);
  for (const fieldKey of Array.isArray(recipientFields) ? recipientFields : []) {
    const val = await resolveWorkflowFieldValue(url, key, String(fieldKey ?? ""), record);
    if (Array.isArray(val)) val.forEach(processEntry);
    else processEntry(val);
  }
  await expandChatGroupsIntoSets(url, key, groupIds, userIds, roleIds);
  const phones = [...directPhones];
  if (userIds.size > 0) {
    const ids = Array.from(userIds).join(",");
    const profiles = await dbGet(url, key, `profiles?id=in.(${ids})&select=mobile_1,mobile_2,mobile`).catch(() => []);
    profiles.forEach((p) => {
      [p.mobile_1, p.mobile_2, p.mobile].map(normalizePhone).filter(isValidIranMobile).forEach((ph) => phones.push(ph));
    });
  }
  if (roleIds.size > 0) {
    const ids = Array.from(roleIds).join(",");
    const profiles = await dbGet(url, key, `profiles?role_id=in.(${ids})&org_id=eq.${orgId}&select=mobile_1,mobile_2,mobile`).catch(() => []);
    profiles.forEach((p) => {
      [p.mobile_1, p.mobile_2, p.mobile].map(normalizePhone).filter(isValidIranMobile).forEach((ph) => phones.push(ph));
    });
  }
  return Array.from(new Set(phones.filter(isValidIranMobile)));
}
async function resolveAssigneesToMentionTargets(url, key, orgId, recipientAssignees, recipientFields, record) {
  const userIds = /* @__PURE__ */ new Set();
  const roleIds = /* @__PURE__ */ new Set();
  const groupIds = /* @__PURE__ */ new Set();
  const processEntry = (entry) => {
    const token = parseRecipientToken(String(entry ?? ""));
    if (token?.kind === "user") {
      userIds.add(token.id);
      return;
    }
    if (token?.kind === "role") {
      roleIds.add(token.id);
      return;
    }
    if (token?.kind === "chat_group") {
      groupIds.add(token.id);
      return;
    }
  };
  (Array.isArray(recipientAssignees) ? recipientAssignees : []).forEach(processEntry);
  for (const fieldKey of Array.isArray(recipientFields) ? recipientFields : []) {
    const val = await resolveWorkflowFieldValue(url, key, String(fieldKey ?? ""), record);
    if (Array.isArray(val)) val.forEach(processEntry);
    else processEntry(val);
  }
  const groupRows = await loadChatGroups(url, key, Array.from(groupIds));
  const groupTargets = groupRows.map((group) => {
    const groupId = String(group?.id || "").trim();
    if (!groupId) return null;
    return {
      groupId,
      userIds: asArray(group?.user_ids).map((id) => String(id || "").trim()).filter(Boolean),
      roleIds: asArray(group?.role_ids).map((id) => String(id || "").trim()).filter(Boolean)
    };
  }).filter(Boolean);
  return {
    mentionUserIds: Array.from(userIds),
    mentionRoleIds: Array.from(roleIds),
    groupTargets
  };
}
async function resolveAssigneesToBotChatIds(url, key, orgId, recipientAssignees, recipientFields, record, channel) {
  const userIds = /* @__PURE__ */ new Set();
  const roleIds = /* @__PURE__ */ new Set();
  const groupIds = /* @__PURE__ */ new Set();
  const directChatIds = [];
  const processEntry = (entry) => {
    const token = parseRecipientToken(String(entry ?? ""));
    if (token?.kind === "user") {
      userIds.add(token.id);
      return;
    }
    if (token?.kind === "role") {
      roleIds.add(token.id);
      return;
    }
    if (token?.kind === "chat_group") {
      groupIds.add(token.id);
      return;
    }
    const v = String(entry ?? "").trim();
    if (v && !UUID_LIKE_REGEX.test(v)) directChatIds.push(v);
  };
  (Array.isArray(recipientAssignees) ? recipientAssignees : []).forEach(processEntry);
  for (const fk of Array.isArray(recipientFields) ? recipientFields : []) {
    const val = await resolveWorkflowFieldValue(url, key, String(fk ?? ""), record);
    if (Array.isArray(val)) val.forEach(processEntry);
    else processEntry(val);
  }
  await expandChatGroupsIntoSets(url, key, groupIds, userIds, roleIds);
  const chatIdField = channel === "telegram" ? "telegram_chat_id" : channel === "rubika" ? "rubika_chat_id" : "bale_chat_id";
  const chatIds = [...directChatIds];
  const allUserIds = new Set(userIds);
  if (roleIds.size > 0) {
    const ids = Array.from(roleIds).join(",");
    const profiles = await dbGet(url, key, `profiles?role_id=in.(${ids})&org_id=eq.${orgId}&select=id`).catch(() => []);
    profiles.forEach((p) => {
      if (p.id) allUserIds.add(String(p.id));
    });
  }
  if (allUserIds.size > 0) {
    const ids = Array.from(allUserIds).join(",");
    const profiles = await dbGet(url, key, `profiles?id=in.(${ids})&select=${chatIdField}`).catch(() => []);
    profiles.forEach((p) => {
      const v = String(p?.[chatIdField] || "").trim();
      if (v) chatIds.push(v);
    });
  }
  return Array.from(new Set(chatIds.filter(Boolean)));
}
async function resolveCounterpartyBotTargets(url, key, orgId, moduleId, record, recipientFields, explicitChannel) {
  const customerIds = /* @__PURE__ */ new Set();
  const supplierIds = /* @__PURE__ */ new Set();
  const addUuid = (target, value) => {
    const normalized = String(value || "").trim();
    if (UUID_LIKE_REGEX.test(normalized)) target.add(normalized);
  };
  if (moduleId === "customers") addUuid(customerIds, record?.id);
  if (moduleId === "suppliers") addUuid(supplierIds, record?.id);
  addUuid(customerIds, record?.customer_id || record?.related_customer);
  addUuid(supplierIds, record?.supplier_id || record?.related_supplier);
  for (const fieldKey of Array.isArray(recipientFields) ? recipientFields : []) {
    const normalizedFieldKey = String(fieldKey || "").trim();
    const value = await resolveWorkflowFieldValue(url, key, normalizedFieldKey, record);
    const values = Array.isArray(value) ? value : [value];
    const targetSet = /supplier/i.test(normalizedFieldKey) ? supplierIds : customerIds;
    values.forEach((item) => addUuid(targetSet, item));
  }
  const select = "customer_id,supplier_id,bot_chat_id,channel_type,status";
  const [customerRows, supplierRows] = await Promise.all([
    customerIds.size > 0 ? dbGet(
      url,
      key,
      `counterparty_bot_groups?org_id=eq.${orgId}&customer_id=in.(${Array.from(customerIds).join(",")})&status=eq.active&select=${select}`
    ).catch(() => []) : Promise.resolve([]),
    supplierIds.size > 0 ? dbGet(
      url,
      key,
      `counterparty_bot_groups?org_id=eq.${orgId}&supplier_id=in.(${Array.from(supplierIds).join(",")})&status=eq.active&select=${select}`
    ).catch(() => []) : Promise.resolve([])
  ]);
  const normalizedExplicitChannel = String(explicitChannel || "").trim().toLowerCase();
  return [...customerRows, ...supplierRows].map((row) => {
    const channel = String(row?.channel_type || "").trim().toLowerCase();
    const chatId = String(row?.bot_chat_id || "").trim();
    if (!chatId || !["bale", "telegram", "rubika"].includes(channel)) return null;
    if (normalizedExplicitChannel && channel !== normalizedExplicitChannel) return null;
    return { channel, chatId };
  }).filter(Boolean);
}
async function getOrgSmsSettings(url, key, orgId) {
  const rows = await dbGet(
    url,
    key,
    `integration_settings?org_id=eq.${orgId}&connection_type=eq.sms&is_active=eq.true&limit=1`
  ).catch(() => []);
  if (rows.length === 0) return null;
  const settings = rows[0]?.settings || {};
  return {
    ...settings,
    username: Deno.env.get("MELIPAYAMAK_USERNAME") || settings.username || "",
    password: Deno.env.get("MELIPAYAMAK_PASSWORD") || settings.password || "",
    api_key: Deno.env.get("MELIPAYAMAK_API_KEY") || settings.api_key || "",
    sender_number: Deno.env.get("MELIPAYAMAK_SENDER_NUMBER") || settings.sender_number || ""
  };
}
async function insertSmsAudit(url, key, payload) {
  await dbInsert(url, key, "outbound_messages", {
    org_id: payload.orgId,
    channel_type: "sms",
    direction: "outbound",
    provider: "meli_payamak",
    module_id: payload.moduleId || null,
    record_id: payload.recordId || null,
    customer_id: payload.moduleId === "customers" ? payload.recordId || null : null,
    recipient: payload.recipient || null,
    title: "\u0627\u0631\u0633\u0627\u0644 \u067E\u06CC\u0627\u0645\u06A9 \u062E\u0648\u062F\u06A9\u0627\u0631",
    message_text: payload.text,
    status: payload.status,
    error_message: payload.errorMessage || null,
    metadata: {
      source_type: "workflow",
      runner_build: FUNCTION_BUILD,
      ...payload.metadata || {}
    },
    sent_at: payload.status === "provider_accepted" ? (/* @__PURE__ */ new Date()).toISOString() : null
  }).catch((e) => console.warn("[workflow-runner] Failed to insert SMS audit:", e.message));
}
async function auditSmsBatch(url, key, payload) {
  for (const recipient of payload.recipients) {
    await insertSmsAudit(url, key, {
      orgId: payload.orgId,
      moduleId: payload.moduleId,
      recordId: payload.recordId,
      recipient,
      text: payload.text,
      status: payload.status,
      errorMessage: payload.errorMessage,
      metadata: payload.metadata
    });
  }
}
async function sendSmsViaProvider(settings, to, text) {
  const username = String(settings.username || "").trim();
  const password = String(settings.password || settings.api_key || "").trim();
  const apiKey = String(settings.api_key || "").trim();
  const senderNumber = String(settings.sender_number || "").trim();
  if (!senderNumber || !username && !apiKey) throw new Error("\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u067E\u06CC\u0627\u0645\u06A9 \u0646\u0627\u0642\u0635 \u0627\u0633\u062A");
  if (!text.trim()) throw new Error("\u0645\u062A\u0646 \u067E\u06CC\u0627\u0645\u06A9 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A");
  const sentRecipients = [];
  for (const recipient of to) {
    const phone = normalizePhone(recipient);
    if (!isValidIranMobile(phone)) {
      console.warn("[workflow-runner] Invalid phone:", phone);
      continue;
    }
    const form = new URLSearchParams({
      UserName: username,
      PassWord: password || apiKey,
      To: phone,
      From: senderNumber,
      Text: text,
      IsFlash: "false"
    });
    const r = await fetch("https://api.payamak-panel.com/post/send.asmx/SendSimpleSMS2", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: form.toString(),
      signal: AbortSignal.timeout(1e4)
    });
    if (!r.ok) throw new Error(`\u067E\u0627\u0633\u062E \u067E\u06CC\u0627\u0645\u06A9 \u062E\u0637\u0627: ${r.status}`);
    sentRecipients.push(phone);
  }
  return sentRecipients;
}
async function getOrgBotSettings(url, key, orgId, channel) {
  const rows = await dbGet(
    url,
    key,
    `integration_settings?org_id=eq.${orgId}&connection_type=eq.${channel}&is_active=eq.true&limit=1`
  ).catch(() => []);
  return rows.length > 0 ? rows[0]?.settings || null : null;
}
async function sendBotMessage(chatId, text, settings, channel) {
  const token = String(settings.bot_token || settings.token || "").trim();
  if (!token || !chatId) return;
  const isTelegram = channel === "telegram";
  const isRubika = channel === "rubika";
  const baseUrl = isRubika ? `https://rubika.ir/rubika/bots/${token}/sendMessage` : isTelegram ? `https://api.telegram.org/bot${token}/sendMessage` : `https://tapi.bale.ai/bot${token}/sendMessage`;
  const payload = { chat_id: chatId, text, parse_mode: "HTML" };
  await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8e3)
  }).then(async (response) => {
    if (!response.ok) {
      const raw = await response.text().catch(() => String(response.status));
      throw new Error(`\u0627\u0631\u0633\u0627\u0644 \u067E\u06CC\u0627\u0645 ${channel} \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${raw || response.status}`);
    }
  });
}
async function insertNote(url, key, note) {
  await dbInsert(url, key, "notes", note);
}
function getModuleTable(moduleId) {
  const TABLE_MAP = {
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
    payrollSlips: "payroll_slips",
    recruitmentApplicants: "recruitment_applicants",
    processTemplates: "process_templates",
    processRuns: "process_runs",
    webForms: "web_forms",
    secretariatDocuments: "secretariat_documents",
    smsDeliveryReports: "sms_delivery_reports",
    voipCallReports: "voip_call_reports",
    automationExecutionReports: "automation_execution_reports",
    counterpartyBotGroups: "counterparty_bot_groups"
  };
  return TABLE_MAP[moduleId] || moduleId;
}
async function updateRecord(url, key, moduleId, recordId, patch, actorUserId = null, orgId) {
  const table = getModuleTable(moduleId);
  const payload = { ...patch, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  if (actorUserId) payload.updated_by = actorUserId;
  const filter = orgId ? `id=eq.${recordId}&org_id=eq.${orgId}` : `id=eq.${recordId}`;
  await dbPatch(url, key, table, filter, payload);
}
async function createRecord(url, key, moduleId, orgId, payload, actorUserId = null) {
  const table = getModuleTable(moduleId);
  const body = { org_id: orgId, ...payload };
  if (actorUserId) {
    if (!body.created_by) body.created_by = actorUserId;
    if (!body.updated_by) body.updated_by = actorUserId;
  }
  return await dbInsert(url, key, table, body);
}
async function createWorkflowAiThread(url, key, input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const sharedUserIds = Array.from(new Set((input.sharedUserIds || []).filter(Boolean)));
  const sharedRoleIds = Array.from(new Set((input.sharedRoleIds || []).filter(Boolean)));
  const thread = await dbInsert(url, key, "ai_threads", {
    org_id: input.orgId,
    user_id: null,
    status: "active",
    title: "\u067E\u0631\u0627\u0645\u067E\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u06AF\u0631\u062F\u0634 \u06A9\u0627\u0631",
    context_type: "workflow",
    context_key: `workflow:${input.moduleId}:${input.recordId || "record"}:${input.actionId || "action"}:${Date.now()}`,
    module_id: input.moduleId,
    record_id: input.recordId,
    provider: input.provider || "avalai",
    model: input.model || "",
    is_shared: sharedUserIds.length > 0 || sharedRoleIds.length > 0,
    shared_user_ids: sharedUserIds,
    shared_role_ids: sharedRoleIds,
    metadata: {
      source: "workflow_interval_runner",
      context_kind: "workflow",
      context_label: "\u06AF\u0631\u062F\u0634 \u06A9\u0627\u0631",
      workflow_action_id: input.actionId || null,
      last_activity_kind: "workflow_ai_prompt",
      last_message_preview: input.prompt.slice(0, 300),
      ...input.metadata || {}
    },
    created_at: now,
    updated_at: now
  });
  if (!thread?.id) return null;
  await dbInsert(url, key, "ai_messages", {
    org_id: input.orgId,
    thread_id: thread.id,
    role: "user",
    content: input.prompt,
    provider: input.provider || "avalai",
    model: input.model || "",
    metadata: { source: "workflow_interval_runner", input_kind: "workflow_prompt" },
    created_at: now
  });
  const assistantMessage = await dbInsert(url, key, "ai_messages", {
    org_id: input.orgId,
    thread_id: thread.id,
    role: "assistant",
    content: input.answer,
    provider: input.provider || "avalai",
    model: input.model || "",
    metadata: { source: "workflow_interval_runner", capability: "workflow_ai_prompt" },
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return { thread, assistantMessage };
}
async function loadWorkflowAiModel(url, key, orgId) {
  const rows = await dbGet(url, key, `org_ai_settings?org_id=eq.${orgId}&select=selected_models&limit=1`).catch(() => []);
  const selected = rows?.[0]?.selected_models && typeof rows[0].selected_models === "object" ? rows[0].selected_models : {};
  const requested = String(selected.workflow_ai_prompt || "").trim();
  const catalogRows = await dbGet(url, key, "ai_model_catalog?select=id,provider,capability_tags,is_active,is_coming_soon&limit=500").catch(() => []);
  const allowed = (catalogRows || []).filter((model) => {
    const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
    return model?.is_active !== false && model?.is_coming_soon !== true && tags.includes("workflow_ai_prompt") && String(model?.id || "").trim();
  });
  if (allowed.length === 0) {
    throw new Error("\u0628\u0631\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC \u067E\u0631\u0627\u0645\u067E\u062A \u06AF\u0631\u062F\u0634 \u06A9\u0627\u0631\u060C \u0645\u062F\u0644 \u0641\u0639\u0627\u0644 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0633\u0627\u0632\u0645\u0627\u0646 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  }
  const allowedIds = new Set(allowed.map((model) => String(model?.id || "").trim()));
  return allowedIds.has(requested) ? requested : String(allowed[0]?.id || "").trim();
}
var truthyPlanFeature = (value) => {
  if (value === true) return true;
  if (typeof value === "string") {
    return ["true", "enabled", "full", "limited"].includes(value.trim().toLowerCase());
  }
  return Boolean(value && typeof value === "object" && (value.enabled === true || value.available === true));
};
async function assertWorkflowAiEnabled(url, key, orgId) {
  const orgRows = await dbGet(
    url,
    key,
    `saas_org_settings?org_id=eq.${orgId}&select=plan_code,feature_overrides,status,is_readonly&limit=1`
  ).catch(() => []);
  const orgSettings = orgRows[0] || null;
  if (!orgSettings) throw new Error("\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u067E\u0644\u0646 \u0633\u0627\u0632\u0645\u0627\u0646 \u0628\u0631\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  const planCode = String(orgSettings?.plan_code || "").trim();
  const planRows = planCode ? await dbGet(url, key, `saas_plans?code=eq.${encodeURIComponent(planCode)}&select=enabled_features,is_active&limit=1`).catch(() => []) : [];
  const plan = planRows[0] || null;
  if (!plan || plan?.is_active === false) {
    throw new Error("\u067E\u0644\u0646 \u0641\u0639\u0627\u0644 \u0633\u0627\u0632\u0645\u0627\u0646 \u0628\u0631\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  }
  const features = {
    ...plan?.enabled_features && typeof plan.enabled_features === "object" ? plan.enabled_features : {},
    ...orgSettings?.feature_overrides && typeof orgSettings.feature_overrides === "object" ? orgSettings.feature_overrides : {}
  };
  if (!truthyPlanFeature(features.ai_chat) && !truthyPlanFeature(features.ai_knowledge)) {
    throw new Error("\u0642\u0627\u0628\u0644\u06CC\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u06AF\u0631\u062F\u0634 \u06A9\u0627\u0631 \u062F\u0631 \u067E\u0644\u0646 \u0641\u0639\u0644\u06CC \u0633\u0627\u0632\u0645\u0627\u0646 \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A.");
  }
  const aiSettingsRows = await dbGet(
    url,
    key,
    `org_ai_settings?org_id=eq.${orgId}&select=feature_flags&limit=1`
  ).catch(() => []);
  const flags = aiSettingsRows[0]?.feature_flags && typeof aiSettingsRows[0].feature_flags === "object" ? aiSettingsRows[0].feature_flags : {};
  if (flags.workflow_ai_prompt === false) {
    throw new Error("\u067E\u0631\u0627\u0645\u067E\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0627\u0632\u0645\u0627\u0646 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A.");
  }
}
function normalizeAiBaseUrl(value) {
  const raw = String(value || DEFAULT_AI_BASE_URL).trim().replace(/\/+$/, "");
  if (!raw) return DEFAULT_AI_BASE_URL;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}
function workflowAiBaseUrls() {
  const primary = Deno.env.get("AVALAI_BASE_URL") || Deno.env.get("AI_BASE_URL") || DEFAULT_AI_BASE_URL;
  const fallbackRaw = Deno.env.get("AVALAI_FALLBACK_BASE_URLS") || Deno.env.get("AI_FALLBACK_BASE_URLS") || Deno.env.get("AVALAI_FALLBACK_BASE_URL") || DEFAULT_AI_FALLBACK_BASE_URL;
  const seen = /* @__PURE__ */ new Set();
  return [primary, ...String(fallbackRaw).split(",")].map((item) => normalizeAiBaseUrl(item)).filter((item) => {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function isRetryableAiStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}
function extractJsonObjectFromText(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const candidates = [normalized];
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(normalized.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
    }
  }
  return null;
}
function sanitizeAiRecordPayload(rawPayload, schema) {
  const blockedKeys = /* @__PURE__ */ new Set([
    "id",
    "org_id",
    "system_code",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "deleted_at"
  ]);
  const allowedFields = Array.isArray(schema?.fields) ? schema.fields.map((field) => String(field?.key || "").trim()).filter((fieldKey) => fieldKey && !blockedKeys.has(fieldKey)) : [];
  const allowed = new Set(allowedFields);
  const rawFields = rawPayload?.fields && typeof rawPayload.fields === "object" ? rawPayload.fields : rawPayload;
  const payload = {};
  Object.entries(rawFields || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey || !allowed.has(normalizedKey)) return;
    if (value === void 0 || value === "") {
      payload[normalizedKey] = null;
      return;
    }
    payload[normalizedKey] = value;
  });
  return payload;
}
function buildAiRecordTitle(record, fallback) {
  return String(
    record?.system_code || record?.name || record?.title || record?.full_name || record?.business_name || record?.invoice_number || fallback || "\u0631\u06A9\u0648\u0631\u062F \u062C\u062F\u06CC\u062F"
  ).trim();
}
function normalizeWorkflowAiProcessStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "completed") return "done";
  if (["todo", "planned", "in_progress", "review", "done", "blocked", "canceled"].includes(normalized)) return normalized;
  return "todo";
}
function addDaysIso(days) {
  const amount = Number(days);
  if (!Number.isFinite(amount)) return null;
  const date = /* @__PURE__ */ new Date();
  date.setDate(date.getDate() + amount);
  return date.toISOString();
}
async function loadWorkflowProcessContext(url, key, orgId, moduleId, recordId) {
  const templateRows = await dbGet(
    url,
    key,
    `process_templates?org_id=eq.${orgId}&is_active=eq.true&select=*&order=updated_at.desc&limit=60`
  ).catch(() => []);
  const templates = templateRows.filter((template) => {
    const primary = String(template?.module_id || "").trim();
    const modules = Array.isArray(template?.module_ids) ? template.module_ids.map((item) => String(item || "").trim()) : [];
    return !primary || primary === moduleId || primary === "tasks" || primary === "process_runs" || modules.includes(moduleId);
  }).slice(0, 30);
  const templateIds = templates.map((template) => String(template?.id || "").trim()).filter(Boolean);
  const templateStages = templateIds.length ? await dbGet(url, key, `process_template_stages?template_id=in.(${templateIds.join(",")})&select=*&order=sort_order.asc&limit=300`).catch(() => []) : [];
  const runs = recordId ? await dbGet(
    url,
    key,
    `process_runs?org_id=eq.${orgId}&module_id=eq.${moduleId}&record_id=eq.${recordId}&select=*&order=created_at.desc&limit=20`
  ).catch(() => []) : [];
  const runIds = runs.map((run) => String(run?.id || "").trim()).filter(Boolean);
  const runStages = runIds.length ? await dbGet(url, key, `process_run_stages?process_run_id=in.(${runIds.join(",")})&select=*&order=sort_order.asc&limit=400`).catch(() => []) : [];
  const tasks = recordId ? await dbGet(
    url,
    key,
    `tasks?org_id=eq.${orgId}&source_module_id=eq.${moduleId}&source_record_id=eq.${recordId}&select=*&order=sort_order.asc&limit=300`
  ).catch(() => []) : [];
  const stagesByTemplateId = /* @__PURE__ */ new Map();
  templateStages.forEach((stage) => {
    const id = String(stage?.template_id || "").trim();
    stagesByTemplateId.set(id, [...stagesByTemplateId.get(id) || [], stage]);
  });
  const stagesByRunId = /* @__PURE__ */ new Map();
  runStages.forEach((stage) => {
    const id = String(stage?.process_run_id || "").trim();
    stagesByRunId.set(id, [...stagesByRunId.get(id) || [], stage]);
  });
  return {
    templates: templates.map((template) => ({ ...template, stages: (stagesByTemplateId.get(String(template.id)) || []).slice(0, 40) })),
    runs: runs.map((run) => ({ ...run, stages: (stagesByRunId.get(String(run.id)) || []).slice(0, 60) })),
    tasks
  };
}
function buildWorkflowProcessPrompt(prompt, input) {
  return [
    "\u0634\u0645\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 \u0627\u062C\u0631\u0627\u06CC \u062E\u0648\u062F\u06A9\u0627\u0631 \u0641\u0631\u0622\u06CC\u0646\u062F \u062A\u0627\u0632\u0647 \u0633\u06CC\u0633\u062A\u0645 \u0647\u0633\u062A\u06CC\u062F. \u0641\u0642\u0637 JSON \u0645\u0639\u062A\u0628\u0631 \u0628\u0631\u06AF\u0631\u062F\u0627\u0646 \u0648 \u0647\u06CC\u0686 \u062A\u0648\u0636\u06CC\u062D \u062E\u0627\u0631\u062C \u0627\u0632 JSON \u0646\u0646\u0648\u06CC\u0633.",
    "\u0641\u0642\u0637 \u0627\u0632 \u0627\u0644\u06AF\u0648\u0647\u0627\u060C \u0627\u062C\u0631\u0627\u0647\u0627\u060C \u0645\u0631\u062D\u0644\u0647\u200C\u0647\u0627 \u0648 task\u0647\u0627\u06CC\u06CC \u06A9\u0647 \u062F\u0631 context \u0622\u0645\u062F\u0647 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646. UUID \u062A\u0627\u0632\u0647 \u06CC\u0627 \u0633\u0627\u062E\u062A\u06AF\u06CC \u0646\u0633\u0627\u0632.",
    "\u062D\u0630\u0641 \u0641\u06CC\u0632\u06CC\u06A9\u06CC \u0645\u0631\u062D\u0644\u0647 \u0645\u062C\u0627\u0632 \u0646\u06CC\u0633\u062A\u061B \u0628\u0631\u0627\u06CC \u06A9\u0645 \u06A9\u0631\u062F\u0646 \u0645\u0631\u062D\u0644\u0647 \u0627\u0632 cancel_stage_task \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646.",
    "operation\u0647\u0627\u06CC \u0645\u062C\u0627\u0632: materialize_template_to_tasks\u060C create_raw_process_with_tasks\u060C add_stage_task\u060C update_stage_task\u060C cancel_stage_task.",
    "\u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0641\u0631\u0622\u06CC\u0646\u062F \u062E\u0627\u0645\u060C stages \u0628\u0627\u06CC\u062F \u0645\u0631\u062A\u0628 \u0648 \u0642\u0627\u0628\u0644 \u062A\u0628\u062F\u06CC\u0644 \u0628\u0647 task \u0648\u0627\u0642\u0639\u06CC \u0628\u0627\u0634\u0646\u062F.",
    '\u0642\u0627\u0644\u0628 \u062E\u0631\u0648\u062C\u06CC: {"reply":"\u067E\u06CC\u0627\u0645 \u06A9\u0648\u062A\u0627\u0647 \u0641\u0627\u0631\u0633\u06CC","operations":[{"type":"create_raw_process_with_tasks","process_name":"...","stages":[{"name":"...","sort_order":10,"task_type":"\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC","status":"todo","due_days":2,"custom_fields":[],"custom_values":{},"status_options":[],"automation_rules":[]}]}]}',
    "",
    `\u062F\u0631\u062E\u0648\u0627\u0633\u062A: ${prompt}`,
    JSON.stringify(input)
  ].join("\n");
}
async function insertWorkflowProcessTask(url, key, orgId, moduleId, recordId, processRun, runStage, stage, actorUserId = null) {
  const name = String(stage?.name || stage?.stage_name || stage?.title || runStage?.stage_name || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0641\u0631\u0622\u06CC\u0646\u062F").trim() || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0641\u0631\u0622\u06CC\u0646\u062F";
  const processNodeKey = String(
    runStage?.process_node_key || runStage?.metadata?.process_node_key || stage?.process_node_key || stage?.metadata?.process_node_key || ""
  ).trim() || null;
  const processLaneKey = String(
    runStage?.process_lane_key || runStage?.metadata?.process_lane_key || stage?.process_lane_key || stage?.metadata?.process_lane_key || "lane_1"
  ).trim() || "lane_1";
  const processGraph = runStage?.metadata?.process_graph || stage?.process_graph || stage?.metadata?.process_graph || null;
  const payload = {
    org_id: orgId,
    name,
    status: normalizeWorkflowAiProcessStatus(stage?.task_status || stage?.status || runStage?.status),
    priority: String(stage?.priority || "medium").trim() || "medium",
    description: String(stage?.description || stage?.metadata?.description || "").trim() || null,
    task_type: String(stage?.task_type || stage?.metadata?.task_type || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC").trim() || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC",
    due_date: stage?.due_date || stage?.due_at || addDaysIso(stage?.due_days),
    wage: Number(stage?.wage || runStage?.wage || 0) || 0,
    weight: Number(stage?.weight || 0) || 0,
    sort_order: Number(stage?.sort_order || runStage?.sort_order || 10) || 10,
    source_template_id: processRun?.template_id || stage?.template_id || null,
    source_stage_sort_order: Number(stage?.sort_order || runStage?.sort_order || 10) || 10,
    process_group_id: processRun?.process_group_id || processRun?.id || null,
    process_run_id: processRun?.id || null,
    process_run_stage_id: runStage?.id || null,
    process_node_key: processNodeKey,
    process_lane_key: processLaneKey,
    related_to_module: moduleId,
    source_module_id: moduleId,
    source_record_id: recordId,
    recurrence_info: {
      task_type: String(stage?.task_type || stage?.metadata?.task_type || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC").trim() || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC",
      process_automation_rules: Array.isArray(stage?.automation_rules) ? stage.automation_rules : Array.isArray(stage?.metadata?.automation_rules) ? stage.metadata.automation_rules : [],
      process_target_module_ids: Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : [moduleId],
      process_links: { [moduleId]: recordId },
      process_run_id: processRun?.id || null,
      process_run_stage_id: runStage?.id || null,
      process_node_key: processNodeKey,
      process_lane_key: processLaneKey,
      process_graph: processGraph,
      process_group: {
        id: processRun?.process_group_id || processRun?.id || null,
        name: processRun?.process_name || null,
        template_id: processRun?.template_id || null
      },
      process_task_custom_fields: Array.isArray(stage?.custom_fields) ? stage.custom_fields : Array.isArray(stage?.metadata?.custom_fields) ? stage.metadata.custom_fields : [],
      process_task_status_options: Array.isArray(stage?.status_options) ? stage.status_options : Array.isArray(stage?.metadata?.status_options) ? stage.metadata.status_options : [],
      process_task_custom_field_values: stage?.custom_values && typeof stage.custom_values === "object" ? stage.custom_values : {}
    }
  };
  if (actorUserId) {
    payload.created_by = actorUserId;
    payload.updated_by = actorUserId;
  }
  return await dbInsert(url, key, "tasks", payload);
}
async function executeWorkflowProcessOperation(url, key, orgId, moduleId, recordId, operation, processContext, actorUserId = null) {
  const type = String(operation?.type || "").trim();
  if (type === "materialize_template_to_tasks") {
    const templateId = String(operation?.template_id || "").trim();
    const template = (processContext.templates || []).find((item) => String(item?.id || "") === templateId);
    if (!template) throw new Error("\u0627\u0644\u06AF\u0648\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F \u0645\u062C\u0627\u0632 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    const runIdResult = await callRpc(url, key, "create_process_run_from_template", {
      p_org_id: orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: recordId,
      p_process_name: String(operation?.process_name || template?.name || "").trim() || null,
      p_copied_mode: "auto"
    });
    const processRunId = Array.isArray(runIdResult) ? String(runIdResult[0] || "").trim() : String(runIdResult || "").trim();
    if (actorUserId && processRunId) {
      await dbPatch(url, key, "process_runs", `id=eq.${processRunId}&org_id=eq.${orgId}`, { created_by: actorUserId, updated_by: actorUserId, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).catch(() => {
      });
      await dbPatch(url, key, "process_run_stages", `process_run_id=eq.${processRunId}`, { created_by: actorUserId, updated_by: actorUserId, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).catch(() => {
      });
    }
    const runRows = await dbGet(url, key, `process_runs?id=eq.${processRunId}&org_id=eq.${orgId}&select=*&limit=1`).catch(() => []);
    const processRun = runRows[0] || { id: processRunId, template_id: templateId, process_name: operation?.process_name || template?.name };
    const stageRows = await dbGet(url, key, `process_run_stages?process_run_id=eq.${processRunId}&select=*&order=sort_order.asc&limit=200`).catch(() => []);
    const createdTasks = [];
    for (const runStage of stageRows) {
      if (runStage?.task_id) continue;
      const templateStage = (template.stages || []).find((stage) => String(stage?.id || "") === String(runStage?.template_stage_id || "")) || {};
      if (templateStage?.auto_create_task === false && operation?.force !== true) continue;
      const task = await insertWorkflowProcessTask(url, key, orgId, moduleId, recordId, processRun, runStage, { ...templateStage, ...runStage, name: runStage.stage_name }, actorUserId);
      if (task?.id) {
        createdTasks.push({ id: task.id, title: buildAiRecordTitle(task, task.name), stage_id: runStage.id });
        const stagePatch = {
          task_id: task.id,
          status: normalizeWorkflowAiProcessStatus(task.status),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (actorUserId) stagePatch.updated_by = actorUserId;
        await dbPatch(url, key, "process_run_stages", `id=eq.${runStage.id}`, stagePatch).catch(() => {
        });
      }
    }
    return { type, process_run_id: processRunId, created_tasks: createdTasks };
  }
  if (type === "create_raw_process_with_tasks" || type === "add_stage_task") {
    let processRun = null;
    const requestedRunId = String(operation?.process_run_id || "").trim();
    if (requestedRunId) {
      processRun = (processContext.runs || []).find((run) => String(run?.id || "") === requestedRunId) || null;
    }
    if (!processRun) {
      const processRunPayload = {
        org_id: orgId,
        template_id: null,
        module_id: moduleId,
        record_id: recordId,
        process_name: String(operation?.process_name || "\u0641\u0631\u0622\u06CC\u0646\u062F \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC").trim() || "\u0641\u0631\u0622\u06CC\u0646\u062F \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC",
        status: "active",
        copied_mode: "auto",
        started_at: (/* @__PURE__ */ new Date()).toISOString(),
        process_group_id: `ai_process_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      };
      if (actorUserId) {
        processRunPayload.created_by = actorUserId;
        processRunPayload.updated_by = actorUserId;
      }
      processRun = await dbInsert(url, key, "process_runs", processRunPayload);
    }
    const stages = type === "add_stage_task" ? [operation] : Array.isArray(operation?.stages) ? operation.stages : [];
    const createdTasks = [];
    for (const [index, stage] of stages.entries()) {
      const stageName = String(stage?.name || stage?.stage_name || `\u0645\u0631\u062D\u0644\u0647 ${index + 1}`).trim() || `\u0645\u0631\u062D\u0644\u0647 ${index + 1}`;
      const runStagePayload = {
        process_run_id: processRun.id,
        template_stage_id: null,
        stage_name: stageName,
        sort_order: Number(stage?.sort_order || (index + 1) * 10) || (index + 1) * 10,
        status: normalizeWorkflowAiProcessStatus(stage?.status),
        wage: Number(stage?.wage || 0) || 0,
        metadata: {
          source: "workflow_ai_prompt",
          custom_fields: Array.isArray(stage?.custom_fields) ? stage.custom_fields : [],
          custom_values: stage?.custom_values && typeof stage.custom_values === "object" ? stage.custom_values : {},
          status_options: Array.isArray(stage?.status_options) ? stage.status_options : [],
          automation_rules: Array.isArray(stage?.automation_rules) ? stage.automation_rules : []
        }
      };
      if (actorUserId) {
        runStagePayload.created_by = actorUserId;
        runStagePayload.updated_by = actorUserId;
      }
      const runStage = await dbInsert(url, key, "process_run_stages", runStagePayload);
      const task = await insertWorkflowProcessTask(url, key, orgId, moduleId, recordId, processRun, runStage, stage, actorUserId);
      if (task?.id) {
        createdTasks.push({ id: task.id, title: buildAiRecordTitle(task, task.name), stage_id: runStage?.id || null });
        if (runStage?.id) {
          const stagePatch = { task_id: task.id, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
          if (actorUserId) stagePatch.updated_by = actorUserId;
          await dbPatch(url, key, "process_run_stages", `id=eq.${runStage.id}`, stagePatch).catch(() => {
          });
        }
      }
    }
    return { type, process_run_id: processRun?.id || null, created_tasks: createdTasks };
  }
  if (type === "update_stage_task") {
    const taskId = String(operation?.task_id || "").trim();
    const stageId = String(operation?.stage_id || operation?.process_run_stage_id || "").trim();
    const task = taskId ? (processContext.tasks || []).find((item) => String(item?.id || "") === taskId) : (processContext.tasks || []).find((item) => String(item?.process_run_stage_id || "") === stageId);
    if (!task?.id) throw new Error("\u0641\u0639\u0627\u0644\u06CC\u062A \u0642\u0627\u0628\u0644 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u062F\u0631 context \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    const patch = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (actorUserId) patch.updated_by = actorUserId;
    if (operation?.name || operation?.title) patch.name = String(operation.name || operation.title).trim();
    if (operation?.status) patch.status = normalizeWorkflowAiProcessStatus(operation.status);
    if (operation?.description !== void 0) patch.description = String(operation.description || "").trim() || null;
    if (operation?.due_date || operation?.due_days !== void 0) patch.due_date = operation.due_date || addDaysIso(operation.due_days);
    await dbPatch(url, key, "tasks", `id=eq.${task.id}&org_id=eq.${orgId}`, patch);
    if (task.process_run_stage_id) {
      const stagePatch = {
        status: normalizeWorkflowAiProcessStatus(patch.status || task.status),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (actorUserId) stagePatch.updated_by = actorUserId;
      await dbPatch(url, key, "process_run_stages", `id=eq.${task.process_run_stage_id}`, stagePatch).catch(() => {
      });
    }
    return { type, updated_task_id: task.id, title: patch.name || task.name };
  }
  if (type === "cancel_stage_task") {
    const taskId = String(operation?.task_id || "").trim();
    const stageId = String(operation?.stage_id || operation?.process_run_stage_id || "").trim();
    const task = taskId ? (processContext.tasks || []).find((item) => String(item?.id || "") === taskId) : (processContext.tasks || []).find((item) => String(item?.process_run_stage_id || "") === stageId);
    if (task?.id) {
      const taskPatch = { status: "canceled", updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (actorUserId) taskPatch.updated_by = actorUserId;
      await dbPatch(url, key, "tasks", `id=eq.${task.id}&org_id=eq.${orgId}`, taskPatch);
    }
    const targetStageId = stageId || String(task?.process_run_stage_id || "").trim();
    if (targetStageId) {
      const stagePatch = { status: "canceled", updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (actorUserId) stagePatch.updated_by = actorUserId;
      await dbPatch(url, key, "process_run_stages", `id=eq.${targetStageId}`, stagePatch).catch(() => {
      });
    }
    return { type, canceled_task_id: task?.id || null, canceled_stage_id: targetStageId || null };
  }
  throw new Error(`\u0627\u0642\u062F\u0627\u0645 \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC ${type || "\u0646\u0627\u0645\u0634\u062E\u0635"} \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.`);
}
async function callWorkflowAiPrompt(url, key, orgId, prompt, options = {}) {
  const apiKey = String(
    Deno.env.get("AVALAI_API_KEY") || Deno.env.get("AI_API_KEY") || Deno.env.get("OPENAI_API_KEY") || ""
  ).trim();
  if (!apiKey) throw new Error("\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u0628\u0631\u0627\u06CC workflow interval \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  await assertWorkflowAiEnabled(url, key, orgId);
  const model = await loadWorkflowAiModel(url, key, orgId);
  const isReasoningModel = [/^o\d/i, /\bo[34][-_]/i, /^gpt-5/i, /deepseek-r\d/i, /\bqwq\b/i, /\breasonin/i].some((p) => p.test(model));
  const schema = options?.recordCreationSchema && typeof options.recordCreationSchema === "object" ? options.recordCreationSchema : null;
  const processOperationContext = options?.processOperationContext && typeof options.processOperationContext === "object" ? options.processOperationContext : null;
  const mutationMode = String(options?.mutationMode || "create_record").trim();
  const fieldLines = schema && Array.isArray(schema.fields) ? schema.fields.map((field) => `- ${field.key}: ${field.label || field.key} (${field.type || "text"}${field.required ? "\u060C \u0636\u0631\u0648\u0631\u06CC" : ""})`).join("\n") : "";
  const userPrompt = processOperationContext ? buildWorkflowProcessPrompt(prompt, processOperationContext) : prompt;
  const requestBody = {
    model,
    messages: [
      {
        role: "system",
        content: processOperationContext ? "\u0634\u0645\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 \u0627\u062C\u0631\u0627\u06CC \u062E\u0648\u062F\u06A9\u0627\u0631 \u0641\u0631\u0622\u06CC\u0646\u062F \u062A\u0627\u0632\u0647 \u0633\u06CC\u0633\u062A\u0645 \u0647\u0633\u062A\u06CC\u062F. \u062E\u0631\u0648\u062C\u06CC \u0641\u0642\u0637 JSON \u0645\u0639\u062A\u0628\u0631 \u0628\u0627\u0634\u062F \u0648 \u0639\u0645\u0644\u06CC\u0627\u062A \u0648\u0627\u0642\u0639\u06CC \u0631\u0627 \u0641\u0642\u0637 \u0627\u0632 context \u0645\u062C\u0627\u0632 \u0628\u0633\u0627\u0632." : schema ? [
          "\u0634\u0645\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062A\u0627\u0632\u0647 \u0633\u06CC\u0633\u062A\u0645 \u0628\u0631\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC \u062E\u0648\u062F\u06A9\u0627\u0631 \u06AF\u0631\u062F\u0634 \u06A9\u0627\u0631 \u0647\u0633\u062A\u06CC\u062F.",
          "\u062E\u0631\u0648\u062C\u06CC \u0641\u0642\u0637 JSON \u0645\u0639\u062A\u0628\u0631 \u0628\u0627\u0634\u062F \u0648 \u0645\u062A\u0646 \u0627\u0636\u0627\u0641\u06CC \u0646\u0646\u0648\u06CC\u0633.",
          "\u0641\u0642\u0637 \u06A9\u0644\u06CC\u062F\u0647\u0627\u06CC \u0645\u062C\u0627\u0632 schema \u0631\u0627 \u062F\u0631 fields \u0628\u0631\u06AF\u0631\u062F\u0627\u0646. org_id\u060C id\u060C system_code\u060C created_at\u060C updated_at\u060C created_by \u0648 updated_by \u0631\u0627 \u0628\u0631\u0646\u06AF\u0631\u062F\u0627\u0646.",
          mutationMode === "update_record" ? "\u0641\u0642\u0637 \u0641\u06CC\u0644\u062F\u0647\u0627\u06CC\u06CC \u0631\u0627 \u0628\u0631\u06AF\u0631\u062F\u0627\u0646 \u06A9\u0647 \u0628\u0631 \u0627\u0633\u0627\u0633 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0628\u0627\u06CC\u062F \u062F\u0631 \u0631\u06A9\u0648\u0631\u062F \u062C\u0627\u0631\u06CC \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0646\u0646\u062F." : "\u0641\u06CC\u0644\u062F\u0647\u0627\u06CC \u0644\u0627\u0632\u0645 \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u062C\u062F\u06CC\u062F \u0631\u0627 \u0628\u0631\u06AF\u0631\u062F\u0627\u0646.",
          `\u0645\u0627\u0698\u0648\u0644 \u0645\u0642\u0635\u062F: ${schema.moduleLabel || schema.moduleId || ""}`,
          "\u0641\u06CC\u0644\u062F\u0647\u0627\u06CC \u0645\u062C\u0627\u0632:",
          fieldLines,
          '\u0642\u0627\u0644\u0628 \u062E\u0631\u0648\u062C\u06CC: {"reply":"\u067E\u06CC\u0627\u0645 \u06A9\u0648\u062A\u0627\u0647 \u0641\u0627\u0631\u0633\u06CC","record":{"fields":{}}}'
        ].join("\n") : "\u0634\u0645\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062A\u0627\u0632\u0647 \u0633\u06CC\u0633\u062A\u0645 \u0628\u0631\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC \u062E\u0648\u062F\u06A9\u0627\u0631 \u06AF\u0631\u062F\u0634 \u06A9\u0627\u0631 \u0647\u0633\u062A\u06CC\u062F. \u067E\u0627\u0633\u062E \u0631\u0627 \u06A9\u0648\u062A\u0627\u0647\u060C \u062F\u0642\u06CC\u0642 \u0648 \u0642\u0627\u0628\u0644 \u0627\u0631\u0633\u0627\u0644 \u0628\u0647 \u06A9\u0627\u0631\u0628\u0631 \u0628\u0646\u0648\u06CC\u0633."
      },
      { role: "user", content: userPrompt }
    ]
  };
  if (isReasoningModel) {
    requestBody.max_completion_tokens = 2500;
  } else {
    requestBody.temperature = 0.2;
    requestBody.max_tokens = 2e3;
  }
  let response = null;
  let usedBaseUrl = "";
  const baseUrls = workflowAiBaseUrls().slice(0, 1);
  for (const baseUrl of baseUrls) {
    try {
      const nextResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(45e3)
      });
      response = nextResponse;
      usedBaseUrl = baseUrl;
      if (nextResponse.ok || !isRetryableAiStatus(nextResponse.status) || baseUrl === baseUrls[baseUrls.length - 1]) break;
    } catch (error) {
      const text = `${String(error?.name || "")} ${String(error?.message || error || "")}`;
      if (/abort|timeout|timed out|upstream server is timing out|request has been cancelled/i.test(text)) {
        throw new Error("\u0633\u0631\u0648\u06CC\u0633 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062F\u0631 \u0632\u0645\u0627\u0646 \u0645\u0646\u0627\u0633\u0628 \u067E\u0627\u0633\u062E \u0646\u062F\u0627\u062F.");
      }
      if (baseUrl === baseUrls[baseUrls.length - 1]) throw error;
    }
  }
  if (!response) throw new Error("\u0627\u062A\u0635\u0627\u0644 \u0628\u0647 AvalAI \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F.");
  const raw = await response.text();
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = { raw };
  }
  if (!response.ok) {
    throw new Error(String(parsed?.error?.message || parsed?.message || raw || `AI request failed: ${response.status}`));
  }
  return {
    provider: "avalai",
    model,
    requestId: response.headers.get("x-request-id") || response.headers.get("x-avalai-request-id") || null,
    baseUrl: usedBaseUrl,
    answer: String(parsed?.choices?.[0]?.message?.content || "").trim(),
    usage: parsed?.usage || null
  };
}
function getInitialProcessRunNodeKeys(stages) {
  const rows = Array.isArray(stages) ? stages : [];
  const nodeKeyOf = (stage) => String(
    stage?.process_node_key || stage?.metadata?.process_node_key || ""
  ).trim();
  const laneKeyOf = (stage) => String(
    stage?.process_lane_key || stage?.metadata?.process_lane_key || "lane_1"
  ).trim() || "lane_1";
  const graph = rows.find((stage) => stage?.metadata?.process_graph)?.metadata?.process_graph || {};
  const rootLaneKeys = new Set(
    (Array.isArray(graph?.lanes) ? graph.lanes : []).filter((lane) => !String(lane?.parentTriggerKey || lane?.parent_trigger_key || "").trim()).map((lane) => String(lane?.key || "").trim()).filter(Boolean)
  );
  if (rootLaneKeys.size === 0) {
    const firstLaneKey = rows.slice().sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0)).map(laneKeyOf).find(Boolean);
    if (firstLaneKey) rootLaneKeys.add(firstLaneKey);
  }
  return Array.from(rootLaneKeys).map((laneKey) => rows.filter((stage) => laneKeyOf(stage) === laneKey).sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))[0]).filter(Boolean).map(nodeKeyOf).filter(Boolean);
}
async function activateInitialProcessRunNodes(url, key, orgId, processRunId, actorUserId) {
  const stages = await dbGet(
    url,
    key,
    `process_run_stages?process_run_id=eq.${processRunId}&select=id,sort_order,process_node_key,process_lane_key,metadata&order=sort_order.asc`
  ).catch(() => []);
  const nodeKeys = getInitialProcessRunNodeKeys(stages);
  if (nodeKeys.length === 0) {
    return { created_task_ids: [], existing_task_ids: [], process_node_keys: [] };
  }
  const result = await callRpc(url, key, "activate_process_run_nodes", {
    p_org_id: orgId,
    p_process_run_id: processRunId,
    p_node_keys: nodeKeys,
    p_actor_user_id: actorUserId || null
  });
  return { ...result || {}, process_node_keys: nodeKeys };
}
function actionResult(action, status, message, patch = {}) {
  return {
    action_type: String(action?.type || ""),
    action_id: action?.id || null,
    status,
    ...message ? { message } : {},
    ...patch
  };
}
async function resolveConfiguredActionValue(config, record, url, key) {
  const valueMode = String(config.value_mode || "static");
  if (valueMode === "from_source") {
    const sourceField = String(config.source_field || "").trim();
    return sourceField ? await resolveWorkflowFieldValue(url, key, sourceField, record) : null;
  }
  return config.value ?? null;
}
async function executeAction(action, record, moduleId, orgId, url, key, actorUserId = null) {
  const config = action.config || {};
  const recordId = String(record?.id || "").trim();
  if (action.type === "run_ai_prompt") {
    const prompt = (await renderTemplateAsync(String(config.prompt_template || config.prompt || ""), record, url, key, false, orgId)).trim();
    if (!prompt) return actionResult(action, "skipped", "\u067E\u0631\u0627\u0645\u067E\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062E\u0627\u0644\u06CC \u0627\u0633\u062A.");
    if (!recordId) return actionResult(action, "skipped", "\u0631\u06A9\u0648\u0631\u062F \u0645\u0642\u0635\u062F \u0628\u0631\u0627\u06CC \u067E\u06CC\u0634\u0646\u0647\u0627\u062F AI \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.");
    const outputMode = String(config.output_mode || "text").trim();
    const targetModuleId = outputMode === "update_record" ? moduleId : String(config.target_module_id || "").trim();
    const allowedFieldKeys = Array.isArray(config.allowed_field_keys) ? config.allowed_field_keys.map((item) => String(item || "").trim()).filter(Boolean) : [];
    if (outputMode === "update_record" && allowedFieldKeys.length === 0) {
      return actionResult(action, "skipped", "\u0628\u0631\u0627\u06CC \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0631\u06A9\u0648\u0631\u062F \u0628\u0627 AI \u0647\u06CC\u0686 \u0641\u06CC\u0644\u062F \u0645\u062C\u0627\u0632\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
    }
    const recordCreationSchema = outputMode === "create_record" || outputMode === "update_record" ? config.record_creation_schema && typeof config.record_creation_schema === "object" ? config.record_creation_schema : null : null;
    if (outputMode === "update_record" && String(recordCreationSchema?.moduleId || "").trim() !== moduleId) {
      return actionResult(action, "skipped", "\u0633\u0627\u062E\u062A\u0627\u0631 \u0641\u06CC\u0644\u062F\u0647\u0627\u06CC \u0645\u062C\u0627\u0632 \u0648\u06CC\u0631\u0627\u06CC\u0634 AI \u0628\u0627 \u0645\u0627\u0698\u0648\u0644 \u062C\u0627\u0631\u06CC \u0647\u0645\u0627\u0647\u0646\u06AF \u0646\u06CC\u0633\u062A.");
    }
    const processOperationContext = outputMode === "process_operation" ? await loadWorkflowProcessContext(url, key, orgId, moduleId, recordId) : null;
    const aiResult = await callWorkflowAiPrompt(url, key, orgId, prompt, {
      recordCreationSchema,
      processOperationContext,
      mutationMode: outputMode
    });
    if (!aiResult.answer) return actionResult(action, "skipped", "\u067E\u0627\u0633\u062E \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062E\u0627\u0644\u06CC \u0628\u0648\u062F.");
    let answer = aiResult.answer;
    const createdRecords = [];
    const updatedRecords = [];
    const executedProcessOperations = [];
    if (outputMode === "create_record") {
      if (!targetModuleId || !recordCreationSchema) return actionResult(action, "skipped", "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u0628\u0627 AI \u06A9\u0627\u0645\u0644 \u0646\u06CC\u0633\u062A.");
      const parsed = extractJsonObjectFromText(aiResult.answer) || {};
      const recordDraft = parsed?.record || (Array.isArray(parsed?.records) ? parsed.records[0] : null) || parsed;
      const payload = sanitizeAiRecordPayload(recordDraft, recordCreationSchema);
      const relationFieldKey = String(config.relation_field_key || "").trim();
      if (relationFieldKey && recordId) payload[relationFieldKey] = recordId;
      if (Object.keys(payload).length > 0) {
        const created = await createRecord(url, key, targetModuleId, orgId, payload, actorUserId);
        if (created) {
          createdRecords.push({
            module_id: targetModuleId,
            id: created.id || null,
            title: buildAiRecordTitle(created, recordCreationSchema?.moduleLabel || targetModuleId)
          });
        }
      }
      answer = String(parsed?.reply || "").trim() || (createdRecords.length > 0 ? `${recordCreationSchema?.moduleLabel || targetModuleId} \u0628\u0627 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0627\u0633\u062A\u062E\u0631\u0627\u062C\u200C\u0634\u062F\u0647 \u0633\u0627\u062E\u062A\u0647 \u0634\u062F.` : "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0641\u06CC \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    }
    if (outputMode === "update_record") {
      if (!recordCreationSchema) return actionResult(action, "skipped", "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0631\u06A9\u0648\u0631\u062F \u0628\u0627 AI \u06A9\u0627\u0645\u0644 \u0646\u06CC\u0633\u062A.");
      const parsed = extractJsonObjectFromText(aiResult.answer) || {};
      const recordDraft = parsed?.record || parsed;
      const payload = sanitizeAiRecordPayload(recordDraft, recordCreationSchema);
      if (Object.keys(payload).length > 0) {
        await updateRecord(url, key, moduleId, recordId, payload, actorUserId, orgId);
        updatedRecords.push({
          module_id: moduleId,
          id: recordId,
          title: buildAiRecordTitle({ ...record, ...payload }, recordCreationSchema?.moduleLabel || moduleId),
          fields: Object.keys(payload)
        });
      }
      answer = String(parsed?.reply || "").trim() || (updatedRecords.length > 0 ? `${recordCreationSchema?.moduleLabel || moduleId} \u0628\u0627 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0627\u0633\u062A\u062E\u0631\u0627\u062C\u200C\u0634\u062F\u0647 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F.` : "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0641\u06CC \u0628\u0631\u0627\u06CC \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0631\u06A9\u0648\u0631\u062F \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    }
    if (outputMode === "process_operation") {
      const parsed = extractJsonObjectFromText(aiResult.answer) || {};
      const operations = Array.isArray(parsed?.operations) ? parsed.operations : [];
      if (operations.length === 0) return actionResult(action, "skipped", "\u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0627\u0642\u062F\u0627\u0645 \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC \u0645\u0639\u062A\u0628\u0631\u06CC \u0628\u0631\u0646\u06AF\u0631\u062F\u0627\u0646\u062F.");
      for (const operation of operations.slice(0, 8)) {
        executedProcessOperations.push(await executeWorkflowProcessOperation(url, key, orgId, moduleId, recordId, operation, processOperationContext || {}, actorUserId));
      }
      answer = String(parsed?.reply || "").trim() || "\u0627\u0642\u062F\u0627\u0645\u200C\u0647\u0627\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC \u06AF\u0631\u062F\u0634 \u06A9\u0627\u0631 \u0627\u062C\u0631\u0627 \u0634\u062F.";
    }
    const channelConfigs = config.channel_configs && typeof config.channel_configs === "object" ? config.channel_configs : {};
    const deliveryChannels = Array.from(new Set(
      (Array.isArray(config.delivery_channels) ? config.delivery_channels : []).map((item) => String(item || "").trim().toLowerCase()).filter((item) => ["sms", "email", "bot", "note"].includes(item))
    ));
    const noteShareTargets = deliveryChannels.includes("note") ? await resolveAssigneesToMentionTargets(
      url,
      key,
      orgId,
      (channelConfigs.note || {}).recipient_assignees || [],
      (channelConfigs.note || {}).recipient_fields || [],
      record
    ).catch(() => ({ mentionUserIds: [], mentionRoleIds: [], groupTargets: [] })) : { mentionUserIds: [], mentionRoleIds: [], groupTargets: [] };
    const sharedUserIds = Array.from(/* @__PURE__ */ new Set([
      ...noteShareTargets.mentionUserIds || [],
      ...(noteShareTargets.groupTargets || []).flatMap((group) => group.userIds || [])
    ]));
    const sharedRoleIds = Array.from(/* @__PURE__ */ new Set([
      ...noteShareTargets.mentionRoleIds || [],
      ...(noteShareTargets.groupTargets || []).flatMap((group) => group.roleIds || [])
    ]));
    const threadResult = await createWorkflowAiThread(url, key, {
      orgId,
      moduleId,
      recordId,
      prompt,
      answer,
      model: aiResult.model,
      provider: aiResult.provider,
      actionId: action.id || null,
      sharedUserIds,
      sharedRoleIds,
      metadata: {
        output_mode: outputMode,
        target_module_id: targetModuleId || null,
        created_records: createdRecords,
        updated_records: updatedRecords,
        process_operations: executedProcessOperations
      }
    }).catch((error) => {
      console.warn("[workflow-runner] workflow AI thread insert skipped:", error?.message || error);
      return null;
    });
    await dbInsert(url, key, "ai_action_logs", {
      org_id: orgId,
      thread_id: threadResult?.thread?.id || null,
      message_id: threadResult?.assistantMessage?.id || null,
      module_id: moduleId,
      record_id: recordId,
      action_type: "workflow_ai_prompt",
      status: "executed",
      proposed_payload: {
        prompt,
        answer,
        workflow_action_id: action.id || null,
        require_human_approval: false,
        output_mode: outputMode,
        target_module_id: targetModuleId || null
      },
      result_payload: {
        source: "workflow_interval_runner",
        provider: aiResult.provider,
        model: aiResult.model,
        usage: aiResult.usage,
        avalai_request_id: aiResult.requestId,
        created_records: createdRecords,
        updated_records: updatedRecords,
        process_operations: executedProcessOperations
      },
      avalai_request_id: aiResult.requestId,
      executed_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    const actionRecord = {
      ...record,
      ai_answer: answer,
      ai_created_record_title: createdRecords[0]?.title || "",
      ai_updated_record_title: updatedRecords[0]?.title || "",
      ai_process_operation_count: String(executedProcessOperations.length || "")
    };
    for (const channel of deliveryChannels) {
      if (channel === "sms") {
        await executeAction({ ...action, type: "send_sms", config: { message: "{{ai_answer}}", ...channelConfigs.sms || {} } }, actionRecord, moduleId, orgId, url, key, actorUserId);
        continue;
      }
      if (channel === "email") {
        await executeAction({ ...action, type: "send_email", config: { subject: "\u067E\u06CC\u0627\u0645 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC", body: "{{ai_answer}}", ...channelConfigs.email || {} } }, actionRecord, moduleId, orgId, url, key, actorUserId);
        continue;
      }
      if (channel === "bot") {
        await executeAction({ ...action, type: "send_bot_message", config: { message: "{{ai_answer}}", ...channelConfigs.bot || {} } }, actionRecord, moduleId, orgId, url, key, actorUserId);
        continue;
      }
      if (channel === "note") {
        await executeAction({ ...action, type: "send_note", config: { note_text: "{{ai_answer}}", ...channelConfigs.note || {} } }, actionRecord, moduleId, orgId, url, key, actorUserId);
      }
    }
    return actionResult(action, "success", void 0, {
      affected_count: 1 + createdRecords.length + updatedRecords.length + executedProcessOperations.length,
      details: {
        model: aiResult.model,
        avalai_request_id: aiResult.requestId,
        created_records: createdRecords,
        updated_records: updatedRecords,
        process_operations: executedProcessOperations
      }
    });
  }
  if (action.type === "send_sms") {
    const text = (await renderTemplateAsync(String(config.message || ""), record, url, key, false, orgId)).trim();
    if (!text) return actionResult(action, "skipped", "\u0645\u062A\u0646 \u067E\u06CC\u0627\u0645\u06A9 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A.");
    const recipients = await resolveAssigneesToSmsRecipients(
      url,
      key,
      orgId,
      config.recipient_assignees || [],
      config.recipient_fields || [],
      record
    );
    const manuals = (config.manual_numbers || []).map(normalizePhone).filter(isValidIranMobile);
    const allRecipients = Array.from(/* @__PURE__ */ new Set([...recipients, ...manuals]));
    if (allRecipients.length === 0) return actionResult(action, "skipped", "\u06AF\u06CC\u0631\u0646\u062F\u0647 \u0645\u0639\u062A\u0628\u0631 \u0628\u0631\u0627\u06CC \u067E\u06CC\u0627\u0645\u06A9 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.", { recipient_count: 0 });
    const smsSettings = await getOrgSmsSettings(url, key, orgId);
    if (!smsSettings) {
      await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients: allRecipients, text, status: "skipped", errorMessage: "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u067E\u06CC\u0627\u0645\u06A9 \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A.", metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
      return actionResult(action, "skipped", "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u067E\u06CC\u0627\u0645\u06A9 \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A.", { recipient_count: allRecipients.length });
    }
    try {
      const sentRecipients = await sendSmsViaProvider(smsSettings, allRecipients, text);
      await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients: sentRecipients, text, status: "provider_accepted", metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
      return actionResult(action, sentRecipients.length > 0 ? "success" : "skipped", sentRecipients.length > 0 ? void 0 : "\u0647\u06CC\u0686 \u0634\u0645\u0627\u0631\u0647 \u0645\u0639\u062A\u0628\u0631\u06CC \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F.", { recipient_count: sentRecipients.length });
    } catch (e) {
      await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients: allRecipients, text, status: "failed", errorMessage: String(e?.message || e), metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
      throw e;
    }
  }
  if (action.type === "send_note" || action.type === "send_note_sms") {
    const noteText = (await renderTemplateAsync(String(config.note_text || ""), record, url, key, true, orgId)).trim();
    if (!noteText) return actionResult(action, "skipped", "\u0645\u062A\u0646 \u06CC\u0627\u062F\u062F\u0627\u0634\u062A \u062E\u0627\u0644\u06CC \u0627\u0633\u062A.");
    if (!moduleId || !recordId) return actionResult(action, "skipped", "\u0631\u06A9\u0648\u0631\u062F \u0645\u0642\u0635\u062F \u0628\u0631\u0627\u06CC \u06CC\u0627\u062F\u062F\u0627\u0634\u062A \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.");
    const mentionTargets = await resolveAssigneesToMentionTargets(
      url,
      key,
      orgId,
      config.recipient_assignees || [],
      config.recipient_fields || [],
      record
    );
    const noteRows = [];
    const baseMetadata = { source_type: "system", notification_surface: "system_feed", requires_action: false, workflow_action_type: action.type, workflow_action_id: action.id || null };
    const hasDirectMentions = mentionTargets.mentionUserIds.length > 0 || mentionTargets.mentionRoleIds.length > 0;
    if (hasDirectMentions || mentionTargets.groupTargets.length === 0) {
      noteRows.push({
        org_id: orgId,
        module_id: moduleId,
        record_id: recordId,
        content: noteText,
        mention_user_ids: mentionTargets.mentionUserIds,
        mention_role_ids: mentionTargets.mentionRoleIds,
        source_type: "system",
        metadata: baseMetadata
      });
    }
    mentionTargets.groupTargets.forEach((group) => {
      noteRows.push({
        org_id: orgId,
        module_id: moduleId,
        record_id: recordId,
        content: noteText,
        mention_user_ids: group.userIds,
        mention_role_ids: group.roleIds,
        source_type: "system",
        metadata: { ...baseMetadata, chat_group_id: group.groupId }
      });
    });
    if (noteRows.length === 0 || !hasDirectMentions && mentionTargets.groupTargets.length === 0) {
      return actionResult(action, "skipped", "\u06AF\u06CC\u0631\u0646\u062F\u0647 \u06CC\u0627\u062F\u062F\u0627\u0634\u062A \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.", { recipient_count: 0 });
    }
    for (const noteRow of noteRows) await insertNote(url, key, noteRow);
    let smsRecipientCount = 0;
    if (action.type === "send_note_sms") {
      const smsText = `\u067E\u06CC\u0627\u0645 \u062C\u062F\u06CC\u062F \u0627\u0632 \u0637\u0631\u0641 "\u0633\u06CC\u0633\u062A\u0645"
"${noteText.replace(/\*\*/g, "").substring(0, 80)}"
\u0628\u0631\u0627\u06CC \u0645\u0634\u0627\u0647\u062F\u0647 \u0628\u0647 \u0633\u0627\u0645\u0627\u0646\u0647 \u0645\u0631\u0627\u062C\u0639\u0647 \u06A9\u0646\u06CC\u062F`;
      const recipients = await resolveAssigneesToSmsRecipients(url, key, orgId, config.recipient_assignees || [], config.recipient_fields || [], record);
      if (recipients.length > 0) {
        const smsSettings = await getOrgSmsSettings(url, key, orgId);
        if (smsSettings) {
          try {
            const sentRecipients = await sendSmsViaProvider(smsSettings, recipients, smsText);
            smsRecipientCount = sentRecipients.length;
            await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients: sentRecipients, text: smsText, status: "provider_accepted", metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
          } catch (e) {
            await auditSmsBatch(url, key, { orgId, moduleId, recordId, recipients, text: smsText, status: "failed", errorMessage: String(e?.message || e), metadata: { workflow_action_type: action.type, workflow_action_id: action.id || null } });
            throw e;
          }
        }
      }
    }
    return actionResult(action, "success", void 0, {
      recipient_count: mentionTargets.mentionUserIds.length + mentionTargets.mentionRoleIds.length + mentionTargets.groupTargets.length + smsRecipientCount,
      affected_count: noteRows.length,
      details: { note_count: noteRows.length, sms_recipient_count: smsRecipientCount }
    });
  }
  if (action.type === "send_bale_bot" || action.type === "send_telegram_bot" || action.type === "send_bot_message") {
    const configuredChannel = String(config.channel || config.platform || "").trim().toLowerCase();
    const explicitChannel = action.type === "send_telegram_bot" ? "telegram" : configuredChannel === "telegram" || configuredChannel === "bale" || configuredChannel === "rubika" ? configuredChannel : "";
    const directChannel = explicitChannel || "bale";
    const text = (await renderTemplateAsync(String(config.message || ""), record, url, key, false, orgId)).trim();
    if (!text) return actionResult(action, "skipped", "\u0645\u062A\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0627\u062A \u062E\u0627\u0644\u06CC \u0627\u0633\u062A.");
    const [directChatIds, counterpartyTargets] = await Promise.all([
      resolveAssigneesToBotChatIds(
        url,
        key,
        orgId,
        config.recipient_assignees || [],
        config.recipient_fields || [],
        record,
        directChannel
      ),
      resolveCounterpartyBotTargets(
        url,
        key,
        orgId,
        moduleId,
        record,
        config.recipient_fields || [],
        explicitChannel || null
      )
    ]);
    const targets = Array.from(new Map([
      ...directChatIds.map((chatId) => [`${directChannel}:${chatId}`, { channel: directChannel, chatId }]),
      ...counterpartyTargets.map((target) => [`${target.channel}:${target.chatId}`, target])
    ]).values());
    if (targets.length === 0) return actionResult(action, "skipped", "\u06AF\u06CC\u0631\u0646\u062F\u0647 \u0628\u0627\u062A \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.", { recipient_count: 0 });
    const settingsByChannel = /* @__PURE__ */ new Map();
    let sentCount = 0;
    for (const target of targets) {
      if (!settingsByChannel.has(target.channel)) {
        settingsByChannel.set(target.channel, await getOrgBotSettings(url, key, orgId, target.channel));
      }
      const botSettings = settingsByChannel.get(target.channel);
      if (!botSettings) continue;
      await sendBotMessage(target.chatId, text, botSettings, target.channel);
      sentCount += 1;
    }
    if (sentCount === 0) return actionResult(action, "skipped", "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0628\u0627\u062A \u0628\u0631\u0627\u06CC \u06AF\u06CC\u0631\u0646\u062F\u0647\u200C\u0647\u0627\u06CC \u067E\u06CC\u062F\u0627 \u0634\u062F\u0647 \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A.", { recipient_count: 0 });
    return actionResult(action, "success", void 0, { recipient_count: sentCount });
  }
  if (action.type === "send_rubika_bot") {
    const text = (await renderTemplateAsync(String(config.message || ""), record, url, key, false, orgId)).trim();
    if (!text) return actionResult(action, "skipped", "\u0645\u062A\u0646 \u067E\u06CC\u0627\u0645 \u0631\u0648\u0628\u06CC\u06A9\u0627 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A.");
    const botSettings = await getOrgBotSettings(url, key, orgId, "rubika");
    if (!botSettings) return actionResult(action, "skipped", "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0631\u0648\u0628\u06CC\u06A9\u0627 \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A.");
    const chatIds = await resolveAssigneesToBotChatIds(url, key, orgId, config.recipient_assignees || [], config.recipient_fields || [], record, "rubika");
    if (chatIds.length === 0) return actionResult(action, "skipped", "\u06AF\u06CC\u0631\u0646\u062F\u0647 \u0631\u0648\u0628\u06CC\u06A9\u0627 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.", { recipient_count: 0 });
    for (const chatId of chatIds) {
      const token = String(botSettings.bot_token || "").trim();
      if (!token || !chatId) continue;
      await fetch(`https://rubika.ir/rubika/bots/${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(8e3)
      }).then(async (response) => {
        if (!response.ok) {
          const raw = await response.text().catch(() => String(response.status));
          throw new Error(`\u0627\u0631\u0633\u0627\u0644 \u067E\u06CC\u0627\u0645 \u0631\u0648\u0628\u06CC\u06A9\u0627 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${raw || response.status}`);
        }
      });
    }
    return actionResult(action, "success", void 0, { recipient_count: chatIds.length });
  }
  if (action.type === "update_record") {
    const fieldKey = String(config.field || "").trim();
    if (!fieldKey || !record?.id) return actionResult(action, "skipped", "\u0641\u06CC\u0644\u062F \u06CC\u0627 \u0631\u06A9\u0648\u0631\u062F \u0645\u0642\u0635\u062F \u0628\u0631\u0627\u06CC \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.");
    const nextValue = await resolveConfiguredActionValue(config, record, url, key);
    await updateRecord(url, key, moduleId, String(record.id), { [fieldKey]: nextValue }, actorUserId);
    return actionResult(action, "success", void 0, { affected_count: 1, details: { field: fieldKey } });
  }
  if (action.type === "create_standalone_record") {
    const targetModuleId = String(config.target_module_id || "").trim();
    if (!targetModuleId) return actionResult(action, "skipped", "\u0645\u0627\u0698\u0648\u0644 \u0645\u0642\u0635\u062F \u0628\u0631\u0627\u06CC \u0627\u06CC\u062C\u0627\u062F \u0631\u06A9\u0648\u0631\u062F \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.");
    const payload = {};
    const mappings = Array.isArray(config.field_mappings) ? config.field_mappings : [];
    for (const mapping of mappings) {
      const tf = String(mapping?.field || "").trim();
      if (!tf) continue;
      if (mapping?.mode === "from_source") {
        const sf = String(mapping?.source_field || "").trim();
        payload[tf] = sf ? await resolveWorkflowFieldValue(url, key, sf, record) : null;
      } else {
        payload[tf] = mapping?.value ?? null;
      }
    }
    await createRecord(url, key, targetModuleId, orgId, payload, actorUserId);
    return actionResult(action, "success", void 0, { affected_count: 1, details: { target_module_id: targetModuleId } });
  }
  if (action.type === "create_related_record") {
    const targetModuleId = String(config.target_module_id || "").trim();
    const relationFieldKey = String(config.relation_field_key || "").trim();
    const sourceRecordId = String(record?.id || "").trim();
    if (!targetModuleId || !relationFieldKey || !sourceRecordId) return actionResult(action, "skipped", "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0627\u06CC\u062C\u0627\u062F \u0631\u06A9\u0648\u0631\u062F \u0645\u0631\u062A\u0628\u0637 \u06A9\u0627\u0645\u0644 \u0646\u06CC\u0633\u062A.");
    const payload = { [relationFieldKey]: sourceRecordId };
    const mappings = Array.isArray(config.field_mappings) ? config.field_mappings : [];
    for (const mapping of mappings) {
      const tf = String(mapping?.field || "").trim();
      if (!tf) continue;
      if (mapping?.mode === "from_source") {
        const sf = String(mapping?.source_field || "").trim();
        payload[tf] = sf ? await resolveWorkflowFieldValue(url, key, sf, record) : null;
      } else {
        payload[tf] = mapping?.value ?? null;
      }
    }
    await createRecord(url, key, targetModuleId, orgId, payload, actorUserId);
    return actionResult(action, "success", void 0, { affected_count: 1, details: { target_module_id: targetModuleId } });
  }
  if (action.type === "activate_next_process_stage" || action.type === "activate_specific_process_stage") {
    const recurrence = record?.recurrence_info && typeof record.recurrence_info === "object" ? record.recurrence_info : {};
    let processRunId = String(record?.process_run_id || recurrence?.process_run_id || "").trim();
    if (!processRunId) {
      const templateId = String(config.template_id || "").trim();
      const recordId2 = String(record?.id || "").trim();
      if (!templateId || !recordId2 || !moduleId) {
        return actionResult(action, "skipped", "\u0627\u062C\u0631\u0627\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F \u0628\u0631\u0627\u06CC \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0645\u0631\u062D\u0644\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
      }
      const runIdResult = await callRpc(url, key, "create_process_run_from_template", {
        p_org_id: orgId,
        p_template_id: templateId,
        p_module_id: moduleId,
        p_record_id: recordId2,
        p_process_name: null,
        p_copied_mode: "auto"
      });
      processRunId = Array.isArray(runIdResult) ? String(runIdResult[0] || "").trim() : String(runIdResult || "").trim();
    }
    if (!processRunId) return actionResult(action, "skipped", "\u0627\u062C\u0631\u0627\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F \u0628\u0631\u0627\u06CC \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0645\u0631\u062D\u0644\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    const stages = await dbGet(
      url,
      key,
      `process_run_stages?process_run_id=eq.${processRunId}&select=id,stage_name,sort_order,process_node_key,process_lane_key,metadata&order=sort_order.asc`
    ).catch(() => []);
    const nodeKeyOf = (stage) => String(
      stage?.process_node_key || stage?.metadata?.process_node_key || ""
    ).trim();
    const laneKeyOf = (stage) => String(
      stage?.process_lane_key || stage?.metadata?.process_lane_key || "lane_1"
    ).trim() || "lane_1";
    let nodeKeys = [];
    if (action.type === "activate_specific_process_stage") {
      nodeKeys = (Array.isArray(config.stage_node_keys) ? config.stage_node_keys : [config.stage_node_key]).map((value) => String(value || "").trim()).filter(Boolean);
    } else {
      const currentNodeKey = String(
        record?.process_node_key || recurrence?.process_node_key || record?.current_process_node_key || ""
      ).trim();
      const currentStage = stages.find((stage) => nodeKeyOf(stage) === currentNodeKey);
      if (currentStage) {
        const sameLane = stages.filter((stage) => laneKeyOf(stage) === laneKeyOf(currentStage)).sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0));
        const currentIndex = sameLane.findIndex((stage) => nodeKeyOf(stage) === currentNodeKey);
        const directNext = currentIndex >= 0 ? sameLane[currentIndex + 1] : null;
        if (directNext) {
          nodeKeys = [nodeKeyOf(directNext)].filter(Boolean);
        } else {
          const graph = currentStage?.metadata?.process_graph || recurrence?.process_graph || {};
          const triggers = Array.isArray(graph?.triggers) ? graph.triggers : [];
          const targetLaneKeys = new Set(
            triggers.filter((trigger) => String(trigger?.sourceNodeKey || "").trim() === currentNodeKey).flatMap((trigger) => Array.isArray(trigger?.targetLaneKeys) ? trigger.targetLaneKeys : []).map((value) => String(value || "").trim()).filter(Boolean)
          );
          nodeKeys = Array.from(targetLaneKeys).map((laneKey) => stages.filter((stage) => laneKeyOf(stage) === laneKey).sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))[0]).filter(Boolean).map(nodeKeyOf).filter(Boolean);
        }
      }
    }
    if (nodeKeys.length === 0 && Array.isArray(config.target_lane_keys)) {
      const targetLaneKeys = new Set(
        config.target_lane_keys.map((value) => String(value || "").trim()).filter(Boolean)
      );
      nodeKeys = Array.from(targetLaneKeys).map((laneKey) => stages.filter((stage) => laneKeyOf(stage) === laneKey).sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))[0]).filter(Boolean).map(nodeKeyOf).filter(Boolean);
    }
    if (nodeKeys.length === 0) return actionResult(action, "skipped", "\u0645\u0631\u062D\u0644\u0647 \u0645\u0642\u0635\u062F \u0628\u0631\u0627\u06CC \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    const result = await callRpc(url, key, "activate_process_run_nodes", {
      p_org_id: orgId,
      p_process_run_id: processRunId,
      p_node_keys: Array.from(new Set(nodeKeys)),
      p_actor_user_id: actorUserId || null
    });
    return actionResult(action, "success", void 0, {
      affected_count: Array.isArray(result?.created_task_ids) ? result.created_task_ids.length : nodeKeys.length,
      details: { process_run_id: processRunId, process_node_keys: nodeKeys }
    });
  }
  if (action.type === "execute_process") {
    const templateId = String(config.template_id || "").trim();
    if (!templateId || !record?.id) return actionResult(action, "skipped", "\u0642\u0627\u0644\u0628 \u0641\u0631\u0622\u06CC\u0646\u062F \u06CC\u0627 \u0631\u06A9\u0648\u0631\u062F \u0645\u0642\u0635\u062F \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.");
    const runIdResult = await callRpc(url, key, "create_process_run_from_template", {
      p_org_id: orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: String(record.id),
      p_process_name: null,
      p_copied_mode: "auto"
    });
    const processRunId = Array.isArray(runIdResult) ? String(runIdResult[0] || "").trim() : String(runIdResult || "").trim();
    if (actorUserId && processRunId) {
      await dbPatch(url, key, "process_runs", `id=eq.${processRunId}&org_id=eq.${orgId}`, { created_by: actorUserId, updated_by: actorUserId, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).catch(() => {
      });
      await dbPatch(url, key, "process_run_stages", `process_run_id=eq.${processRunId}`, { created_by: actorUserId, updated_by: actorUserId, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).catch(() => {
      });
    }
    const activation = processRunId ? await activateInitialProcessRunNodes(url, key, orgId, processRunId, actorUserId) : null;
    return actionResult(action, "success", void 0, {
      affected_count: Math.max(1, Array.isArray(activation?.created_task_ids) ? activation.created_task_ids.length : 0),
      details: {
        template_id: templateId,
        process_run_id: processRunId,
        process_node_keys: activation?.process_node_keys || [],
        created_task_ids: activation?.created_task_ids || [],
        existing_task_ids: activation?.existing_task_ids || []
      }
    });
  }
  if (action.type === "copy_process_template") {
    const templateId = String(config.template_id || "").trim();
    if (!templateId || !record?.id) return actionResult(action, "skipped", "\u0642\u0627\u0644\u0628 \u0641\u0631\u0622\u06CC\u0646\u062F \u06CC\u0627 \u0631\u06A9\u0648\u0631\u062F \u0645\u0642\u0635\u062F \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.");
    const stages = await dbGet(url, key, `process_template_stages?template_id=eq.${templateId}&order=sort_order.asc`).catch(() => []);
    const templateRows = await dbGet(url, key, `process_templates?id=eq.${templateId}&select=name&limit=1`).catch(() => []);
    const templateName = String(templateRows[0]?.name || "").trim();
    const DRAFT_FIELD_MAP = {
      invoices: "process_draft",
      purchaseInvoices: "process_draft",
      tasks: "sub_process_draft"
    };
    const draftFieldKey = DRAFT_FIELD_MAP[moduleId] || "process_draft";
    const draft = { template_id: templateId, template_name: templateName, stages };
    await updateRecord(url, key, moduleId, String(record.id), {
      process_template_id: templateId,
      [draftFieldKey]: JSON.stringify(draft)
    }, actorUserId);
    return actionResult(action, "success", void 0, { affected_count: 1, details: { template_id: templateId } });
  }
  if (action.type === "publish_story") {
    const content = (await renderTemplateAsync(String(config.content || config.text_template || ""), record, url, key, false, orgId)).trim();
    if (!content) return actionResult(action, "skipped", "\u0645\u062A\u0646 \u0627\u0633\u062A\u0648\u0631\u06CC \u062E\u0627\u0644\u06CC \u0627\u0633\u062A.");
    const publisher = await resolveStoryPublisher(
      url,
      key,
      orgId
    );
    const expiresHoursRaw = config.expires_hours;
    const expiresHours = expiresHoursRaw === null || expiresHoursRaw === void 0 || expiresHoursRaw === "" ? null : Number(expiresHoursRaw);
    const expiresAt = Number.isFinite(expiresHours) && Number(expiresHours) > 0 ? new Date(Date.now() + Number(expiresHours) * 60 * 60 * 1e3).toISOString() : null;
    const slideType = String(config.slide_type || "gradient") === "image" ? "image" : "gradient";
    const slide = {
      id: crypto.randomUUID(),
      type: slideType,
      image_url: slideType === "image" ? String(config.image_url || config.media_url || "").trim() || null : null,
      gradient_key: slideType === "gradient" ? String(config.gradient_key || "brand_indigo") : null,
      text_layers: [{
        id: crypto.randomUUID(),
        content,
        x: 50,
        y: 50,
        font_size: 18,
        color: "#FFFFFF",
        align: "center",
        bold: false
      }],
      duration_ms: 5e3
    };
    await dbInsert(url, key, "org_stories", {
      org_id: orgId,
      creator_id: publisher.creatorId,
      creator_name: publisher.creatorName,
      creator_avatar: publisher.creatorAvatar,
      slides: [slide],
      is_org_wide: config.is_org_wide !== false,
      viewer_user_ids: asArray(config.viewer_user_ids).map((id) => String(id || "").trim()).filter(Boolean),
      viewer_role_ids: asArray(config.viewer_role_ids).map((id) => String(id || "").trim()).filter(Boolean),
      mention_user_ids: asArray(config.mention_user_ids).map((id) => String(id || "").trim()).filter(Boolean),
      mention_role_ids: [],
      expires_at: expiresAt,
      is_active: true
    });
    return actionResult(action, "success", void 0, { affected_count: 1 });
  }
  if (action.type === "send_to_next_stages" || action.type === "send_to_specific_stage") {
    const fieldMeta = parseProcessNextStageFieldKey(String(config.field || "").trim());
    const fieldKey = fieldMeta?.fieldKey || String(config.field || "").trim();
    if (!fieldKey || !record?.id) return actionResult(action, "skipped", "\u0641\u06CC\u0644\u062F \u0645\u0631\u062D\u0644\u0647 \u0645\u0642\u0635\u062F \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.");
    const processRunId = String(record.process_run_id || "").trim();
    if (!processRunId) return actionResult(action, "skipped", "\u0641\u0631\u0622\u06CC\u0646\u062F \u0645\u0631\u062A\u0628\u0637 \u0628\u0627 \u0631\u06A9\u0648\u0631\u062F \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    const nextValue = await resolveConfiguredActionValue(config, record, url, key);
    const tasks = await dbGet(
      url,
      key,
      `tasks?process_run_id=eq.${processRunId}&order=sort_order.asc&select=id,sort_order,status,process_node_key,recurrence_info`
    ).catch(() => []);
    let targetTask = null;
    let offset = 0;
    if (action.type === "send_to_specific_stage") {
      const targetNodeKey = String(config.stage_node_key || "").trim();
      targetTask = tasks.find((task) => String(
        task?.process_node_key || task?.recurrence_info?.process_node_key || ""
      ).trim() === targetNodeKey);
    } else {
      const currentTaskId = String(record.task_id || record.id || "").trim();
      const currentIdx = tasks.findIndex((t) => String(t.id) === currentTaskId);
      offset = fieldMeta?.offset || parseInt(String(config.stage_offset || 1), 10) || 1;
      targetTask = tasks[currentIdx + offset];
    }
    if (!targetTask?.id) return actionResult(action, "skipped", "\u0645\u0631\u062D\u0644\u0647 \u0645\u0642\u0635\u062F \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    await updateRecord(url, key, "tasks", String(targetTask.id), { [fieldKey]: nextValue }, actorUserId);
    return actionResult(action, "success", void 0, {
      affected_count: 1,
      details: {
        field: fieldKey,
        stage_offset: offset || null,
        stage_node_key: action.type === "send_to_specific_stage" ? config.stage_node_key : null
      }
    });
  }
  if (action.type === "send_email") {
    const subject = (await renderTemplateAsync(String(config.subject || ""), record, url, key, false, orgId)).trim();
    const body = (await renderTemplateAsync(String(config.body || ""), record, url, key, false, orgId)).trim();
    if (!subject && !body) return actionResult(action, "skipped", "\u0645\u0648\u0636\u0648\u0639 \u0648 \u0645\u062A\u0646 \u0627\u06CC\u0645\u06CC\u0644 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A.");
    const manuals = (Array.isArray(config.manual_emails) ? config.manual_emails : []).map((v) => String(v || "").trim()).filter(Boolean);
    const fromFields = [];
    for (const fieldKey of Array.isArray(config.recipient_fields) ? config.recipient_fields : []) {
      const val = await resolveWorkflowFieldValue(url, key, String(fieldKey || "").trim(), record);
      if (Array.isArray(val)) fromFields.push(...val.map(String));
      else if (val !== null && val !== void 0) fromFields.push(String(val));
    }
    const to = Array.from(/* @__PURE__ */ new Set([...manuals, ...fromFields])).filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
    if (to.length === 0) return actionResult(action, "skipped", "\u06AF\u06CC\u0631\u0646\u062F\u0647 \u0645\u0639\u062A\u0628\u0631 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0645\u06CC\u0644 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.", { recipient_count: 0 });
    const emailFnUrl = `${url.replace(/\/$/, "")}/functions/v1/send-email`;
    const resp = await fetch(emailFnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ to, subject, body, org_id: orgId }),
      signal: AbortSignal.timeout(3e4)
    }).catch((e) => {
      console.warn("[workflow-runner] send_email fetch error:", e.message);
      return null;
    });
    if (!resp) return actionResult(action, "failed", "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0627\u0631\u0633\u0627\u0644 \u0627\u06CC\u0645\u06CC\u0644 \u0628\u0647 \u062A\u0627\u0628\u0639 \u0627\u0631\u0633\u0627\u0644 \u0646\u0631\u0633\u06CC\u062F.", { recipient_count: to.length });
    if (!resp.ok) {
      const msg = await resp.text().catch(() => String(resp.status));
      throw new Error(`\u0627\u0631\u0633\u0627\u0644 \u0627\u06CC\u0645\u06CC\u0644 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${msg}`);
    }
    return actionResult(action, "success", void 0, { recipient_count: to.length });
  }
  console.warn(`[workflow-runner] Unknown action type: ${action.type}`);
  return actionResult(action, "skipped", `\u0646\u0648\u0639 \u0627\u0642\u062F\u0627\u0645 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F: ${action.type}`);
}
var RETRYABLE_IDEMPOTENT_ACTIONS = /* @__PURE__ */ new Set([
  "update_record",
  "activate_next_process_stage",
  "activate_specific_process_stage"
]);
var isTransientWorkflowError = (error) => {
  const text = `${String(error?.name || "")} ${String(error?.message || error || "")}`.toLowerCase();
  return /timeout|timed out|abort|temporar|connection|network|fetch failed|status 5\d\d|gateway|rate limit|429|502|503|504/.test(text);
};
async function executeActionWithRetry(action, record, moduleId, orgId, url, key, actorUserId) {
  const maxAttempts = RETRYABLE_IDEMPOTENT_ACTIONS.has(String(action?.type || "")) ? 3 : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await executeAction(action, record, moduleId, orgId, url, key, actorUserId);
      return {
        ...result,
        details: {
          ...result.details || {},
          retry_attempts: attempt - 1
        }
      };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientWorkflowError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 250 : 750));
    }
  }
  throw lastError;
}
async function runIntervalTick(url, key) {
  const now = /* @__PURE__ */ new Date();
  const stats = { checkedWorkflows: 0, claimedWorkflows: 0, processedRecords: 0, executedActions: 0, failedRuns: 0 };
  const workflows = await fetchQueuedWorkflows(url, key);
  stats.checkedWorkflows = workflows.length;
  for (const workflow of workflows) {
    const scheduledDueAt = getWorkflowScheduledDueAt(workflow, now);
    if (!scheduledDueAt) {
      await clearServerQueued(url, key, workflow.id);
      continue;
    }
    if (!await checkIntervalDayCondition(
      workflow.interval_day_condition,
      scheduledDueAt,
      workflow.interval_days_after_holiday
    )) {
      await clearServerQueued(url, key, workflow.id);
      continue;
    }
    const claimed = await claimWorkflow(url, key, workflow.id, workflow.last_run_at, scheduledDueAt);
    if (!claimed) continue;
    stats.claimedWorkflows++;
    const configuredRecordLimit = Number(workflow.batch_size) > 0 ? Math.max(1, Math.min(5e4, Number(workflow.batch_size))) : Number.POSITIVE_INFINITY;
    const conditionsAll = (Array.isArray(workflow.conditions_all) ? workflow.conditions_all : []).filter((c) => !["changed", "changed_from", "changed_to"].includes(String(c?.operator || "")));
    const conditionsAny = (Array.isArray(workflow.conditions_any) ? workflow.conditions_any : []).filter((c) => !["changed", "changed_from", "changed_to"].includes(String(c?.operator || "")));
    const executionMode = String(workflow.execution_mode || "first_match");
    const actorUserId = resolveWorkflowActorId(workflow);
    const targetModuleIds = Array.from(new Set(
      workflow.scope_type === "process_activator" && !String(workflow.process_source_node_key || "").trim() && Array.isArray(workflow.module_ids) ? workflow.module_ids : [workflow.module_id]
    )).map((value) => String(value || "").trim()).filter(Boolean);
    for (const targetModuleId of targetModuleIds) {
      const targetTable = getModuleTable(targetModuleId);
      let offset = 0;
      let processedForModule = 0;
      while (processedForModule < configuredRecordLimit) {
        const remaining = Number.isFinite(configuredRecordLimit) ? configuredRecordLimit - processedForModule : DEFAULT_BATCH_SIZE;
        const pageSize = Math.max(1, Math.min(DEFAULT_BATCH_SIZE, remaining));
        const records = await fetchModuleRecordsPage(
          url,
          key,
          targetTable,
          workflow.org_id,
          pageSize,
          offset
        ).catch((e) => {
          console.error("[workflow-runner] Record page fetch failed:", e.message);
          return [];
        });
        if (records.length === 0) break;
        offset += records.length;
        processedForModule += records.length;
        let executedRecordIds = null;
        if (executionMode === "first_match") {
          const recordIds = records.map((r) => String(r?.id || "")).filter(Boolean);
          if (recordIds.length > 0) {
            const logs = await dbGet(
              url,
              key,
              `workflow_logs?workflow_id=eq.${workflow.id}&run_type=eq.scheduled&module_id=eq.${targetModuleId}&status=eq.success&record_id=in.(${recordIds.join(",")})&select=record_id`
            ).catch(() => []);
            executedRecordIds = new Set(logs.map((l) => String(l?.record_id || "")));
          }
        }
        for (const record of records) {
          stats.processedRecords++;
          const matched = await evaluateConditions(conditionsAll, conditionsAny, record);
          if (!matched) continue;
          const recordId = String(record?.id || "").trim();
          if (executionMode === "first_match" && recordId && executedRecordIds?.has(recordId)) continue;
          const actions = Array.isArray(workflow.actions) ? workflow.actions : [];
          const errors = [];
          const actionResults = [];
          for (const action of actions) {
            try {
              const result = await executeActionWithRetry(
                action,
                record,
                targetModuleId,
                workflow.org_id,
                url,
                key,
                actorUserId
              );
              actionResults.push(result);
              if (result.status === "success") stats.executedActions++;
              if (result.status === "failed") {
                errors.push(result.message || String(action.type || "action failed"));
                stats.failedRuns++;
              }
            } catch (e) {
              const errorMessage = String(e?.message || action.type || "action failed");
              errors.push(errorMessage);
              actionResults.push({
                action_type: String(action?.type || ""),
                action_id: action?.id || null,
                status: "failed",
                message: errorMessage
              });
              console.error(`[workflow-runner] Action failed (${workflow.name}/${action.type}):`, e.message);
              stats.failedRuns++;
            }
          }
          if (recordId) {
            const hasFailedAction = actionResults.some((result) => result.status === "failed");
            const hasSuccessfulAction = actionResults.some((result) => result.status === "success");
            const runStatus = hasFailedAction ? "failed" : hasSuccessfulAction ? "success" : "skipped";
            const skippedMessage = !hasSuccessfulAction && errors.length === 0 ? "\u0647\u06CC\u0686 \u0627\u0642\u062F\u0627\u0645\u06CC \u0627\u062C\u0631\u0627 \u0646\u0634\u062F \u06CC\u0627 \u06AF\u06CC\u0631\u0646\u062F\u0647 \u0645\u0639\u062A\u0628\u0631 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F." : void 0;
            await insertWorkflowLog(url, key, {
              workflow_id: workflow.id,
              org_id: workflow.org_id,
              module_id: targetModuleId,
              record_id: recordId,
              run_type: "scheduled",
              status: runStatus,
              message: errors.length > 0 ? errors.join(" | ") : skippedMessage,
              details: {
                workflow_name: workflow.name,
                action_count: actions.length,
                action_results: actionResults,
                timezone: "Asia/Tehran",
                scheduled_due_at: scheduledDueAt.toISOString(),
                runner_build: FUNCTION_BUILD,
                page_offset: offset - records.length
              }
            });
            if (executedRecordIds && runStatus === "success") executedRecordIds.add(recordId);
          }
        }
        if (records.length < pageSize) break;
      }
    }
  }
  return stats;
}
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
var json = (status, payload) => new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" }
});
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json(405, { ok: false, error: "Method not allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { ok: false, error: "Missing env vars" });
  const authHeader = req.headers.get("Authorization") || "";
  const cronSecret = String(Deno.env.get("WORKFLOW_CRON_SECRET") || "").trim();
  const requestSecret = String(req.headers.get("X-Cron-Secret") || "").trim();
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  const isCronSecret = cronSecret && requestSecret === cronSecret;
  if (!isServiceRole && !isCronSecret) {
    return json(401, { ok: false, error: "Unauthorized" });
  }
  try {
    const stats = await runIntervalTick(supabaseUrl, serviceRoleKey);
    console.log(`[workflow-runner] build=${FUNCTION_BUILD} stats=${JSON.stringify(stats)}`);
    return json(200, { ok: true, stats });
  } catch (e) {
    console.error("[workflow-runner] Fatal error:", e.message);
    return json(500, { ok: false, error: String(e?.message || "internal error") });
  }
});
