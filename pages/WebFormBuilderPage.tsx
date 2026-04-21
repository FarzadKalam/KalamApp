import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  QRCode,
  Select,
  Space,
  Spin,
  Switch,
  Tooltip,
  Typography,
} from "antd";
import { ArrowRightOutlined, CopyOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined, PlusOutlined, SaveOutlined, ShareAltOutlined } from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import { supabase } from "../supabaseClient";
import { fetchDynamicOptionsMap } from "../utils/referenceData";
import {
  buildWebFormPublicUrl,
  getMissingWebFormRequiredFields,
  getWebFormModuleDefaultValues,
  getWebFormDuplicateFieldOptions,
  getWebFormModuleOptions,
  getWebFormTargetFields,
  inferWebFormFieldType,
  isWebFormTargetModule,
  isWebFormVirtualTargetField,
  normalizeWebFormConfig,
  normalizeWebFormFieldRecord,
  type WebFormAccessScope,
  type WebFormDisplayMode,
  type WebFormDuplicateStrategy,
} from "../utils/webForms";

const { Paragraph, Text, Title } = Typography;

type BuilderFieldValue = {
  label?: string;
  target_field_key?: string;
  default_value?: any;
  help_text?: string;
  sort_order?: number;
  is_required?: boolean;
  is_hidden?: boolean;
};

type BuilderFormValues = {
  name: string;
  description?: string;
  route_slug: string;
  target_module_id: string;
  access_scope: WebFormAccessScope;
  is_active: boolean;
  header_title?: string;
  header_subtitle?: string;
  submit_label?: string;
  success_message?: string;
  success_redirect_url?: string;
  display_mode?: WebFormDisplayMode;
  slide_show_progress?: boolean;
  slide_allow_back?: boolean;
  slide_auto_advance?: boolean;
  duplicate_match_field?: string;
  duplicate_strategy?: WebFormDuplicateStrategy;
  fields?: BuilderFieldValue[];
};

const isMissingSetupError = (error: any) => {
  const text = String(error?.message || error?.details || error || "").toLowerCase();
  return text.includes("web_forms") && (text.includes("does not exist") || text.includes("could not find"));
};

const slugify = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
};

const buildSuggestedFields = (
  targetModuleId?: string | null,
  accessScope?: WebFormAccessScope | string | null,
): BuilderFieldValue[] => {
  const normalizedTargetModuleId = String(targetModuleId || "").trim();
  if (!normalizedTargetModuleId) return [];

  const targetFields = getWebFormTargetFields(normalizedTargetModuleId, { accessScope }).filter((item) => !item.isVirtual);
  const managedFields = targetFields.filter((item) => item.isManaged);
  const preferredKeys = ["first_name", "last_name", "full_name", "name", "title", "mobile", "mobile_1", "phone", "work_date", "start_date", "end_date", "notes", "description"];

  const preferredFields = [...targetFields]
    .sort((a, b) => {
      const aRequired = a.field?.validation?.required ? 0 : 1;
      const bRequired = b.field?.validation?.required ? 0 : 1;
      if (aRequired !== bRequired) return aRequired - bRequired;
      const aPreferred = preferredKeys.indexOf(a.value);
      const bPreferred = preferredKeys.indexOf(b.value);
      const aScore = aPreferred >= 0 ? aPreferred : 999;
      const bScore = bPreferred >= 0 ? bPreferred : 999;
      return aScore - bScore;
    })
    .slice(0, 6)
    .map((item) => item.value);

  const orderedKeys = [...new Set([...managedFields.map((item) => item.value), ...preferredFields])];

  return orderedKeys
    .map((fieldKey, index) => {
      const item = targetFields.find((candidate) => candidate.value === fieldKey);
      if (!item) return null;
      return {
        label: item.label,
        target_field_key: item.value,
        default_value: item.hasModuleDefault ? item.moduleDefaultValue : undefined,
        sort_order: (index + 1) * 10,
        is_required: item.field?.validation?.required === true,
        is_hidden: false,
      };
    })
    .filter(Boolean) as BuilderFieldValue[];
};

const mergeManagedFields = (
  fields: BuilderFieldValue[] | undefined,
  targetModuleId?: string | null,
  accessScope?: WebFormAccessScope | string | null,
): BuilderFieldValue[] => {
  const currentFields = Array.isArray(fields) ? fields : [];
  const currentByTargetFieldKey = new Map(
    currentFields
      .map((field, index) => ({ field, index, targetFieldKey: String(field?.target_field_key || "").trim() }))
      .filter((item) => item.targetFieldKey)
      .map((item) => [item.targetFieldKey, item]),
  );
  const managedTargets = getWebFormTargetFields(targetModuleId, { accessScope })
    .filter((item) => !item.isVirtual && item.isManaged);

  if (managedTargets.length === 0) return currentFields;

  const nextFields = [...currentFields];
  let nextSortOrder = nextFields.reduce((max, field, index) => {
    const value = Number(field?.sort_order || ((index + 1) * 10));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  managedTargets.forEach((targetField) => {
    const existing = currentByTargetFieldKey.get(targetField.value);
    if (!existing) {
      nextSortOrder += 10;
      nextFields.push({
        label: targetField.label,
        target_field_key: targetField.value,
        default_value: targetField.hasModuleDefault ? targetField.moduleDefaultValue : undefined,
        sort_order: nextSortOrder,
        is_required: targetField.isModuleRequired,
        is_hidden: false,
      });
      return;
    }

    const existingField = existing.field || {};
    nextFields[existing.index] = {
      ...existingField,
      label: String(existingField.label || "").trim() || targetField.label,
      default_value:
        existingField.default_value !== undefined && existingField.default_value !== null && existingField.default_value !== ""
          ? existingField.default_value
          : (targetField.hasModuleDefault ? targetField.moduleDefaultValue : existingField.default_value),
      is_required: existingField.is_required === true || targetField.isModuleRequired,
    };
  });

  return nextFields;
};

const WebFormBuilderPage: React.FC = () => {
  const { id } = useParams();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const [form] = Form.useForm<BuilderFormValues>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupMissing, setSetupMissing] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [dynamicTargetOptions, setDynamicTargetOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const seededFieldsRef = useRef(false);
  const qrContainerRef = useRef<HTMLDivElement | null>(null);

  const preselectedTargetModuleId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const targetModule = String(params.get("targetModule") || "").trim();
    return isWebFormTargetModule(targetModule) ? targetModule : "";
  }, [location.search]);

  const moduleOptions = useMemo(() => getWebFormModuleOptions(), []);
  const targetModuleId = Form.useWatch("target_module_id", form);
  const accessScope = Form.useWatch("access_scope", form);
  const duplicateMatchField = Form.useWatch("duplicate_match_field", form);
  const watchedFields = (Form.useWatch("fields", form) || []) as BuilderFieldValue[];
  const watchedSlug = Form.useWatch("route_slug", form);
  const currentPublicUrl = useMemo(() => buildWebFormPublicUrl(watchedSlug), [watchedSlug]);
  const targetFieldItems = useMemo(() => getWebFormTargetFields(targetModuleId, { accessScope }), [accessScope, targetModuleId]);
  const duplicateFieldOptions = useMemo(() => getWebFormDuplicateFieldOptions(targetModuleId), [targetModuleId]);
  const targetFieldMap = useMemo(
    () => Object.fromEntries(targetFieldItems.map((item) => [item.value, item])),
    [targetFieldItems]
  );
  const missingRequiredFields = useMemo(
    () => getMissingWebFormRequiredFields(targetModuleId, watchedFields),
    [targetModuleId, watchedFields]
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const categories = targetFieldItems
        .map((item) => String((item.field as any)?.dynamicOptionsCategory || "").trim())
        .filter(Boolean);
      if (categories.length === 0) {
        setDynamicTargetOptions({});
        return;
      }
      try {
        const next = await fetchDynamicOptionsMap(supabase, categories);
        if (!cancelled) setDynamicTargetOptions(next);
      } catch {
        if (!cancelled) setDynamicTargetOptions({});
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [targetFieldItems]);

  const resolveTargetOptions = useCallback(
    (targetFieldKey?: string) => {
      const item = targetFieldMap[String(targetFieldKey || "").trim()];
      if (!item) return [];
      if (Array.isArray(item.field?.options) && item.field.options.length > 0) {
        return item.field.options.map((option) => ({
          label: String(option.label || option.value || "").trim(),
          value: String(option.value || option.label || "").trim(),
        })).filter((option) => option.value);
      }
      const category = String((item.field as any)?.dynamicOptionsCategory || "").trim();
      return category ? (dynamicTargetOptions[category] || []) : [];
    },
    [dynamicTargetOptions, targetFieldMap]
  );

  const loadRecentSubmissions = useCallback(async (webFormId: string) => {
    const { data, error } = await supabase
      .from("web_form_submissions")
      .select("id, status, created_at, target_module_id, target_record_id, error_message")
      .eq("web_form_id", webFormId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw error;
    setRecentSubmissions(data || []);
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setSetupMissing(false);
    try {
      if (isEditMode && id) {
        const [{ data: webForm, error: formError }, { data: fieldRows, error: fieldsError }] = await Promise.all([
          supabase.from("web_forms").select("*").eq("id", id).maybeSingle(),
          supabase.from("web_form_fields").select("*").eq("web_form_id", id).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
        ]);

        if (formError) throw formError;
        if (fieldsError) throw fieldsError;
        if (!webForm) {
          message.error("وب فرم موردنظر پیدا نشد.");
          navigate("/web_forms");
          return;
        }

          const config = normalizeWebFormConfig(webForm.config);
          const targetModuleId = String(webForm.target_module_id || "");
          form.setFieldsValue({
            name: webForm.name || "",
            description: webForm.description || "",
            route_slug: webForm.route_slug || "",
            target_module_id: targetModuleId,
            access_scope: (webForm.access_scope || "public") as WebFormAccessScope,
            is_active: webForm.is_active !== false,
            header_title: config.header_title || webForm.name || "",
            header_subtitle: config.header_subtitle || "",
            submit_label: config.submit_label || "ثبت درخواست",
            success_message: config.success_message || "درخواست شما با موفقیت ثبت شد.",
            success_redirect_url: config.success_redirect_url || "",
            display_mode: config.display_mode || "list",
            slide_show_progress: config.slide_show_progress !== false,
            slide_allow_back: config.slide_allow_back !== false,
            slide_auto_advance: config.slide_auto_advance === true,
            duplicate_match_field: config.duplicate_match_field || undefined,
            duplicate_strategy: config.duplicate_strategy || "allow",
            fields: (fieldRows || []).map((item, index) => {
              const normalized = normalizeWebFormFieldRecord(item, index, { targetModuleId });
              return {
                label: normalized.label,
                target_field_key: normalized.target_field_key || undefined,
                default_value: normalized.default_value ?? undefined,
                help_text: normalized.help_text ?? undefined,
                sort_order: normalized.sort_order,
                is_required: normalized.is_required !== false,
                is_hidden: normalized.is_hidden === true,
              };
            }),
          });
        setSlugTouched(true);
        seededFieldsRef.current = true;
        await loadRecentSubmissions(id);
      } else {
        const defaultTargetModuleId = preselectedTargetModuleId || "customers";
        setSlugTouched(false);
        seededFieldsRef.current = false;
        form.setFieldsValue({
          name: defaultTargetModuleId === "customers" ? "فرم استعلام" : `وب فرم ${MODULES[defaultTargetModuleId]?.titles?.fa || ""}`.trim(),
          description: "",
          route_slug: defaultTargetModuleId === "customers" ? "inquiry" : `${defaultTargetModuleId}-form`,
          target_module_id: defaultTargetModuleId,
          access_scope: "public",
          is_active: true,
          header_title: "",
          header_subtitle: "",
          submit_label: "ثبت درخواست",
          success_message: "درخواست شما با موفقیت ثبت شد.",
          success_redirect_url: "",
          display_mode: "list",
          slide_show_progress: true,
          slide_allow_back: true,
          slide_auto_advance: false,
          duplicate_match_field: undefined,
          duplicate_strategy: "allow",
          fields: buildSuggestedFields(defaultTargetModuleId, "public"),
        });
        setRecentSubmissions([]);
      }
    } catch (error: any) {
      if (isMissingSetupError(error)) {
        setSetupMissing(true);
      } else {
        console.error("Web form builder load failed", error);
        message.error("بارگذاری وب فرم ناموفق بود.");
      }
    } finally {
      setLoading(false);
    }
  }, [form, id, isEditMode, loadRecentSubmissions, message, navigate, preselectedTargetModuleId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!targetModuleId) return;
    const currentFields = (form.getFieldValue("fields") || []) as BuilderFieldValue[];
    if (!seededFieldsRef.current) {
      if (!isEditMode && currentFields.length === 0) {
        form.setFieldValue("fields", buildSuggestedFields(targetModuleId, accessScope));
      }
      seededFieldsRef.current = true;
      return;
    }

    const mergedFields = mergeManagedFields(currentFields, targetModuleId, accessScope);
    if (JSON.stringify(currentFields) !== JSON.stringify(mergedFields)) {
      form.setFieldValue("fields", mergedFields);
    }
  }, [accessScope, form, isEditMode, targetModuleId]);

  const handleValuesChange = (changedValues: Partial<BuilderFormValues>) => {
    if (Object.prototype.hasOwnProperty.call(changedValues, "route_slug")) {
      setSlugTouched(true);
    }
    if (!slugTouched && Object.prototype.hasOwnProperty.call(changedValues, "name")) {
      form.setFieldValue("route_slug", slugify(String(changedValues.name || "")));
    }
    if (Object.prototype.hasOwnProperty.call(changedValues, "target_module_id")) {
      const currentDuplicateField = String(form.getFieldValue("duplicate_match_field") || "").trim();
      if (currentDuplicateField && !duplicateFieldOptions.some((item) => item.value === currentDuplicateField)) {
        form.setFieldValue("duplicate_match_field", undefined);
        form.setFieldValue("duplicate_strategy", "allow");
      }
      seededFieldsRef.current = false;
    }
    if (Object.prototype.hasOwnProperty.call(changedValues, "duplicate_match_field")) {
      const nextDuplicateField = String(changedValues.duplicate_match_field || "").trim();
      if (!nextDuplicateField) {
        form.setFieldValue("duplicate_strategy", "allow");
      }
    }
  };

  const copyPublicUrl = useCallback(async () => {
    if (!currentPublicUrl) return;
    try {
      await navigator.clipboard.writeText(currentPublicUrl);
      message.success("لینک وب فرم کپی شد.");
    } catch {
      message.error("کپی لینک ناموفق بود.");
    }
  }, [currentPublicUrl, message]);

  const sharePublicUrl = useCallback(async () => {
    if (!currentPublicUrl) return;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: String(form.getFieldValue("name") || "وب فرم").trim() || "وب فرم",
          url: currentPublicUrl,
        });
        return;
      } catch (error: any) {
        if (String(error?.name || "") === "AbortError") return;
      }
    }

    await copyPublicUrl();
  }, [copyPublicUrl, currentPublicUrl, form]);

  const downloadQrCode = useCallback(() => {
    const container = qrContainerRef.current;
    if (!container || !watchedSlug) {
      message.error("ابتدا لینک معتبر فرم را مشخص کنید.");
      return;
    }

    const normalizedFileName = `${slugify(String(form.getFieldValue("route_slug") || watchedSlug || "web-form")) || "web-form"}-qr`;
    const canvas = container.querySelector("canvas");
    if (canvas instanceof HTMLCanvasElement) {
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${normalizedFileName}.png`;
      link.click();
      message.success("QR وب فرم دانلود شد.");
      return;
    }

    const svg = container.querySelector("svg");
    if (svg instanceof SVGElement) {
      const blob = new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${normalizedFileName}.svg`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 250);
      message.success("QR وب فرم دانلود شد.");
      return;
    }

    message.error("دانلود QR ناموفق بود.");
  }, [form, message, watchedSlug]);

  const renderDefaultValueInput = (fieldIndex: number) => {
    const targetFieldKey = String(watchedFields?.[fieldIndex]?.target_field_key || "").trim();
    const targetFieldItem = targetFieldMap[targetFieldKey];
    const fieldType = targetFieldItem?.inferredType || inferWebFormFieldType(targetFieldItem?.field);
    const options = resolveTargetOptions(targetFieldKey);

    if (fieldType === "select") {
      return (
        <Form.Item label="مقدار پیش‌فرض" name={["fields", fieldIndex, "default_value"]}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={options}
            placeholder={targetFieldItem?.label || "انتخاب مقدار پیش‌فرض"}
          />
        </Form.Item>
      );
    }

    if (fieldType === "checkbox") {
      return (
        <Form.Item label="مقدار پیش‌فرض" name={["fields", fieldIndex, "default_value"]} valuePropName="checked">
          <Checkbox>به‌صورت پیش‌فرض فعال باشد</Checkbox>
        </Form.Item>
      );
    }

    if (fieldType === "multi_select") {
      return (
        <Form.Item label="مقدار پیش‌فرض" name={["fields", fieldIndex, "default_value"]}>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            options={options}
            placeholder={targetFieldItem?.label || "انتخاب مقدار پیش‌فرض"}
          />
        </Form.Item>
      );
    }

    if (fieldType === "number") {
      return (
        <Form.Item label="مقدار پیش‌فرض" name={["fields", fieldIndex, "default_value"]}>
          <InputNumber className="!w-full" placeholder={targetFieldItem?.label || "مقدار پیش‌فرض"} />
        </Form.Item>
      );
    }

    if (fieldType === "date") {
      return (
        <Form.Item label="مقدار پیش‌فرض" name={["fields", fieldIndex, "default_value"]}>
          <Input type="date" placeholder={targetFieldItem?.label || "مقدار پیش‌فرض"} />
        </Form.Item>
      );
    }

    if (fieldType === "time") {
      return (
        <Form.Item label="مقدار پیش‌فرض" name={["fields", fieldIndex, "default_value"]}>
          <Input type="time" placeholder={targetFieldItem?.label || "مقدار پیش‌فرض"} />
        </Form.Item>
      );
    }

    if (fieldType === "datetime") {
      return (
        <Form.Item label="مقدار پیش‌فرض" name={["fields", fieldIndex, "default_value"]}>
          <Input type="datetime-local" placeholder={targetFieldItem?.label || "مقدار پیش‌فرض"} />
        </Form.Item>
      );
    }

    if (fieldType === "location") {
      return (
        <Form.Item label="مقدار پیش‌فرض" name={["fields", fieldIndex, "default_value"]}>
          <Input placeholder="مثال: 35.6892, 51.3890" />
        </Form.Item>
      );
    }

    if (fieldType === "image" || fieldType === "file") {
      return (
        <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
          این نوع فیلد مقدار پیش‌فرض ثابت ندارد و فایل‌ها هنگام تکمیل وب‌فرم آپلود می‌شوند.
        </div>
      );
    }

    return (
      <Form.Item label="مقدار پیش‌فرض" name={["fields", fieldIndex, "default_value"]}>
        <Input placeholder={targetFieldItem?.label || "مقدار پیش‌فرض"} />
      </Form.Item>
    );
  };

  const handleSave = async (values: BuilderFormValues) => {
    setSaving(true);
    try {
      const cleanedSlug = slugify(values.route_slug || values.name || "");
      if (!cleanedSlug) {
        message.error("اسلاگ فرم الزامی است.");
        return;
      }

      if (!isWebFormTargetModule(values.target_module_id)) {
        message.error("بخش مقصد برای این وب فرم معتبر نیست.");
        return;
      }

      const config = {
        header_title: String(values.header_title || "").trim(),
        header_subtitle: String(values.header_subtitle || "").trim(),
        submit_label: String(values.submit_label || "").trim() || "ثبت درخواست",
        success_message: String(values.success_message || "").trim() || "درخواست شما با موفقیت ثبت شد.",
        success_redirect_url: String(values.success_redirect_url || "").trim(),
        display_mode: values.display_mode === "slide" ? "slide" : "list",
        slide_show_progress: values.slide_show_progress !== false,
        slide_allow_back: values.slide_allow_back !== false,
        slide_auto_advance: values.slide_auto_advance === true,
        duplicate_match_field: String(values.duplicate_match_field || "").trim(),
        duplicate_strategy: values.duplicate_strategy || "allow",
        default_record_values: getWebFormModuleDefaultValues(values.target_module_id, { accessScope: values.access_scope }),
      };

      const basePayload = {
        name: String(values.name || "").trim(),
        description: String(values.description || "").trim() || null,
        route_slug: cleanedSlug,
        target_module_id: values.target_module_id,
        access_scope: values.access_scope || "public",
        is_active: values.is_active !== false,
        config,
      };

      let webFormId = String(id || "").trim();
      if (isEditMode && webFormId) {
        const { error } = await supabase.from("web_forms").update(basePayload).eq("id", webFormId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("web_forms").insert(basePayload).select("id").single();
        if (error) throw error;
        webFormId = String(data?.id || "").trim();
      }

      if (!webFormId) throw new Error("WEB_FORM_SAVE_NO_ID");

      const mergedFields = mergeManagedFields(values.fields || [], values.target_module_id, values.access_scope);

      const cleanedFields = mergedFields
        .map((item, index) => {
          const targetFieldKey = String(item?.target_field_key || "").trim();
          const targetFieldItem = targetFieldMap[targetFieldKey];
          if (!targetFieldKey || !targetFieldItem) return null;

          const label = String(item?.label || targetFieldItem.label || "").trim() || targetFieldItem.label;
          const resolvedOptions = resolveTargetOptions(targetFieldKey);
          const defaultValue = item?.default_value;

          return {
            web_form_id: webFormId,
            field_key: targetFieldKey,
            label,
            target_field_key: targetFieldKey,
            field_type: targetFieldItem.inferredType || inferWebFormFieldType(targetFieldItem.field),
            placeholder: (targetFieldItem.inferredType === "image"
              ? "آپلود تصویر"
              : targetFieldItem.inferredType === "file"
                ? "آپلود فایل"
                : label),
            help_text: String(item?.help_text || "").trim() || null,
            default_value: defaultValue === "" ? null : defaultValue,
            config: {
              select_options: resolvedOptions,
            },
            sort_order: Number(item?.sort_order || ((index + 1) * 10)),
            is_required: item?.is_required !== false,
            is_hidden: item?.is_hidden === true,
            is_active: true,
          };
        })
        .filter(Boolean);

      const { error: deleteFieldsError } = await supabase.from("web_form_fields").delete().eq("web_form_id", webFormId);
      if (deleteFieldsError) throw deleteFieldsError;

      if (cleanedFields.length > 0) {
        const { error: insertFieldsError } = await supabase.from("web_form_fields").insert(cleanedFields);
        if (insertFieldsError) throw insertFieldsError;
      }

      message.success(isEditMode ? "وب فرم بروزرسانی شد." : "وب فرم ایجاد شد.");
      navigate(`/web_forms/${webFormId}`);
    } catch (error: any) {
      if (isMissingSetupError(error)) {
        setSetupMissing(true);
      } else {
        console.error("Web form save failed", error);
        message.error("ذخیره وب فرم ناموفق بود.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title level={2} className="!mb-2">
            {isEditMode ? "ویرایش وب فرم" : "وب فرم جدید"}
          </Title>
          <Paragraph className="!mb-0 text-gray-500">
            وب فرم را برای ثبت عمومی یا داخلی روی هر بخش عملیاتی غیرحسابداری بسازید. برای فرم داخلی، کاربر قبل از ثبت باید لاگین باشد.
          </Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ArrowRightOutlined />} onClick={() => navigate("/web_forms")}>
            بازگشت به لیست
          </Button>
          <Button icon={<EyeOutlined />} disabled={!watchedSlug} onClick={() => window.open(currentPublicUrl, "_blank", "noopener,noreferrer")}>
            پیش‌نمایش عمومی
          </Button>
        </Space>
      </div>

      {setupMissing ? (
        <Alert
          className="mb-6"
          type="warning"
          showIcon
          message="نسخه کامل زیرساخت وب فرم روی دیتابیس در دسترس نیست."
          description="اگر قبلا فاز 60 را اجرا کرده‌اید، همین فایل به‌روز را دوباره اجرا کنید تا ستون‌ها و توابع نسخه جدید هم به دیتابیس اضافه شوند."
        />
      ) : null}

      <Form form={form} layout="vertical" onFinish={handleSave} onValuesChange={handleValuesChange} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card className="rounded-3xl">
              <div className="grid gap-4 md:grid-cols-2">
                <Form.Item label="نام فرم" name="name" rules={[{ required: true, message: "نام فرم الزامی است." }]}>
                  <Input placeholder="مثال: فرم درخواست مرخصی" />
                </Form.Item>

                <Form.Item label="اسلاگ عمومی" name="route_slug" rules={[{ required: true, message: "اسلاگ الزامی است." }]}>
                  <Input placeholder="مثال: inquiry یا leave-request" />
                </Form.Item>

                <Form.Item label="بخش مقصد" name="target_module_id" rules={[{ required: true, message: "انتخاب بخش مقصد الزامی است." }]}>
                  <Select showSearch optionFilterProp="label" options={moduleOptions} placeholder="انتخاب بخش" />
                </Form.Item>

                <Form.Item label="نوع دسترسی" name="access_scope" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { label: "عمومی", value: "public" },
                      { label: "داخلی", value: "internal" },
                    ]}
                  />
                </Form.Item>

                <Form.Item label="وضعیت" name="is_active" valuePropName="checked">
                  <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                </Form.Item>

                <Form.Item label="مدل نمایش عمومی" name="display_mode" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { label: "لیستی", value: "list" },
                      { label: "اسلایدی", value: "slide" },
                    ]}
                  />
                </Form.Item>

                <Form.Item label="عنوان فرم" name="header_title" className="md:col-span-2">
                  <Input placeholder="اگر خالی باشد از نام فرم استفاده می‌شود." />
                </Form.Item>

                <Form.Item label="زیرعنوان فرم" name="header_subtitle" className="md:col-span-2">
                  <Input.TextArea rows={2} placeholder="متن کوتاه زیر عنوان" />
                </Form.Item>

                <Form.Item label="توضیحات داخلی" name="description" className="md:col-span-2">
                  <Input.TextArea rows={3} placeholder="این متن فقط داخل پنل مدیریت دیده می‌شود." />
                </Form.Item>

                <div className="md:col-span-2 rounded-2xl border border-dashed border-gray-200 p-4">
                  <div className="mb-3 text-sm font-semibold text-gray-700">تنظیمات تجربه فرم</div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Form.Item name="slide_show_progress" valuePropName="checked" className="mb-0">
                      <Checkbox>نمایش نوار پیشرفت</Checkbox>
                    </Form.Item>
                    <Form.Item name="slide_allow_back" valuePropName="checked" className="mb-0">
                      <Checkbox>اجازه بازگشت بین اسلایدها</Checkbox>
                    </Form.Item>
                    <Form.Item name="slide_auto_advance" valuePropName="checked" className="mb-0">
                      <Checkbox>حرکت خودکار برای گزینه‌های تک‌انتخابی</Checkbox>
                    </Form.Item>
                  </div>
                </div>

                <div className="md:col-span-2 rounded-2xl border border-dashed border-gray-200 p-4">
                  <div className="mb-3 text-sm font-semibold text-gray-700">مدیریت رکوردهای تکراری</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Form.Item label="فیلد تطبیق تکراری" name="duplicate_match_field">
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={duplicateFieldOptions.map((item) => ({ label: item.label, value: item.value }))}
                        placeholder="مثلا موبایل، کد ملی، عنوان یا نام"
                      />
                    </Form.Item>
                    <Form.Item label="رفتار با تکراری" name="duplicate_strategy">
                      <Select
                        disabled={!String(duplicateMatchField || "").trim()}
                        options={[
                          { label: "تکراری‌ها ثبت شوند", value: "allow" },
                          { label: "تکراری‌ها بازنویسی شوند", value: "update" },
                          { label: "تکراری‌ها ثبت نشوند", value: "skip" },
                        ]}
                      />
                   </Form.Item>
                  </div>
                  <div className="text-xs text-gray-500">
                    {String(duplicateMatchField || "").trim()
                      ? "وب‌فرم قبل از ثبت بر اساس همین فیلد رکورد مشابه را پیدا می‌کند و رفتار انتخاب‌شده را اعمال می‌کند."
                      : "برای فعال‌شدن منطق تکراری‌ها، اول یک فیلد قابل تطبیق مثل موبایل، کد، نام یا تاریخ را انتخاب کنید."}
                  </div>
                </div>
              </div>
            </Card>

            <Card
              className="rounded-3xl"
              title="فیلدهای فرم"
              extra={
                  <Button type="link" disabled={!targetModuleId} onClick={() => form.setFieldValue("fields", buildSuggestedFields(targetModuleId, accessScope))}>
                  بارگذاری فیلدهای پیشنهادی
                </Button>
              }
            >
              {missingRequiredFields.length > 0 ? (
                <Alert
                  className="mb-4"
                  type="info"
                  showIcon
                  message="چند فیلد ضروری ماژول مقصد هنوز در فرم نیست."
                  description={`فیلدهای باقی‌مانده: ${missingRequiredFields.join("، ")}`}
                />
              ) : null}

              <Form.List name="fields">
                {(fields, { add, remove }) => (
                  <div className="space-y-4">
                    {fields.length === 0 ? <Empty description="هنوز فیلدی برای این فرم تعریف نشده است." /> : null}

                    {fields.map((field, index) => {
                      const currentTargetFieldKey = String(watchedFields?.[index]?.target_field_key || "").trim();
                      const targetFieldItem = targetFieldMap[currentTargetFieldKey];
                      const inferredType = targetFieldItem?.inferredType || inferWebFormFieldType(targetFieldItem?.field);
                      const optionCount = resolveTargetOptions(currentTargetFieldKey).length;
                      const isManagedField = targetFieldItem?.isManaged === true;

                      return (
                        <Card
                          key={field.key}
                          size="small"
                          className="rounded-2xl border border-dashed"
                          title={<span>فیلد {index + 1}</span>}
                          extra={<Button danger type="text" icon={<DeleteOutlined />} disabled={isManagedField} onClick={() => remove(field.name)}>حذف</Button>}
                        >
                          <div className="grid gap-4 md:grid-cols-2">
                            <Form.Item label="فیلد مقصد" name={[field.name, "target_field_key"]} rules={[{ required: true, message: "فیلد مقصد را انتخاب کنید." }]}>
                              <Select
                                showSearch
                                optionFilterProp="label"
                                options={targetFieldItems.map((item) => ({ label: item.label, value: item.value }))}
                                placeholder="انتخاب فیلد"
                                onChange={(value) => {
                                  const matched = targetFieldMap[String(value || "").trim()];
                                  if (!matched) return;
                                  const currentLabel = String(form.getFieldValue(["fields", field.name, "label"]) || "").trim();
                                  if (!currentLabel) {
                                    form.setFieldValue(["fields", field.name, "label"], matched.label);
                                  }
                                  form.setFieldValue(["fields", field.name, "default_value"], undefined);
                                }}
                              />
                            </Form.Item>

                            <Form.Item label="عنوان نمایشی" name={[field.name, "label"]}>
                              <Input placeholder={targetFieldItem?.label || "عنوان فیلد"} />
                            </Form.Item>

                            <Form.Item label="راهنمای کوتاه" name={[field.name, "help_text"]}>
                              <Input placeholder="متن کمکی زیر فیلد" />
                            </Form.Item>

                            <div className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-500">
                              <div>نوع ورودی: {inferredType || "-"}</div>
                              {targetFieldItem?.isModuleRequired ? <div className="mt-1 text-red-500">الزامی در ماژول مقصد</div> : null}
                              {targetFieldItem?.hasModuleDefault ? <div className="mt-1 text-blue-600">پیش‌فرض ماژول: {String(targetFieldItem.moduleDefaultValue)}</div> : null}
                              {isManagedField ? <div className="mt-1">این فیلد به‌خاطر تنظیمات ماژول باید در فرم باقی بماند.</div> : null}
                              {inferredType === "select" || inferredType === "multi_select" ? <div className="mt-1">تعداد گزینه‌ها: {optionCount}</div> : null}
                              {isWebFormVirtualTargetField(currentTargetFieldKey) ? <div className="mt-1">نوع ویژه: پیوست وب‌فرم</div> : null}
                              <div className="mt-1">Placeholder: {String(watchedFields?.[index]?.label || targetFieldItem?.label || "-")}</div>
                            </div>

                            <Form.Item label="ترتیب نمایش" name={[field.name, "sort_order"]}>
                              <InputNumber className="!w-full" placeholder="ترتیب" />
                            </Form.Item>

                            {renderDefaultValueInput(index)}

                            <Form.Item name={[field.name, "is_required"]} valuePropName="checked" className="mb-0">
                              <Checkbox>اجباری برای ثبت‌کننده</Checkbox>
                            </Form.Item>

                            <Form.Item name={[field.name, "is_hidden"]} valuePropName="checked" className="mb-0">
                              <Checkbox>مخفی</Checkbox>
                            </Form.Item>
                          </div>
                        </Card>
                      );
                    })}

                    <Button
                      type="dashed"
                      block
                      icon={<PlusOutlined />}
                      onClick={() => add({ label: "", target_field_key: undefined, default_value: undefined, sort_order: (fields.length + 1) * 10, is_required: false, is_hidden: false })}
                    >
                      افزودن فیلد
                    </Button>
                  </div>
                )}
              </Form.List>
            </Card>

            <Card className="rounded-3xl" title="رفتار ثبت">
              <div className="grid gap-4 md:grid-cols-2">
                <Form.Item label="عنوان دکمه ثبت" name="submit_label">
                  <Input placeholder="ثبت درخواست" />
                </Form.Item>

                <Form.Item label="آدرس بعد از ثبت" name="success_redirect_url">
                  <Input placeholder="اختیاری" />
                </Form.Item>

                <Form.Item label="پیام موفقیت" name="success_message" className="md:col-span-2">
                  <Input.TextArea rows={2} />
                </Form.Item>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-3xl">
              <Space direction="vertical" size="middle" className="w-full">
                <div>
                  <Text type="secondary">لینک عمومی</Text>
                  <div className="mt-2 flex items-start gap-2">
                    <div className="min-w-0 flex-1 break-all font-medium">{currentPublicUrl}</div>
                    <Tooltip title="کپی لینک">
                      <Button type="text" size="small" icon={<CopyOutlined />} disabled={!watchedSlug} onClick={() => void copyPublicUrl()} />
                    </Tooltip>
                  </div>
                </div>
                <div>
                  <Text type="secondary">بخش مقصد</Text>
                  <div className="mt-1 font-medium">{MODULES[String(targetModuleId || "")]?.titles?.fa || "-"}</div>
                </div>
                <div>
                  <Text type="secondary">دسترسی</Text>
                  <div className="mt-1 font-medium">{accessScope === "internal" ? "داخلی" : "عمومی"}</div>
                </div>
                <div>
                  <Text type="secondary">QR وب فرم</Text>
                  <div
                    ref={qrContainerRef}
                    className="mt-3 flex justify-center rounded-[28px] border border-dashed border-gray-200 bg-white p-4"
                  >
                    <QRCode value={currentPublicUrl} bordered={false} size={168} />
                  </div>
                </div>
                <Space wrap>
                  <Button icon={<EyeOutlined />} disabled={!watchedSlug} onClick={() => window.open(currentPublicUrl, "_blank", "noopener,noreferrer")}>
                    مشاهده فرم
                  </Button>
                  <Button icon={<ShareAltOutlined />} disabled={!watchedSlug} onClick={() => void sharePublicUrl()}>
                    اشتراک
                  </Button>
                  <Button icon={<DownloadOutlined />} disabled={!watchedSlug} onClick={downloadQrCode}>
                    دانلود QR
                  </Button>
                  <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
                    ذخیره
                  </Button>
                </Space>
              </Space>
            </Card>

            <Card className="rounded-3xl" title="آخرین ارسال‌ها">
              {recentSubmissions.length === 0 ? (
                <Empty description="هنوز ارسالی برای این فرم ثبت نشده است." />
              ) : (
                <div className="space-y-3">
                  {recentSubmissions.map((submission) => (
                    <div key={submission.id} className="rounded-2xl border border-gray-200 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${submission.status === "submitted" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {submission.status === "submitted" ? "ثبت‌شده" : "ناموفق"}
                        </span>
                        <Text type="secondary">{formatDateTime(submission.created_at)}</Text>
                      </div>
                      <div className="text-sm text-gray-600">
                        بخش: {MODULES[submission.target_module_id]?.titles?.fa || submission.target_module_id || "-"}
                      </div>
                      {submission.target_record_id ? (
                        <Button type="link" className="!px-0" onClick={() => navigate(`/${submission.target_module_id}/${submission.target_record_id}`)}>
                          مشاهده رکورد ایجادشده
                        </Button>
                      ) : null}
                      {submission.error_message ? <Alert className="mt-3" type="error" showIcon message={submission.error_message} /> : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </Form>
    </div>
  );
};

export default WebFormBuilderPage;
