import { describe, expect, it } from "vitest";
import { FieldType } from "../types";
import {
  buildJsonArrayViewCrudFilters,
  isJsonArrayViewFilterField,
  normalizeJsonArrayViewFilterValues,
} from "./viewCrudFilters";

describe("viewCrudFilters", () => {
  it("builds JSON contains filters for Persian multi-select view values", () => {
    const filters = buildJsonArrayViewCrudFilters("project_alignment", "in", [
      "چاپ اکوسالونت",
      "نصب",
    ]);

    expect(filters).toEqual([
      {
        operator: "or",
        value: [
          {
            field: "project_alignment",
            operator: "cs",
            value: JSON.stringify(["چاپ اکوسالونت"]),
            _displayField: "project_alignment",
            _displayOperator: "in",
            _displayValue: ["چاپ اکوسالونت", "نصب"],
          },
          {
            field: "project_alignment",
            operator: "cs",
            value: JSON.stringify(["نصب"]),
            _displayField: "project_alignment",
            _displayOperator: "in",
            _displayValue: ["چاپ اکوسالونت", "نصب"],
          },
        ],
        _displayField: "project_alignment",
        _displayOperator: "in",
        _displayValue: ["چاپ اکوسالونت", "نصب"],
      },
    ]);
  });

  it("builds a single JSON contains filter for one selected value", () => {
    expect(buildJsonArrayViewCrudFilters("project_alignment", "contains", "چاپ اکوسالونت")).toEqual([
      {
        field: "project_alignment",
        operator: "cs",
        value: JSON.stringify(["چاپ اکوسالونت"]),
        _displayField: "project_alignment",
        _displayOperator: "contains",
        _displayValue: ["چاپ اکوسالونت"],
      },
    ]);
  });

  it("builds negative JSON contains filters for excluded values", () => {
    expect(buildJsonArrayViewCrudFilters("project_alignment", "not_in", ["چاپ", "نصب"])).toEqual([
      {
        field: "project_alignment",
        operator: "not.cs",
        value: JSON.stringify(["چاپ"]),
        _displayField: "project_alignment",
        _displayOperator: "not_in",
        _displayValue: ["چاپ", "نصب"],
      },
      {
        field: "project_alignment",
        operator: "not.cs",
        value: JSON.stringify(["نصب"]),
        _displayField: "project_alignment",
        _displayOperator: "not_in",
        _displayValue: ["چاپ", "نصب"],
      },
    ]);
  });

  it("normalizes repeated and empty array filter values", () => {
    expect(normalizeJsonArrayViewFilterValues(["چاپ", "", "چاپ", null, " نصب "])).toEqual([
      "چاپ",
      "نصب",
    ]);
  });

  it("detects module fields stored as JSON arrays", () => {
    expect(isJsonArrayViewFilterField({ key: "project_alignment", type: FieldType.MULTI_SELECT, labels: { fa: "دپارتمان‌ها" } })).toBe(true);
    expect(isJsonArrayViewFilterField({ key: "related_ids", type: FieldType.MULTI_RELATION, labels: { fa: "رکوردها" } })).toBe(true);
    expect(isJsonArrayViewFilterField({ key: "items", type: FieldType.CHECKLIST, labels: { fa: "موارد" } })).toBe(true);
    expect(isJsonArrayViewFilterField({ key: "tags", type: FieldType.TAGS, labels: { fa: "برچسب‌ها" } })).toBe(false);
    expect(isJsonArrayViewFilterField({ key: "status", type: FieldType.STATUS, labels: { fa: "وضعیت" } })).toBe(false);
  });
});
