// @ts-nocheck
// Generated from utils/conditionalFieldRules.ts; do not edit.
// shared/recordRuntime.ts
var normalizeDigits = (value) => {
  const persian = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9";
  const arabic = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
  return String(value ?? "").replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit))).replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)));
};
var comparableValue = (value) => {
  if (value === null || value === void 0) return value;
  if (Array.isArray(value)) return value.map(comparableValue);
  if (typeof value === "object") {
    const preferred = value.id ?? value.value ?? value.label ?? value.name ?? value.title ?? value.full_name ?? value.display;
    return preferred === void 0 ? JSON.stringify(value) : comparableValue(preferred);
  }
  if (typeof value === "boolean") return value;
  const text = normalizeDigits(value).replace(/,/g, "").trim();
  const numeric = Number(text);
  return text !== "" && !Number.isNaN(numeric) ? numeric : text;
};
var normalizeList = (value) => {
  const raw = Array.isArray(value) ? value : typeof value === "string" && value.trim().startsWith("[") ? (() => {
    try {
      return JSON.parse(value);
    } catch {
      return [value];
    }
  })() : [value];
  return raw.flatMap((item) => Array.isArray(item) ? item : [item]).flatMap((item) => item && typeof item === "object" ? [item.id, item.value, item.label, item.name, item.title, item.full_name, item.display] : [item]).map((item) => String(comparableValue(item) ?? "").trim()).filter(Boolean);
};
var WORKFLOW_RUNTIME_TIME_ZONE = "Asia/Tehran";
var parseDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};
var getCalendarDateParts = (value, timeZone = WORKFLOW_RUNTIME_TIME_ZONE) => {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short"
    }).formatToParts(date);
    const read = (type) => parts.find((part) => part.type === type)?.value || "";
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const result = {
      year: Number(read("year")),
      month: Number(read("month")),
      day: Number(read("day")),
      weekday: weekdayMap[read("weekday")]
    };
    return Number.isFinite(result.year) && Number.isFinite(result.month) && Number.isFinite(result.day) && Number.isFinite(result.weekday) ? result : null;
  } catch {
    return null;
  }
};
var calendarDayNumber = (parts) => parts ? Date.UTC(parts.year, parts.month - 1, parts.day) / 864e5 : null;
var getJalaliMonthNumber = (date) => {
  try {
    const raw = new Intl.DateTimeFormat("en-u-ca-persian", {
      timeZone: WORKFLOW_RUNTIME_TIME_ZONE,
      month: "numeric"
    }).formatToParts(date).find((item) => item.type === "month")?.value;
    const month = Number(raw);
    return Number.isFinite(month) ? month : null;
  } catch {
    return null;
  }
};
var compareTimeValue = (value) => {
  const match = String(value ?? "").trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
};
var sameDate = (left, right) => {
  const leftParts = getCalendarDateParts(left);
  const rightParts = getCalendarDateParts(right);
  return !!leftParts && !!rightParts && leftParts.year === rightParts.year && leftParts.month === rightParts.month && leftParts.day === rightParts.day;
};
var daysFromNow = (value, now) => {
  const dateStart = calendarDayNumber(getCalendarDateParts(value));
  const nowStart = calendarDayNumber(getCalendarDateParts(now));
  return dateStart === null || nowStart === null ? null : nowStart - dateStart;
};
var hoursFromNow = (value, now) => {
  const date = parseDate(value);
  return date ? (now.getTime() - date.getTime()) / 36e5 : null;
};
var monthKey = (parts) => parts ? parts.year * 12 + parts.month - 1 : null;
var dateRangeForWeek = (now, offsetWeeks = 0) => {
  const parts = getCalendarDateParts(now);
  const currentDay = calendarDayNumber(parts);
  if (currentDay === null || !parts) return null;
  const start = currentDay - parts.weekday + offsetWeeks * 7;
  return { start, end: start + 6 };
};
var compareCalendarDates = (left, right) => {
  const looksLikeDate = (value) => value instanceof Date || /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(String(value ?? "").trim());
  if (!looksLikeDate(left) || !looksLikeDate(right)) return null;
  const leftDay = calendarDayNumber(getCalendarDateParts(left));
  const rightDay = calendarDayNumber(getCalendarDateParts(right));
  return leftDay === null || rightDay === null ? null : leftDay - rightDay;
};
var CORE_ASYNC_CONDITION_OPERATORS = /* @__PURE__ */ new Set([
  "is_friday",
  "is_official_holiday",
  "occasion_eq",
  "occasion_contains",
  "occasion_neq",
  "occasion_not_contains",
  "days_before_occasion"
]);
var evaluateCoreConditionOperator = ({
  operator,
  currentValue,
  previousValue,
  expectedValue,
  now = /* @__PURE__ */ new Date()
}) => {
  const op = String(operator || "eq").trim();
  if (CORE_ASYNC_CONDITION_OPERATORS.has(op)) return void 0;
  const current = comparableValue(currentValue);
  const previous = comparableValue(previousValue);
  const expected = comparableValue(expectedValue);
  const currentList = normalizeList(currentValue);
  const expectedList = normalizeList(expectedValue);
  const isEmpty = currentValue === null || currentValue === void 0 || String(currentValue).trim() === "" || Array.isArray(currentValue) && currentValue.length === 0;
  const date = parseDate(currentValue);
  const dayDiff = () => daysFromNow(currentValue, now);
  const hourDiff = () => hoursFromNow(currentValue, now);
  switch (op) {
    case "eq":
      return Array.isArray(currentValue) || Array.isArray(expectedValue) ? JSON.stringify([...currentList].sort()) === JSON.stringify([...expectedList].sort()) : String(current ?? "") === String(expected ?? "");
    case "neq":
      return !evaluateCoreConditionOperator({ operator: "eq", currentValue, expectedValue, now });
    case "contains": {
      if (expectedList.length === 0) return false;
      const actual = currentList.length > 0 ? currentList : [String(current ?? "")].filter(Boolean);
      return actual.some((item) => expectedList.some((candidate) => item.toLocaleLowerCase("fa").includes(candidate.toLocaleLowerCase("fa"))));
    }
    case "not_contains":
      return !evaluateCoreConditionOperator({ operator: "contains", currentValue, expectedValue, now });
    case "starts_with":
      return String(current ?? "").toLocaleLowerCase("fa").startsWith(String(expected ?? "").toLocaleLowerCase("fa"));
    case "ends_with":
      return String(current ?? "").toLocaleLowerCase("fa").endsWith(String(expected ?? "").toLocaleLowerCase("fa"));
    // شروط ذخیره‌شدهٔ قدیمی برای تاریخ از همین عملگرهای عمومی استفاده می‌کردند.
    // برای حفظ رفتارشان، اگر هر دو مقدار تاریخ باشند مقایسه را بر مبنای روز تهران
    // انجام می‌دهیم؛ مقایسهٔ عددی برای همهٔ فیلدهای غیرتاریخی بدون تغییر باقی می‌ماند.
    case "gt": {
      const comparison = compareCalendarDates(currentValue, expectedValue);
      return comparison === null ? Number(current) > Number(expected) : comparison > 0;
    }
    case "gte": {
      const comparison = compareCalendarDates(currentValue, expectedValue);
      return comparison === null ? Number(current) >= Number(expected) : comparison >= 0;
    }
    case "lt": {
      const comparison = compareCalendarDates(currentValue, expectedValue);
      return comparison === null ? Number(current) < Number(expected) : comparison < 0;
    }
    case "lte": {
      const comparison = compareCalendarDates(currentValue, expectedValue);
      return comparison === null ? Number(current) <= Number(expected) : comparison <= 0;
    }
    // مقایسه‌های تاریخ بر اساس «روز تقویمی تهران» انجام می‌شوند؛
    // بنابراین ساعتِ ذخیره‌شده در تاریخ/تاریخ‌وساعت روی نتیجه اثر ندارد.
    case "after_date": {
      const comparison = compareCalendarDates(currentValue, expectedValue);
      return comparison !== null && comparison > 0;
    }
    case "before_date": {
      const comparison = compareCalendarDates(currentValue, expectedValue);
      return comparison !== null && comparison < 0;
    }
    case "in":
      return currentList.length > 0 ? currentList.some((item) => expectedList.includes(item)) : expectedList.includes(String(current ?? ""));
    case "not_in":
      return currentList.length > 0 ? !currentList.some((item) => expectedList.includes(item)) : !expectedList.includes(String(current ?? ""));
    case "is_true":
      return currentValue === true || currentValue === "true" || currentValue === 1;
    case "is_false":
      return currentValue === false || currentValue === "false" || currentValue === 0;
    case "is_null":
    case "is_empty":
      return isEmpty;
    case "not_null":
    case "not_empty":
      return !isEmpty;
    case "multi_count_gt":
      return currentList.length > Number(expectedValue ?? 0);
    case "multi_count_lt":
      return currentList.length < Number(expectedValue ?? 0);
    case "changed":
      return JSON.stringify(current ?? null) !== JSON.stringify(previous ?? null);
    case "changed_from":
      return JSON.stringify(previous ?? null) === JSON.stringify(expected ?? null) && JSON.stringify(current ?? null) !== JSON.stringify(previous ?? null);
    case "changed_to":
      return JSON.stringify(current ?? null) === JSON.stringify(expected ?? null) && JSON.stringify(current ?? null) !== JSON.stringify(previous ?? null);
    case "is_today":
      return !!date && sameDate(date, now);
    case "is_yesterday": {
      const currentDay = calendarDayNumber(getCalendarDateParts(currentValue));
      const nowDay = calendarDayNumber(getCalendarDateParts(now));
      return currentDay !== null && nowDay !== null && currentDay === nowDay - 1;
    }
    case "is_tomorrow": {
      const currentDay = calendarDayNumber(getCalendarDateParts(currentValue));
      const nowDay = calendarDayNumber(getCalendarDateParts(now));
      return currentDay !== null && nowDay !== null && currentDay === nowDay + 1;
    }
    case "is_this_week": {
      const range = dateRangeForWeek(now);
      const currentDay = calendarDayNumber(getCalendarDateParts(currentValue));
      return range !== null && currentDay !== null && currentDay >= range.start && currentDay <= range.end;
    }
    case "is_last_week": {
      const range = dateRangeForWeek(now, -1);
      const currentDay = calendarDayNumber(getCalendarDateParts(currentValue));
      return range !== null && currentDay !== null && currentDay >= range.start && currentDay <= range.end;
    }
    case "is_this_month": {
      const currentMonth = monthKey(getCalendarDateParts(currentValue));
      const nowMonth = monthKey(getCalendarDateParts(now));
      return currentMonth !== null && currentMonth === nowMonth;
    }
    case "is_last_month": {
      const currentMonth = monthKey(getCalendarDateParts(currentValue));
      const nowMonth = monthKey(getCalendarDateParts(now));
      return currentMonth !== null && nowMonth !== null && currentMonth === nowMonth - 1;
    }
    case "jalali_month_in": {
      const month = date ? getJalaliMonthNumber(date) : null;
      return month !== null && normalizeList(expectedValue).includes(String(month));
    }
    case "jalali_month_not_in":
      return !evaluateCoreConditionOperator({ operator: "jalali_month_in", currentValue, expectedValue, now });
    case "date_between": {
      const range = expectedValue && typeof expectedValue === "object" ? expectedValue : {};
      const currentDay = calendarDayNumber(getCalendarDateParts(currentValue));
      const fromDay = calendarDayNumber(getCalendarDateParts(range.from));
      const toDay = calendarDayNumber(getCalendarDateParts(range.to));
      return currentDay !== null && fromDay !== null && toDay !== null && currentDay >= fromDay && currentDay <= toDay;
    }
    case "datetime_between": {
      const range = expectedValue && typeof expectedValue === "object" ? expectedValue : {};
      const from = parseDate(range.from);
      const to = parseDate(range.to);
      return !!date && !!from && !!to && date >= from && date <= to;
    }
    case "time_between": {
      const range = expectedValue && typeof expectedValue === "object" ? expectedValue : {};
      const currentTime = compareTimeValue(currentValue);
      const from = compareTimeValue(range.from);
      const to = compareTimeValue(range.to);
      return currentTime !== null && from !== null && to !== null && currentTime >= from && currentTime <= to;
    }
    case "day_of_month_eq":
      return !!getCalendarDateParts(currentValue) && getCalendarDateParts(currentValue).day === Number(expectedValue ?? 0);
    case "day_of_month_neq":
      return !!getCalendarDateParts(currentValue) && getCalendarDateParts(currentValue).day !== Number(expectedValue ?? 0);
    case "day_of_week_eq":
      return !!getCalendarDateParts(currentValue) && getCalendarDateParts(currentValue).weekday === Number(expectedValue ?? 0);
    case "day_of_week_neq":
      return !!getCalendarDateParts(currentValue) && getCalendarDateParts(currentValue).weekday !== Number(expectedValue ?? 0);
    case "days_passed_eq": {
      const diff = dayDiff();
      return diff !== null && Math.floor(diff) === Number(expectedValue ?? 0);
    }
    case "days_passed_gt": {
      const diff = dayDiff();
      return diff !== null && diff > Number(expectedValue ?? 0);
    }
    case "days_passed_lt": {
      const diff = dayDiff();
      return diff !== null && diff < Number(expectedValue ?? 0);
    }
    case "days_remaining_eq": {
      const diff = dayDiff();
      return diff !== null && diff < 0 && Math.floor(Math.abs(diff)) === Number(expectedValue ?? 0);
    }
    case "days_remaining_gt": {
      const diff = dayDiff();
      return diff !== null && diff < 0 && Math.abs(diff) > Number(expectedValue ?? 0);
    }
    case "days_remaining_lt": {
      const diff = dayDiff();
      return diff !== null && diff < 0 && Math.abs(diff) < Number(expectedValue ?? 0);
    }
    case "hours_passed_gt": {
      const diff = hourDiff();
      return diff !== null && diff > Number(expectedValue ?? 0);
    }
    case "hours_passed_lt": {
      const diff = hourDiff();
      return diff !== null && diff < Number(expectedValue ?? 0);
    }
    case "hours_remaining_gt": {
      const diff = hourDiff();
      return diff !== null && diff < 0 && Math.abs(diff) > Number(expectedValue ?? 0);
    }
    case "hours_remaining_lt": {
      const diff = hourDiff();
      return diff !== null && diff < 0 && Math.abs(diff) < Number(expectedValue ?? 0);
    }
    default:
      return false;
  }
};

// utils/conditionalFieldRules.ts
var DEFAULT_EFFECT = {
  showField: true,
  requiredMode: "inherit",
  defaultMode: "inherit"
};
var NUMERIC_FIELD_TYPES = /* @__PURE__ */ new Set([
  "number" /* NUMBER */,
  "price" /* PRICE */,
  "percentage" /* PERCENTAGE */,
  "stock" /* STOCK */,
  "percentage_or_amount" /* PERCENTAGE_OR_AMOUNT */
]);
var ARRAY_FIELD_TYPES = /* @__PURE__ */ new Set([
  "multi_select" /* MULTI_SELECT */,
  "multi_relation" /* MULTI_RELATION */,
  "tags" /* TAGS */,
  "checklist" /* CHECKLIST */
]);
var normalizeString = (value) => String(value ?? "").trim();
var LEGACY_OPERATOR_MAP = {
  ["equals" /* EQUALS */]: "eq",
  ["not_equals" /* NOT_EQUALS */]: "neq",
  ["gt" /* GREATER_THAN */]: "gt",
  ["lt" /* LESS_THAN */]: "lt",
  ["contains" /* CONTAINS */]: "contains",
  ["is_true" /* IS_TRUE */]: "is_true",
  ["is_false" /* IS_FALSE */]: "is_false"
};
var normalizeConditionalOperator = (operator) => {
  const normalized = normalizeString(operator).toLowerCase();
  return LEGACY_OPERATOR_MAP[normalized] || normalized;
};
var normalizeScalarValue = (field, value) => {
  if (value === void 0) return void 0;
  if (value === null) return null;
  if (!field) return value;
  const scalarValue = Array.isArray(value) ? value[0] : value;
  if (ARRAY_FIELD_TYPES.has(field.type)) {
    if (Array.isArray(value)) return value.map((item) => normalizeString(item)).filter(Boolean);
    return normalizeString(value) ? [normalizeString(value)] : [];
  }
  if (NUMERIC_FIELD_TYPES.has(field.type)) {
    if (typeof scalarValue === "number") return Number.isFinite(scalarValue) ? scalarValue : null;
    const parsed = parseFloat(String(scalarValue).replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (field.type === "checkbox" /* CHECKBOX */) {
    if (typeof scalarValue === "boolean") return scalarValue;
    const normalized = normalizeString(scalarValue).toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
    return !!scalarValue;
  }
  if (field.type === "select" /* SELECT */ || field.type === "status" /* STATUS */ || field.type === "relation" /* RELATION */ || field.type === "multi_relation" /* MULTI_RELATION */ || field.type === "user" /* USER */) {
    return normalizeString(scalarValue);
  }
  return scalarValue;
};
var normalizeRuleEffect = (rule) => ({
  ...DEFAULT_EFFECT,
  ...rule.effect || {}
});
var normalizeConditionValue = (field, value) => {
  const normalized = normalizeScalarValue(field, value);
  if (Array.isArray(normalized)) return normalized;
  if (normalized !== null && normalized !== void 0 && typeof normalized !== "boolean" && typeof normalized !== "number") {
    return normalizeString(normalized);
  }
  return normalized;
};
var asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === void 0 || value === null || value === "") return [];
  return [value];
};
var compareEquals = (left, right) => {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftValues = asArray(left).map((item) => normalizeString(item));
    const rightValues = asArray(right).map((item) => normalizeString(item));
    if (leftValues.length !== rightValues.length) return false;
    return leftValues.every((item, index) => item === rightValues[index]);
  }
  return left === right;
};
var compareContains = (left, right) => {
  if (Array.isArray(left)) {
    const normalizedLeft = left.map((item) => normalizeString(item));
    if (Array.isArray(right)) {
      return right.map((item) => normalizeString(item)).some((item) => normalizedLeft.includes(item));
    }
    return normalizedLeft.includes(normalizeString(right));
  }
  return normalizeString(left).includes(normalizeString(right));
};
var compareIn = (left, right) => {
  const normalizedRight = asArray(right).map((item) => normalizeString(item));
  if (!normalizedRight.length) return false;
  if (Array.isArray(left)) {
    return left.map((item) => normalizeString(item)).some((item) => normalizedRight.includes(item));
  }
  return normalizedRight.includes(normalizeString(left));
};
var evaluateWorkflowCondition = (condition, values, fieldsByKey) => {
  const fieldKey = normalizeString(condition?.field);
  if (!fieldKey) return true;
  const field = fieldsByKey[fieldKey];
  const currentValue = normalizeConditionValue(field, values?.[fieldKey]);
  const expectedValue = normalizeConditionValue(field, condition?.value);
  const operator = normalizeConditionalOperator(condition?.operator);
  const isDateField = field?.type === "date" /* DATE */ || field?.type === "datetime" /* DATETIME */;
  if (operator === "after_date" || operator === "before_date" || isDateField && ["gt", "gte", "lt", "lte"].includes(operator)) {
    return evaluateCoreConditionOperator({
      operator,
      currentValue,
      expectedValue
    }) === true;
  }
  switch (operator) {
    case "eq":
    case "equals" /* EQUALS */:
      return compareEquals(currentValue, expectedValue);
    case "neq":
    case "not_equals" /* NOT_EQUALS */:
      return !compareEquals(currentValue, expectedValue);
    case "contains":
    case "contains" /* CONTAINS */:
      return compareContains(currentValue, expectedValue);
    case "not_contains":
      return !compareContains(currentValue, expectedValue);
    case "starts_with":
      return normalizeString(currentValue).startsWith(normalizeString(expectedValue));
    case "ends_with":
      return normalizeString(currentValue).endsWith(normalizeString(expectedValue));
    case "in":
      return compareIn(currentValue, expectedValue);
    case "not_in":
      return !compareIn(currentValue, expectedValue);
    case "gt":
    case "gt" /* GREATER_THAN */:
      return Number(currentValue) > Number(expectedValue);
    case "gte":
      return Number(currentValue) >= Number(expectedValue);
    case "lt":
    case "lt" /* LESS_THAN */:
      return Number(currentValue) < Number(expectedValue);
    case "lte":
      return Number(currentValue) <= Number(expectedValue);
    case "is_true":
    case "is_true" /* IS_TRUE */:
      return currentValue === true;
    case "is_false":
    case "is_false" /* IS_FALSE */:
      return currentValue === false;
    case "is_null":
      return currentValue === null || currentValue === void 0 || currentValue === "" || Array.isArray(currentValue) && currentValue.length === 0;
    case "not_null":
      return !(currentValue === null || currentValue === void 0 || currentValue === "" || Array.isArray(currentValue) && currentValue.length === 0);
    case "multi_count_gt":
      return asArray(currentValue).length > Number(expectedValue ?? 0);
    case "multi_count_lt":
      return asArray(currentValue).length < Number(expectedValue ?? 0);
    default:
      return false;
  }
};
var evaluateLegacyVisibilityRule = (logicOrRule, values) => {
  if (!logicOrRule) return true;
  const rule = logicOrRule.visibleIf || logicOrRule;
  if (!rule || !rule.field) return true;
  return evaluateWorkflowCondition(
    {
      id: String(rule.id || `${rule.field}:${rule.operator || "eq"}`),
      field: String(rule.field),
      operator: normalizeConditionalOperator(rule.operator || "eq"),
      value: rule.value
    },
    values || {},
    {}
  );
};
var normalizeWorkflowCondition = (condition) => ({
  ...condition,
  id: normalizeString(condition?.id) || `condition_${Math.random().toString(36).slice(2, 8)}`,
  field: normalizeString(condition?.field),
  operator: normalizeConditionalOperator(condition?.operator || "eq")
});
var normalizeConditionalFieldRule = (rule) => ({
  id: normalizeString(rule.id) || `conditional_rule_${Math.random().toString(36).slice(2, 8)}`,
  targetFieldKey: normalizeString(rule.targetFieldKey),
  source: rule.source === "system" ? "system" : "user",
  locked: rule.locked === true,
  enabled: rule.enabled !== false,
  priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0,
  conditions_all: (Array.isArray(rule.conditions_all) ? rule.conditions_all : []).map((condition) => normalizeWorkflowCondition(condition)).filter((condition) => !!condition.field),
  conditions_any: (Array.isArray(rule.conditions_any) ? rule.conditions_any : []).map((condition) => normalizeWorkflowCondition(condition)).filter((condition) => !!condition.field),
  effect: normalizeRuleEffect(rule)
});
var normalizeConditionalFieldSettings = (settings) => ({
  rules: (Array.isArray(settings?.rules) ? settings?.rules : []).map((rule) => normalizeConditionalFieldRule(rule)).filter((rule) => !!rule.targetFieldKey).sort((a, b) => b.priority - a.priority || String(a.id).localeCompare(String(b.id)))
});
var resolveConditionalFieldState = (field, values, settings, allFields) => {
  const normalizedSettings = normalizeConditionalFieldSettings(settings);
  const fieldsByKey = Object.fromEntries(
    (allFields || [field]).map((item) => [item.key, item])
  );
  const relevantRules = normalizedSettings.rules.filter((rule) => rule.targetFieldKey === field.key && rule.enabled !== false);
  const baselineVisible = evaluateLegacyVisibilityRule(field.logic, values || {});
  const baselineRequired = field.validation?.required === true;
  if (!relevantRules.length) {
    return {
      hasRules: false,
      visible: baselineVisible,
      required: baselineRequired,
      defaultMode: "inherit",
      defaultValue: field.defaultValue,
      matchedRule: null
    };
  }
  const matchedRules = relevantRules.filter((rule) => {
    const conditionsAll = Array.isArray(rule.conditions_all) ? rule.conditions_all : [];
    const conditionsAny = Array.isArray(rule.conditions_any) ? rule.conditions_any : [];
    const allMatch = conditionsAll.length === 0 || conditionsAll.every((condition) => evaluateWorkflowCondition(condition, values || {}, fieldsByKey));
    const anyMatch = conditionsAny.length === 0 || conditionsAny.some((condition) => evaluateWorkflowCondition(condition, values || {}, fieldsByKey));
    return allMatch && anyMatch;
  });
  const matchedRule = matchedRules[0] || null;
  const hasPositiveRules = relevantRules.some((rule) => normalizeRuleEffect(rule).showField !== false);
  const effect = matchedRule ? normalizeRuleEffect(matchedRule) : DEFAULT_EFFECT;
  let required = baselineRequired;
  if (effect.requiredMode === "force_required") required = true;
  if (effect.requiredMode === "force_optional") required = false;
  return {
    hasRules: true,
    visible: matchedRule ? effect.showField !== false : !hasPositiveRules ? baselineVisible : false,
    required,
    defaultMode: effect.defaultMode,
    defaultValue: effect.defaultValue,
    matchedRule
  };
};
export {
  resolveConditionalFieldState
};
