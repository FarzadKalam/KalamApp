import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Form, Input, Space, Spin, Typography, Upload } from "antd";
import { ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined, LockOutlined, LoginOutlined } from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import PersianDatePicker from "../components/PersianDatePicker";
import SmartFieldRenderer from "../components/SmartFieldRenderer";
import { MODULES } from "../moduleRegistry";
import { supabase } from "../supabaseClient";
import { FieldType, type ModuleField } from "../types";
import { runWorkflowsForEvent } from "../utils/workflowRuntime";
import { BRANDING_APPLIED_EVENT, DEFAULT_BRANDING } from "../theme/brandTheme";
import { readRuntimeBranding } from "../utils/brandingRuntime";
import { FILE_STORAGE_BUCKET, fileStorageClient } from "../utils/storageClient";
import { uploadFileWithProgress } from "../utils/uploadFileWithProgress";
import { toFaErrorMessage } from "../utils/errorMessageFa";
import { fetchDynamicOptionsMap } from "../utils/referenceData";
import {
  isWebFormCurrentEmployeeDefaultField,
  normalizeWebFormConfig,
  normalizeWebFormFieldRecord,
  type WebFormAccessScope,
  type WebFormFieldRecord,
} from "../utils/webForms";

const { Paragraph, Text, Title } = Typography;

type PublicUploadedAsset = {
  url: string;
  name: string;
  mimeType?: string | null;
  fileType: "image" | "file";
};

type PublicWebFormState = {
  mode: "dynamic" | "legacy";
  slug: string;
  name: string;
  accessScope: WebFormAccessScope;
  targetModuleId: string;
  config: ReturnType<typeof normalizeWebFormConfig>;
  fields: WebFormFieldRecord[];
  companySettings: Record<string, any>;
};

type PublicBrandingRpcRow = {
  org_id?: string | null;
  company_settings?: unknown;
  branding_settings?: unknown;
};

type PublicWebFormRpcRow = {
  org_id?: string | null;
  form_id?: string | null;
  web_form?: unknown;
  fields?: unknown;
  company_settings?: unknown;
  branding_settings?: unknown;
};

type PublicChoiceOption = {
  label: string;
  value: string;
};

const LEGACY_PREFIX_OPTIONS = [
  { label: "آقای", value: "آقای" },
  { label: "خانم", value: "خانم" },
  { label: "دکتر", value: "دکتر" },
  { label: "مهندس", value: "مهندس" },
];

const mapWebFormFieldTypeToModuleFieldType = (fieldType: WebFormFieldRecord["field_type"]): FieldType => {
  switch (fieldType) {
    case "long_text":
      return FieldType.LONG_TEXT;
    case "number":
      return FieldType.NUMBER;
    case "phone":
      return FieldType.PHONE;
    case "date":
      return FieldType.DATE;
    case "time":
      return FieldType.TIME;
    case "datetime":
      return FieldType.DATETIME;
    case "image":
      return FieldType.IMAGE;
    case "multi_select":
      return FieldType.MULTI_SELECT;
    case "location":
      return FieldType.LOCATION;
    case "relation":
      return FieldType.RELATION;
    case "checkbox":
      return FieldType.CHECKBOX;
    case "select":
      return FieldType.SELECT;
    default:
      return FieldType.TEXT;
  }
};

const buildPublicModuleField = (field: WebFormFieldRecord, targetModuleId?: string | null): ModuleField => {
  const normalizedTargetModuleId = String(targetModuleId || "").trim();
  const targetFieldKey = String(field.target_field_key || field.field_key || "").trim();
  const targetField = normalizedTargetModuleId
    ? (MODULES[normalizedTargetModuleId]?.fields || []).find((item) => String(item?.key || "").trim() === targetFieldKey)
    : null;
  const configuredOptions = Array.isArray(field.config?.select_options) ? field.config.select_options : [];
  const liveOptions = Array.isArray(targetField?.options) ? targetField.options : [];
  const resolvedOptions = liveOptions.length > 0 ? liveOptions : configuredOptions;
  return {
    ...(targetField || {}),
    key: targetFieldKey || field.field_key,
    type: targetField?.type || mapWebFormFieldTypeToModuleFieldType(field.field_type),
    labels: {
      fa: field.label,
      en: targetField?.labels?.en,
    },
    options: resolvedOptions,
    validation: {
      ...(targetField?.validation || {}),
      required: field.is_required === true,
    },
    dynamicOptionsCategory: targetField?.dynamicOptionsCategory,
    relationConfig: targetField?.relationConfig,
    mode: targetField?.mode,
    readonly: false,
    hideInCreateForm: false,
  };
};

const getSlideFieldHeightClass = (field: WebFormFieldRecord) =>
  field.field_type === "long_text" ? "min-h-[180px]" : "min-h-[64px]";

const isWideField = (field: WebFormFieldRecord) =>
  field.field_type === "long_text"
  || field.field_type === "checkbox"
  || field.field_type === "location"
  || field.field_type === "multi_select"
  || field.field_type === "image"
  || field.field_type === "file";

const normalizePublicFieldValue = (field: WebFormFieldRecord, rawValue: any) => {
  if (rawValue === undefined) return undefined;
  if (rawValue === null) return null;

  if (field.field_type === "checkbox") return Boolean(rawValue);

  if (field.field_type === "multi_select") {
    const list = Array.isArray(rawValue)
      ? rawValue
      : (rawValue === "" ? [] : [rawValue]);
    return list
      .map((item) => (item === null || item === undefined ? "" : String(item).trim()))
      .filter(Boolean);
  }

  if (field.field_type === "image" || field.field_type === "file") {
    const list = Array.isArray(rawValue)
      ? rawValue
      : (rawValue ? [rawValue] : []);
    return list
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const url = String((item as any).url || "").trim();
        if (!url) return null;
        return {
          url,
          name: String((item as any).name || "").trim() || "file",
          mimeType: String((item as any).mimeType || "").trim() || null,
          fileType: field.field_type === "image" ? "image" : "file",
        };
      })
      .filter(Boolean);
  }

  if (field.field_type === "number") {
    if (rawValue === "") return null;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    return trimmed === "" ? null : trimmed;
  }

  return rawValue;
};

const LEGACY_INQUIRY_FIELDS: WebFormFieldRecord[] = [
  {
    field_key: "prefix",
    label: "پیشوند",
    target_field_key: "prefix",
    field_type: "select",
    config: { select_options: LEGACY_PREFIX_OPTIONS },
    sort_order: 10,
    is_required: false,
    is_hidden: false,
  },
  {
    field_key: "first_name",
    label: "نام",
    target_field_key: "first_name",
    field_type: "text",
    sort_order: 20,
    is_required: true,
    is_hidden: false,
  },
  {
    field_key: "last_name",
    label: "نام خانوادگی",
    target_field_key: "last_name",
    field_type: "text",
    sort_order: 30,
    is_required: true,
    is_hidden: false,
  },
  {
    field_key: "business_name",
    label: "نام کسب و کار",
    target_field_key: "business_name",
    field_type: "text",
    sort_order: 40,
    is_required: false,
    is_hidden: false,
  },
  {
    field_key: "phone",
    label: "تلفن تماس",
    target_field_key: "mobile_1",
    field_type: "phone",
    sort_order: 50,
    is_required: true,
    is_hidden: false,
  },
  {
    field_key: "description",
    label: "توضیحات",
    target_field_key: "notes",
    field_type: "long_text",
    sort_order: 60,
    is_required: false,
    is_hidden: false,
  },
];

const toRecord = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const isMissingWebFormSetupError = (error: any) => {
  const text = String(error?.message || error?.details || error || "").toLowerCase();
  return text.includes("web_form") || text.includes("submit_public_web_form") || text.includes("get_public_web_form");
};

const buildLegacyInquiryState = (companySettings?: Record<string, any>): PublicWebFormState => ({
  mode: "legacy",
  slug: "inquiry",
  name: "فرم استعلام",
  accessScope: "public",
  targetModuleId: "customers",
  config: normalizeWebFormConfig({
    header_title: "فرم استعلام",
    header_subtitle: "",
    submit_label: "ثبت درخواست",
    success_message: "درخواست شما با موفقیت ثبت شد.",
  }),
  fields: LEGACY_INQUIRY_FIELDS,
  companySettings: companySettings || {},
});

const ensureAbsoluteUrl = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const normalizeHandle = (value: unknown) => String(value || "").trim().replace(/^@+/, "");

const buildSocialHref = (
  kind: "website" | "instagram" | "telegram" | "youtube" | "whatsapp" | "eitaa" | "rubika" | "bale",
  rawValue: unknown
) => {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (kind === "website") return ensureAbsoluteUrl(trimmed);
  if (kind === "instagram") return `https://instagram.com/${normalizeHandle(trimmed)}`;
  if (kind === "telegram") return `https://t.me/${normalizeHandle(trimmed)}`;
  if (kind === "youtube") {
    const normalized = trimmed.startsWith("@") ? trimmed : `@${normalizeHandle(trimmed)}`;
    return `https://youtube.com/${normalized}`;
  }
  if (kind === "whatsapp") {
    const digits = trimmed.replace(/[^\d]/g, "");
    return digits ? `https://wa.me/${digits}` : undefined;
  }
  if (kind === "eitaa") return `https://eitaa.com/${normalizeHandle(trimmed)}`;
  if (kind === "rubika") return `https://rubika.ir/${normalizeHandle(trimmed)}`;
  if (kind === "bale") return `https://ble.ir/${normalizeHandle(trimmed)}`;
  return undefined;
};

const InquiryForm = () => {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [form] = Form.useForm<Record<string, any>>();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publicForm, setPublicForm] = useState<PublicWebFormState | null>(null);
  const [branding, setBranding] = useState(() => readRuntimeBranding() || DEFAULT_BRANDING);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false
  );
  const [authUser, setAuthUser] = useState<any>(null);
  const [currentEmployee, setCurrentEmployee] = useState<Record<string, any> | null>(null);
  const [currentEmployeeLoaded, setCurrentEmployeeLoaded] = useState(false);
  const [uploadingFieldKeys, setUploadingFieldKeys] = useState<Record<string, boolean>>({});
  const [dynamicFieldOptions, setDynamicFieldOptions] = useState<Record<string, PublicChoiceOption[]>>({});
  const watchedFormValues = Form.useWatch([], form) || {};

  const requestedSlug = useMemo(() => {
    const wildcard = String(params["*"] || "").trim();
    if (wildcard) {
      const firstSegment = wildcard.split("/").filter(Boolean)[0];
      if (firstSegment) return firstSegment;
    }
    const querySlug = String(new URLSearchParams(location.search).get("slug") || "").trim();
    return querySlug || "inquiry";
  }, [location.search, params]);

  const currentPathWithQuery = useMemo(
    () => `${location.pathname}${location.search || ""}${location.hash || ""}`,
    [location.hash, location.pathname, location.search]
  );

  const loginRedirectUrl = useMemo(
    () => `/login?redirectTo=${encodeURIComponent(currentPathWithQuery)}`,
    [currentPathWithQuery]
  );

  const initialFieldValues = useMemo(
    () =>
      (publicForm?.fields || []).reduce<Record<string, any>>((acc, field) => {
        if (isWebFormCurrentEmployeeDefaultField(field, publicForm?.targetModuleId, publicForm?.accessScope)) {
          if (currentEmployee?.id) {
            acc[field.field_key] = currentEmployee.id;
          }
          return acc;
        }
        if (field.default_value !== undefined && field.default_value !== null) {
          acc[field.field_key] = field.default_value;
        }
        return acc;
      }, {}),
    [currentEmployee?.id, publicForm?.accessScope, publicForm?.fields, publicForm?.targetModuleId]
  );

  useEffect(() => {
    const syncBranding = () => {
      setBranding(readRuntimeBranding() || DEFAULT_BRANDING);
    };
    syncBranding();
    window.addEventListener(BRANDING_APPLIED_EVENT, syncBranding as EventListener);
    return () => {
      window.removeEventListener(BRANDING_APPLIED_EVENT, syncBranding as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const updateMode = () => setIsDarkMode(document.documentElement.classList.contains("dark"));
    updateMode();
    const observer = new MutationObserver(updateMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const storageListener = () => updateMode();
    window.addEventListener("storage", storageListener);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", storageListener);
    };
  }, []);

  useEffect(() => {
    if (!publicForm) return;
    form.resetFields();
    form.setFieldsValue(initialFieldValues);
  }, [form, initialFieldValues, publicForm]);

  useEffect(() => {
    let cancelled = false;
    const loadDynamicOptions = async () => {
      const categories = Array.from(new Set(
        (publicForm?.fields || [])
          .map((field) => {
            const moduleField = buildPublicModuleField(field, publicForm?.targetModuleId);
            return String(moduleField.dynamicOptionsCategory || "").trim();
          })
          .filter(Boolean),
      ));
      if (categories.length === 0) {
        setDynamicFieldOptions({});
        return;
      }
      try {
        const result = await fetchDynamicOptionsMap(supabase, categories);
        if (!cancelled) setDynamicFieldOptions(result);
      } catch {
        if (!cancelled) setDynamicFieldOptions({});
      }
    };
    void loadDynamicOptions();
    return () => {
      cancelled = true;
    };
  }, [publicForm]);

  useEffect(() => {
    let active = true;
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (active) setAuthUser(data.session?.user || null);
    };
    void loadSession();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAuthUser(session?.user || null);
    });
    return () => {
      active = false;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const needsCurrentEmployee = Boolean(
      authUser?.id
      && publicForm?.accessScope === "internal"
      && (publicForm?.fields || []).some((field) =>
        isWebFormCurrentEmployeeDefaultField(field, publicForm?.targetModuleId, publicForm?.accessScope)
      )
    );

    if (!needsCurrentEmployee) {
      setCurrentEmployee(null);
      setCurrentEmployeeLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    setCurrentEmployeeLoaded(false);
    const run = async () => {
      try {
        const { data, error } = await supabase
          .from("employees")
          .select("id, full_name, related_profile_id")
          .eq("related_profile_id", authUser.id)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setCurrentEmployee(data || null);
      } catch (error) {
        console.error("Current employee lookup failed", error);
        if (!cancelled) setCurrentEmployee(null);
      } finally {
        if (!cancelled) setCurrentEmployeeLoaded(true);
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [authUser?.id, publicForm?.accessScope, publicForm?.fields, publicForm?.targetModuleId]);

  useEffect(() => {
    let cancelled = false;

    const loadCompanySettings = async () => {
      const { data } = await supabase
        .rpc("get_public_branding", {
          p_hostname: typeof window !== "undefined" ? window.location.hostname : null,
        })
        .maybeSingle();
      const response = (data || null) as PublicBrandingRpcRow | null;
      return toRecord(response?.company_settings);
    };

    const loadDynamicForm = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase
          .rpc("get_public_web_form", {
            p_slug: requestedSlug,
            p_hostname: typeof window !== "undefined" ? window.location.hostname : null,
          })
          .maybeSingle();

        if (error) throw error;

        const response = (data || null) as PublicWebFormRpcRow | null;

        if (response?.form_id) {
          const webForm = toRecord(response.web_form);
          const config = normalizeWebFormConfig(webForm.config);
          const targetModuleId = String(webForm.target_module_id || "");
          const fields = Array.isArray(response.fields)
            ? response.fields.map((item: unknown, index: number) => normalizeWebFormFieldRecord(item, index, { targetModuleId }))
            : [];

          if (!cancelled) {
            setPublicForm({
              mode: "dynamic",
              slug: String(webForm.route_slug || requestedSlug),
              name: String(webForm.name || config.header_title || "وب فرم"),
              accessScope: (webForm.access_scope || "public") as WebFormAccessScope,
              targetModuleId,
              config,
              fields,
              companySettings: toRecord(response.company_settings),
            });
          }
          return;
        }

        if (requestedSlug === "inquiry") {
          const companySettings = await loadCompanySettings();
          if (!cancelled) setPublicForm(buildLegacyInquiryState(companySettings));
          return;
        }

        if (!cancelled) {
          setPublicForm(null);
          setLoadError("وب فرم موردنظر پیدا نشد یا غیرفعال است.");
        }
      } catch (error: any) {
        if (requestedSlug === "inquiry" && isMissingWebFormSetupError(error)) {
          const companySettings = await loadCompanySettings().catch(() => ({}));
          if (!cancelled) setPublicForm(buildLegacyInquiryState(companySettings));
        } else {
          console.error("Public web form load failed", error);
          if (!cancelled) {
            setPublicForm(null);
            setLoadError("بارگذاری فرم ناموفق بود.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadDynamicForm();

    return () => {
      cancelled = true;
    };
  }, [requestedSlug]);

  const palette = branding.palette || DEFAULT_BRANDING.palette;
  const companySettings = publicForm?.companySettings || {};
  const brandTitle =
    String(companySettings.trade_name || companySettings.company_full_name || companySettings.company_name || "").trim()
    || branding.shortName
    || DEFAULT_BRANDING.shortName;
  const appTitle =
    String(companySettings.company_full_name || companySettings.company_name || "").trim()
    || branding.appTitle
    || DEFAULT_BRANDING.appTitle;
  const headerTitle = publicForm?.config.header_title || publicForm?.name || appTitle;
  const headerSubtitle =
    publicForm?.config.header_subtitle
    || String(companySettings.website || companySettings.email || "").trim()
    || "";
  const contactItems = [
    { key: "website", label: "وب‌سایت", value: String(companySettings.website || "").trim(), href: buildSocialHref("website", companySettings.website) },
    { key: "mobile", label: "موبایل", value: String(companySettings.mobile || "").trim(), href: String(companySettings.mobile || "").trim() ? `tel:${companySettings.mobile}` : undefined },
    { key: "phone", label: "تلفن", value: String(companySettings.phone || "").trim(), href: String(companySettings.phone || "").trim() ? `tel:${companySettings.phone}` : undefined },
    { key: "email", label: "ایمیل", value: String(companySettings.email || "").trim(), href: String(companySettings.email || "").trim() ? `mailto:${companySettings.email}` : undefined },
    { key: "instagram_id", label: "اینستاگرام", value: String(companySettings.instagram_id || "").trim(), href: buildSocialHref("instagram", companySettings.instagram_id) },
    { key: "telegram_id", label: "تلگرام", value: String(companySettings.telegram_id || "").trim(), href: buildSocialHref("telegram", companySettings.telegram_id) },
    { key: "youtube_url", label: "یوتیوب", value: String(companySettings.youtube_url || "").trim(), href: buildSocialHref("youtube", companySettings.youtube_url) },
    { key: "whatsapp_number", label: "واتساپ", value: String(companySettings.whatsapp_number || "").trim(), href: buildSocialHref("whatsapp", companySettings.whatsapp_number) },
    { key: "eitaa_id", label: "ایتا", value: String(companySettings.eitaa_id || "").trim(), href: buildSocialHref("eitaa", companySettings.eitaa_id) },
    { key: "rubika_id", label: "روبیکا", value: String(companySettings.rubika_id || "").trim(), href: buildSocialHref("rubika", companySettings.rubika_id) },
    { key: "bale_id", label: "بله", value: String(companySettings.bale_id || "").trim(), href: buildSocialHref("bale", companySettings.bale_id) },
    { key: "address", label: "نشانی", value: String(companySettings.address || "").trim() },
  ].filter((item) => item.value);

  const visibleFields = useMemo(
    () => (publicForm?.fields || []).filter((field) =>
      !field.is_hidden
      && !(field.field_type === "relation" && publicForm?.accessScope !== "internal")
      && !isWebFormCurrentEmployeeDefaultField(field, publicForm?.targetModuleId, publicForm?.accessScope)
    ),
    [publicForm?.accessScope, publicForm?.fields, publicForm?.targetModuleId]
  );
  const isSlideMode = publicForm?.config.display_mode === "slide";
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const currentSlideField = visibleFields[currentSlideIndex] || null;
  const slideProgressPercent = visibleFields.length > 0 ? Math.round(((currentSlideIndex + 1) / visibleFields.length) * 100) : 0;

  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [publicForm?.slug, visibleFields.length]);

  const surfaceStyle = isDarkMode
    ? {
        backgroundColor: palette.darkSurface,
        borderColor: `${palette.darkBorder}CC`,
        color: "#fff",
      }
    : {
        backgroundColor: "#ffffff",
        borderColor: `${palette.primary}2E`,
        color: "#111827",
      };

  const pageStyle = {
    background: isDarkMode
      ? `linear-gradient(155deg, ${palette.darkBg} 0%, ${palette.darkSurface} 45%, ${palette.secondary} 100%)`
      : `linear-gradient(155deg, ${palette.primary}18 0%, #ffffff 36%, ${palette.secondary}12 100%)`,
  } as const;

  const buildPublicUploadPath = (field: WebFormFieldRecord, file: File) => {
    const extension = String(file.name.split(".").pop() || "").trim().toLowerCase();
    const safeBaseName = String(file.name || "file")
      .replace(/\.[^.]+$/, "")
      .trim()
      .replace(/[^0-9a-zA-Z._\-\u0600-\u06FF]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "file";
    const finalName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBaseName}${extension ? `.${extension}` : ""}`;
    return `record_files/web_forms/${publicForm?.slug || "public"}/${field.field_key}/${finalName}`;
  };

  const uploadPublicAttachment = async (field: WebFormFieldRecord, file: File): Promise<PublicUploadedAsset | null> => {
    try {
      setUploadingFieldKeys((prev) => ({ ...prev, [field.field_key]: true }));
      const filePath = buildPublicUploadPath(field, file);
      await uploadFileWithProgress({
        client: fileStorageClient,
        bucket: FILE_STORAGE_BUCKET,
        path: filePath,
        file,
        label: file.name || field.label,
        detail: field.label,
      });
      const { data: { publicUrl } } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);
      return {
        url: publicUrl,
        name: file.name || "file",
        mimeType: file.type || null,
        fileType: field.field_type === "image" ? "image" : "file",
      };
    } catch (error: any) {
      console.error("Public web form upload failed", error);
      message.error(toFaErrorMessage(error, "آپلود فایل ناموفق بود."));
      return null;
    } finally {
      setUploadingFieldKeys((prev) => ({ ...prev, [field.field_key]: false }));
    }
  };

  const removePublicAttachment = (fieldKey: string, assetUrl: string) => {
    const currentList = normalizePublicFieldValue(
      { field_key: fieldKey, label: "", field_type: "file" } as WebFormFieldRecord,
      form.getFieldValue(fieldKey),
    );
    const nextList = Array.isArray(currentList)
      ? currentList.filter((item) => String((item as any)?.url || "") !== assetUrl)
      : [];
    form.setFieldValue(fieldKey, nextList);
  };

  const getChoiceOptions = (field: WebFormFieldRecord) => {
    const moduleField = buildPublicModuleField(field, publicForm?.targetModuleId);
    const staticOptions = Array.isArray(moduleField.options)
      ? moduleField.options
          .map((option) => {
            const label = String(option?.label || option?.value || "").trim();
            const value = String(option?.value || option?.label || "").trim();
            if (!label || !value) return null;
            return { label, value };
          })
          .filter(Boolean) as PublicChoiceOption[]
      : [];
    const dynamicCategory = String(moduleField.dynamicOptionsCategory || "").trim();
    const dynamicOptions = dynamicCategory ? (dynamicFieldOptions[dynamicCategory] || []) : [];
    return dynamicOptions.length > 0 ? dynamicOptions : staticOptions;
  };

  const renderSlideChoiceField = (field: WebFormFieldRecord, options?: { showHelp?: boolean; showLabel?: boolean }) => {
    const isMultiSelect = field.field_type === "multi_select";
    const choiceOptions = getChoiceOptions(field);
    const currentValue = form.getFieldValue(field.field_key);
    const normalizedValues = isMultiSelect
      ? (Array.isArray(currentValue) ? currentValue.map((item) => String(item)) : [])
      : [String(currentValue ?? "")].filter(Boolean);
    const rules = field.is_required
      ? [{
          validator: async (_: unknown, value: unknown) => {
            if (isMultiSelect) {
              if (Array.isArray(value) && value.length > 0) return;
            } else if (value !== undefined && value !== null && String(value).trim() !== "") {
              return;
            }
            throw new Error(`${field.label} را انتخاب کنید.`);
          },
        }]
      : [];

    return (
      <Form.Item
        key={field.field_key}
        name={field.field_key}
        label={options?.showLabel === false ? undefined : field.label}
        rules={rules}
        extra={options?.showHelp !== false && field.help_text ? (
          <span style={{ color: isDarkMode ? "rgba(255,255,255,0.64)" : "#6b7280" }}>
            {field.help_text}
          </span>
        ) : undefined}
      >
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {choiceOptions.map((option, index) => {
              const isSelected = normalizedValues.includes(String(option.value));
              return (
                <button
                  key={`${field.field_key}_${option.value}_${index}`}
                  type="button"
                  onClick={() => {
                    if (isMultiSelect) {
                      const nextValues = isSelected
                        ? normalizedValues.filter((item) => item !== String(option.value))
                        : [...normalizedValues, String(option.value)];
                      form.setFieldValue(field.field_key, nextValues);
                      return;
                    }
                    form.setFieldValue(field.field_key, option.value);
                  }}
                  className="group relative overflow-hidden rounded-[24px] border px-4 py-4 text-right transition duration-200"
                  style={{
                    borderColor: isSelected
                      ? palette.primary
                      : (isDarkMode ? `${palette.darkBorder}` : `${palette.primary}22`),
                    background: isSelected
                      ? `linear-gradient(135deg, ${palette.primary}18 0%, ${palette.secondary}14 100%)`
                      : (isDarkMode ? `${palette.darkBg}CC` : "#fff"),
                    boxShadow: isSelected ? `0 16px 34px ${palette.primary}22` : "none",
                    color: surfaceStyle.color,
                  }}
                >
                  <div
                    className="absolute inset-y-0 right-0 w-1.5 rounded-r-[24px] transition-opacity"
                    style={{ backgroundColor: palette.primary, opacity: isSelected ? 1 : 0 }}
                  />
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border text-xs font-black"
                      style={{
                        borderColor: isSelected ? palette.primary : (isDarkMode ? `${palette.darkBorder}` : "#d1d5db"),
                        backgroundColor: isSelected ? palette.primary : "transparent",
                        color: isSelected ? "#fff" : surfaceStyle.color,
                      }}
                    >
                      {isSelected ? "✓" : index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold">{option.label}</div>
                      <div
                        className="mt-1 text-xs"
                        style={{ color: isDarkMode ? "rgba(255,255,255,0.56)" : "#6b7280" }}
                      >
                        {isMultiSelect
                          ? (isSelected ? "برای حذف دوباره لمس کنید" : "برای انتخاب لمس کنید")
                          : "برای انتخاب این گزینه لمس کنید"}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {isMultiSelect ? (
            <div className="text-xs" style={{ color: isDarkMode ? "rgba(255,255,255,0.62)" : "#6b7280" }}>
              امکان انتخاب چند گزینه وجود دارد.
            </div>
          ) : null}
        </div>
      </Form.Item>
    );
  };

  const renderSlideTextLikeField = (field: WebFormFieldRecord, options?: { showHelp?: boolean; showLabel?: boolean }) => {
    const rules = field.is_required
      ? [{
          required: true,
          message: `${field.label} را ${field.field_type === "long_text" ? "تکمیل" : "وارد"} کنید.`,
        }]
      : [];
    const sharedClassName = `w-full rounded-[24px] border-0 bg-white/90 px-5 text-[16px] font-medium shadow-[0_18px_48px_rgba(15,23,42,0.08)] outline-none transition focus:shadow-[0_22px_54px_rgba(15,23,42,0.12)] ${getSlideFieldHeightClass(field)}`;
    const placeholder = field.placeholder || field.label;

    let control: JSX.Element;
    if (field.field_type === "long_text") {
      control = (
        <Input.TextArea
          rows={6}
          className="webform-slide-textarea"
          placeholder={placeholder}
          autoSize={{ minRows: 6, maxRows: 10 }}
          style={{
            borderRadius: 24,
            padding: "18px 20px",
            fontSize: 16,
            lineHeight: 2,
            background: isDarkMode ? `${palette.darkBg}D9` : "rgba(255,255,255,0.92)",
            color: surfaceStyle.color,
            boxShadow: "0 18px 48px rgba(15,23,42,0.08)",
            border: "none",
          }}
        />
      );
    } else if (field.field_type === "date") {
      control = <PersianDatePicker type="DATE" placeholder={placeholder} className="webform-slide-date-trigger" />;
    } else if (field.field_type === "time") {
      control = <PersianDatePicker type="TIME" placeholder={placeholder} className="webform-slide-date-trigger" />;
    } else if (field.field_type === "datetime") {
      control = <PersianDatePicker type="DATETIME" placeholder={placeholder} className="webform-slide-date-trigger" />;
    } else {
      control = (
        <input
          type={field.field_type === "phone" ? "tel" : field.field_type === "number" ? "number" : "text"}
          inputMode={field.field_type === "number" ? "decimal" : field.field_type === "phone" ? "tel" : "text"}
          className={sharedClassName}
          placeholder={placeholder}
          style={{
            background: isDarkMode ? `${palette.darkBg}D9` : "rgba(255,255,255,0.92)",
            color: surfaceStyle.color,
          }}
        />
      );
    }

    return (
      <Form.Item
        key={field.field_key}
        name={field.field_key}
        label={options?.showLabel === false ? undefined : field.label}
        rules={rules}
        extra={options?.showHelp !== false && field.help_text ? (
          <span style={{ color: isDarkMode ? "rgba(255,255,255,0.64)" : "#6b7280" }}>
            {field.help_text}
          </span>
        ) : undefined}
      >
        {control}
      </Form.Item>
    );
  };

  const renderAttachmentField = (field: WebFormFieldRecord, options?: { showHelp?: boolean; showLabel?: boolean }) => {
    const currentAssets = normalizePublicFieldValue(field, form.getFieldValue(field.field_key));
    const assetList = Array.isArray(currentAssets) ? currentAssets as PublicUploadedAsset[] : [];
    const isUploading = uploadingFieldKeys[field.field_key] === true;
    const accept = field.field_type === "image" ? "image/*" : undefined;
    const rules = field.is_required
      ? [{
          validator: async (_: unknown, value: unknown) => {
            const normalized = normalizePublicFieldValue(field, value);
            if (Array.isArray(normalized) && normalized.length > 0) return;
            throw new Error(`${field.label} را وارد کنید.`);
          },
        }]
      : [];

    return (
      <Form.Item
        key={field.field_key}
        name={field.field_key}
        label={options?.showLabel === false ? undefined : field.label}
        rules={rules}
        extra={options?.showHelp !== false && field.help_text ? (
          <span style={{ color: isDarkMode ? "rgba(255,255,255,0.64)" : "#6b7280" }}>
            {field.help_text}
          </span>
        ) : undefined}
      >
        <div className={`space-y-3 ${isSlideMode ? "webform-slide-upload" : ""}`}>
          <Upload
            multiple
            accept={accept}
            showUploadList={false}
            beforeUpload={(file) => {
              void (async () => {
                const uploaded = await uploadPublicAttachment(field, file);
                if (!uploaded) return;
                const nextList = [...assetList, uploaded];
                form.setFieldValue(field.field_key, nextList);
              })();
              return false;
            }}
          >
            {isSlideMode ? (
              <button
                type="button"
                className="w-full rounded-[28px] border border-dashed px-5 py-7 text-right transition"
                style={{
                  borderColor: isDarkMode ? `${palette.darkBorder}` : `${palette.primary}44`,
                  background: isDarkMode ? `${palette.darkBg}CC` : `linear-gradient(135deg, ${palette.primary}10 0%, #fff 100%)`,
                  color: surfaceStyle.color,
                }}
              >
                <div className="mb-2 text-lg font-black">
                  {field.field_type === "image" ? "آپلود تصویر" : "آپلود فایل"}
                </div>
                <div className="text-sm" style={{ color: isDarkMode ? "rgba(255,255,255,0.65)" : "#6b7280" }}>
                  برای انتخاب فایل لمس کنید. می‌توانید چند فایل ثبت کنید.
                </div>
                {isUploading ? (
                  <div className="mt-3 text-sm font-semibold" style={{ color: palette.primary }}>
                    در حال آپلود...
                  </div>
                ) : null}
              </button>
            ) : (
              <Button loading={isUploading}>
                {field.field_type === "image" ? "افزودن تصویر" : "افزودن فایل"}
              </Button>
            )}
          </Upload>

          {assetList.length > 0 ? (
            <div className={`space-y-2 ${isSlideMode && field.field_type === "image" ? "grid gap-3 md:grid-cols-2" : ""}`}>
              {assetList.map((asset) => (
                <div
                  key={asset.url}
                  className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2"
                  style={{
                    borderColor: isDarkMode ? `${palette.darkBorder}` : "#e5e7eb",
                    background: isSlideMode ? (isDarkMode ? `${palette.darkBg}C7` : "#fff") : undefined,
                    padding: isSlideMode ? "16px" : undefined,
                  }}
                >
                  {isSlideMode && field.field_type === "image" ? (
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="h-20 w-20 rounded-2xl object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" style={{ color: surfaceStyle.color }}>
                      {asset.name}
                    </div>
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs"
                      style={{ color: palette.primary }}
                    >
                      مشاهده فایل
                    </a>
                  </div>
                  <Button type="text" danger onClick={() => removePublicAttachment(field.field_key, asset.url)}>
                    حذف
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Form.Item>
    );
  };

  const renderField = (field: WebFormFieldRecord, options?: { showHelp?: boolean; showLabel?: boolean }) => {
    if (field.is_hidden) return null;
    if (field.field_type === "relation" && publicForm?.accessScope !== "internal") return null;
    if (field.field_type === "image" || field.field_type === "file") {
      return renderAttachmentField(field, options);
    }
    if (isSlideMode && ["select", "multi_select"].includes(field.field_type)) {
      return renderSlideChoiceField(field, options);
    }
    if (isSlideMode && ["text", "phone", "number", "long_text", "date", "time", "datetime"].includes(field.field_type)) {
      return renderSlideTextLikeField(field, options);
    }

    const moduleField = buildPublicModuleField(field, publicForm?.targetModuleId);
    const rules = field.is_required
      ? [{
          required: true,
          message: field.field_type === "checkbox" ? `${field.label} را تعیین کنید.` : `${field.label} را وارد کنید.`,
        }]
      : [];

    return (
      <Form.Item
        key={field.field_key}
        name={field.field_key}
        label={options?.showLabel === false ? undefined : field.label}
        rules={rules}
        extra={options?.showHelp !== false && field.help_text ? (
          <span style={{ color: isDarkMode ? "rgba(255,255,255,0.64)" : "#6b7280" }}>
            {field.help_text}
          </span>
        ) : undefined}
      >
        <SmartFieldRenderer
          field={moduleField}
          value={form.getFieldValue(field.field_key)}
          onChange={(nextValue) => form.setFieldValue(field.field_key, nextValue)}
          forceEditMode
          compactMode
          moduleId={publicForm?.targetModuleId || undefined}
          allValues={watchedFormValues}
          overlayZIndexBase={1600}
        />
      </Form.Item>
    );
  };

  const buildSubmissionPayload = (values: Record<string, any>) =>
    (publicForm?.fields || []).reduce<Record<string, any>>((acc, field) => {
      if (isWebFormCurrentEmployeeDefaultField(field, publicForm?.targetModuleId, publicForm?.accessScope)) {
        if (currentEmployee?.id) {
          acc[field.field_key] = currentEmployee.id;
        }
        return acc;
      }
      const value = normalizePublicFieldValue(field, values[field.field_key]);
      if (value !== undefined) {
        acc[field.field_key] = value;
      } else if (field.default_value !== undefined && field.default_value !== null) {
        acc[field.field_key] = normalizePublicFieldValue(field, field.default_value);
      }
      return acc;
    }, {});

  const submitLegacyInquiry = async (values: Record<string, any>) => {
    const payload: Record<string, unknown> = {
      prefix: values.prefix || null,
      first_name: String(values.first_name || "").trim(),
      last_name: String(values.last_name || "").trim(),
      business_name: String(values.business_name || "").trim() || null,
      mobile_1: String(values.phone || "").trim() || null,
      lead_source: "web_form",
    };

    if (String(values.description || "").trim()) {
      payload.notes = String(values.description || "").trim();
    }

    let insertedRecord: Record<string, any> | null = null;
    let { data: inserted, error } = await supabase.from("customers").insert(payload).select("*").single();
    insertedRecord = inserted || null;

    if (error && error.code === "PGRST204") {
      const fallbackPayload = { ...payload } as Record<string, unknown>;
      const errText = String(error.message || "").toLowerCase();
      if (errText.includes("notes")) delete fallbackPayload.notes;
      if (errText.includes("lead_source")) delete fallbackPayload.lead_source;

      ({ data: inserted, error } = await supabase.from("customers").insert(fallbackPayload).select("*").single());
      insertedRecord = inserted || null;
    }

    if (error) throw error;

    try {
      await runWorkflowsForEvent({
        moduleId: "customers",
        event: "create",
        currentRecord: insertedRecord || (payload as Record<string, any>),
      });
    } catch (workflowError) {
      console.warn("Legacy inquiry workflow execution failed", workflowError);
    }
  };

  const handleSubmit = async (values: Record<string, any>) => {
    if (!publicForm) return;

    if (publicForm.accessScope === "internal" && !authUser) {
      navigate(loginRedirectUrl);
      return;
    }

    const needsCurrentEmployee = (publicForm.fields || []).some((field) =>
      isWebFormCurrentEmployeeDefaultField(field, publicForm.targetModuleId, publicForm.accessScope)
    );
    if (needsCurrentEmployee && !currentEmployeeLoaded) {
      message.error("در حال بررسی کارمند مرتبط با حساب کاربری هستیم. چند لحظه بعد دوباره تلاش کنید.");
      return;
    }
    if (needsCurrentEmployee && !currentEmployee?.id) {
      message.error("حساب کاربری شما به هیچ کارمندی وصل نیست. ابتدا کاربر را در ماژول کارکنان به کارمند مرتبط کنید.");
      return;
    }

    setSubmitting(true);
    try {
      if (publicForm.mode === "legacy") {
        await submitLegacyInquiry(values);
        message.success(publicForm.config.success_message || "درخواست شما ثبت شد.");
        form.resetFields();
        form.setFieldsValue(initialFieldValues);
        return;
      }

      const submissionPayload = buildSubmissionPayload(values);
      const { data, error } = await supabase.rpc("submit_public_web_form", {
        p_slug: publicForm.slug,
        p_submission: submissionPayload,
        p_meta: {
          pathname: typeof window !== "undefined" ? window.location.pathname : null,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          theme_mode: isDarkMode ? "dark" : "light",
        },
        p_hostname: typeof window !== "undefined" ? window.location.hostname : null,
      });

      if (error) throw error;

      const result = toRecord(data);
      const targetModuleId = String(result.target_module_id || publicForm.targetModuleId || "").trim();
      const targetRecord = toRecord(result.target_record);
      const recordAction = String(result.record_action || "created").trim();
      if (targetModuleId && Object.keys(targetRecord).length > 0 && ["created", "updated"].includes(recordAction)) {
        try {
          await runWorkflowsForEvent({
            moduleId: targetModuleId,
            event: recordAction === "updated" ? "upsert" : "create",
            currentRecord: targetRecord,
          });
        } catch (workflowError) {
          console.warn("Public web form workflow execution failed", workflowError);
        }
      }

      message.success(String(result.success_message || publicForm.config.success_message || "درخواست شما ثبت شد."));
      form.resetFields();
      form.setFieldsValue(initialFieldValues);

      const redirectUrl = String(publicForm.config.success_redirect_url || "").trim();
      if (redirectUrl) {
        window.setTimeout(() => {
          window.location.assign(redirectUrl);
        }, 1000);
      }
    } catch (error: any) {
      if (String(error?.message || "").includes("WEB_FORM_AUTH_REQUIRED")) {
        navigate(loginRedirectUrl);
      } else {
        const debugInfo = {
          message: String(error?.message || ""),
          details: String(error?.details || ""),
          hint: String(error?.hint || ""),
          code: String(error?.code || ""),
        };
        console.error("Public web form submit failed", debugInfo, {
          slug: publicForm.slug,
          targetModuleId: publicForm.targetModuleId,
        });
        message.error(debugInfo.message || "ثبت فرم ناموفق بود.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goToPreviousSlide = () => {
    if (!publicForm?.config.slide_allow_back) return;
    setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
  };

  const goToNextSlide = async () => {
    if (!currentSlideField) return;
    try {
      await form.validateFields([currentSlideField.field_key]);
      if (currentSlideIndex >= visibleFields.length - 1) {
        form.submit();
        return;
      }
      setCurrentSlideIndex((prev) => Math.min(visibleFields.length - 1, prev + 1));
    } catch {
      // Validation feedback is handled by Ant Form.
    }
  };

  const handleFormValuesChange = (changedValues: Record<string, any>) => {
    if (!isSlideMode || !publicForm?.config.slide_auto_advance || !currentSlideField) return;
    if (!Object.prototype.hasOwnProperty.call(changedValues, currentSlideField.field_key)) return;
    if (!["select", "checkbox"].includes(currentSlideField.field_type)) return;
    window.setTimeout(() => {
      void goToNextSlide();
    }, 140);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={pageStyle}>
        <Spin size="large" />
      </div>
    );
  }

  if (!publicForm) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={pageStyle}>
        <Alert type="error" showIcon message={loadError || "فرم عمومی یافت نشد."} />
      </div>
    );
  }

  const requiresLogin = publicForm.accessScope === "internal" && !authUser;

  return (
    <div className="min-h-screen px-4 py-6 md:px-6 md:py-10" style={pageStyle}>
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-[32px] border shadow-[0_24px_80px_rgba(15,23,42,0.16)]" style={surfaceStyle}>
          <div
            className="relative overflow-hidden px-6 py-8 md:px-10 md:py-10"
            style={{
              background: `linear-gradient(145deg, ${palette.secondary} 0%, ${palette.primary} 100%)`,
              color: "#fff",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.18), transparent 30%), radial-gradient(circle at 85% 0%, rgba(255,255,255,0.14), transparent 26%)",
              }}
            />
            <div className="relative flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-2xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  <span className="h-2 w-2 rounded-full bg-white" />
                  {brandTitle}
                </div>
                <Title level={1} className="!mb-3 !text-white">
                  {headerTitle}
                </Title>
                {headerSubtitle ? (
                  <Paragraph className="!mb-0 !text-white/85">{headerSubtitle}</Paragraph>
                ) : null}
              </div>

              {companySettings.logo_url ? (
                <div className="rounded-3xl bg-white/10 p-3 backdrop-blur">
                  <img src={companySettings.logo_url} alt={appTitle} className="h-16 w-16 rounded-2xl object-contain md:h-20 md:w-20" />
                </div>
              ) : null}
            </div>
          </div>

          <div className="px-6 py-8 md:px-10">
            {requiresLogin ? (
              <Card
                bordered={false}
                className="rounded-[28px]"
                style={{
                  background: isDarkMode ? `${palette.darkBg}CC` : `${palette.primary}10`,
                  color: surfaceStyle.color,
                }}
              >
                <Space direction="vertical" size="middle" className="w-full">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                      <LockOutlined style={{ color: isDarkMode ? "#fff" : palette.primary, fontSize: 20 }} />
                    </div>
                    <div>
                      <Title level={4} className="!mb-1" style={{ color: surfaceStyle.color }}>
                        این فرم داخلی است
                      </Title>
                      <Paragraph className="!mb-0" style={{ color: isDarkMode ? "rgba(255,255,255,0.75)" : "#4b5563" }}>
                        برای تکمیل این فرم باید وارد حساب کاربری شوید. بعد از ورود دوباره مستقیم به همین صفحه برمی‌گردید.
                      </Paragraph>
                    </div>
                  </div>
                  <Button type="primary" icon={<LoginOutlined />} onClick={() => navigate(loginRedirectUrl)} style={{ backgroundColor: palette.primary }}>
                    ورود و ادامه
                  </Button>
                </Space>
              </Card>
            ) : (
              <Form form={form} layout="vertical" onFinish={handleSubmit} onValuesChange={handleFormValuesChange}>
                {isSlideMode && currentSlideField ? (
                  <div className="space-y-6">
                    {publicForm.config.slide_show_progress !== false ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span style={{ color: isDarkMode ? "rgba(255,255,255,0.72)" : "#6b7280" }}>
                            مرحله {currentSlideIndex + 1} از {visibleFields.length}
                          </span>
                          <span className="font-semibold" style={{ color: surfaceStyle.color }}>
                            {slideProgressPercent}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: isDarkMode ? `${palette.darkBorder}88` : "#e5e7eb" }}>
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${slideProgressPercent}%`,
                              background: `linear-gradient(90deg, ${palette.secondary} 0%, ${palette.primary} 100%)`,
                            }}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div
                      key={currentSlideField.field_key}
                      className="rounded-[28px] border p-5 md:p-7"
                      style={{
                        borderColor: isDarkMode ? `${palette.darkBorder}` : `${palette.primary}22`,
                        background: isDarkMode ? `${palette.darkBg}BB` : `${palette.primary}08`,
                      }}
                    >
                      <div className="mb-5">
                        <Title level={3} className="!mb-2" style={{ color: surfaceStyle.color }}>
                          {currentSlideField.label}
                        </Title>
                        {currentSlideField.help_text ? (
                          <Paragraph className="!mb-0" style={{ color: isDarkMode ? "rgba(255,255,255,0.72)" : "#6b7280" }}>
                            {currentSlideField.help_text}
                          </Paragraph>
                        ) : null}
                      </div>

                      {renderField(currentSlideField, { showHelp: false, showLabel: false })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button
                        icon={<ArrowRightOutlined />}
                        onClick={goToPreviousSlide}
                        disabled={currentSlideIndex === 0 || publicForm.config.slide_allow_back === false}
                        className="h-11 rounded-2xl px-5"
                      >
                        مرحله قبل
                      </Button>

                      <div className="flex items-center gap-3">
                        <div className="text-sm" style={{ color: isDarkMode ? "rgba(255,255,255,0.68)" : "#6b7280" }}>
                          {currentSlideIndex < visibleFields.length - 1 ? "پس از تکمیل این سؤال به مرحله بعد می‌روید." : "پس از این مرحله فرم ثبت می‌شود."}
                        </div>
                        <Button
                          type="primary"
                          onClick={() => void goToNextSlide()}
                          loading={submitting}
                          icon={currentSlideIndex < visibleFields.length - 1 ? <ArrowLeftOutlined /> : <CheckCircleOutlined />}
                          className="h-12 rounded-2xl px-8 text-base font-bold"
                          style={{ backgroundColor: palette.primary, boxShadow: `0 16px 34px ${palette.primary}33` }}
                        >
                          {currentSlideIndex < visibleFields.length - 1 ? "ادامه" : (publicForm.config.submit_label || "ثبت درخواست")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      {visibleFields.map((field) => (
                        <div key={field.field_key} className={isWideField(field) ? "md:col-span-2" : ""}>
                          {renderField(field)}
                        </div>
                      ))}
                    </div>

                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={submitting}
                      className="mt-2 h-12 rounded-2xl px-8 text-base font-bold"
                      style={{ backgroundColor: palette.primary, boxShadow: `0 16px 34px ${palette.primary}33` }}
                    >
                      {publicForm.config.submit_label || "ثبت درخواست"}
                    </Button>
                  </>
                )}
              </Form>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-0 shadow-[0_18px_48px_rgba(15,23,42,0.10)]" style={surfaceStyle}>
            <Text type="secondary">سازمان</Text>
            <Title level={4} className="!mt-2 !mb-3" style={{ color: surfaceStyle.color }}>
              {appTitle}
            </Title>
            {String(companySettings.address || "").trim() ? (
              <Paragraph className="!mb-0" style={{ color: isDarkMode ? "rgba(255,255,255,0.75)" : "#6b7280" }}>
                {companySettings.address}
              </Paragraph>
            ) : null}
          </Card>

          {contactItems.length > 0 ? (
            <Card className="rounded-[28px] border-0 shadow-[0_18px_48px_rgba(15,23,42,0.10)]" style={surfaceStyle}>
              <Title level={5} className="!mb-4" style={{ color: surfaceStyle.color }}>
                اطلاعات تماس
              </Title>
              <div className="space-y-3">
                {contactItems.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    target={item.href?.startsWith("http") ? "_blank" : undefined}
                    rel={item.href?.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="block rounded-2xl border px-4 py-3 transition hover:-translate-y-[1px] hover:shadow-sm"
                    style={{
                      borderColor: isDarkMode ? `${palette.darkBorder}` : `${palette.primary}22`,
                      color: surfaceStyle.color,
                      backgroundColor: isDarkMode ? `${palette.darkBg}AA` : "#fff",
                    }}
                  >
                    <div className="text-xs" style={{ color: isDarkMode ? "rgba(255,255,255,0.6)" : "#9ca3af" }}>
                      {item.label}
                    </div>
                    <div className="mt-1 font-medium">{item.value}</div>
                  </a>
                ))}
              </div>
            </Card>
          ) : null}

        </div>
      </div>
    </div>
  );
};

export default InquiryForm;
