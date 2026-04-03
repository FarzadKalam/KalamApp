import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Checkbox, Form, Input, Select, Spin, Typography } from "antd";
import { LockOutlined, LoginOutlined } from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { runWorkflowsForEvent } from "../utils/workflowRuntime";
import { BRANDING_APPLIED_EVENT, DEFAULT_BRANDING } from "../theme/brandTheme";
import { readRuntimeBranding } from "../utils/brandingRuntime";
import { normalizeWebFormConfig, normalizeWebFormFieldRecord, type WebFormAccessScope, type WebFormFieldRecord } from "../utils/webForms";

const { Paragraph, Text, Title } = Typography;

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

const LEGACY_PREFIX_OPTIONS = [
  { label: "آقای", value: "آقای" },
  { label: "خانم", value: "خانم" },
  { label: "دکتر", value: "دکتر" },
  { label: "مهندس", value: "مهندس" },
];

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
        if (field.default_value !== undefined && field.default_value !== null) {
          acc[field.field_key] = field.default_value;
        }
        return acc;
      }, {}),
    [publicForm?.fields]
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
    form.resetFields();
    form.setFieldsValue(initialFieldValues);
  }, [form, initialFieldValues]);

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

    const loadCompanySettings = async () => {
      const { data } = await supabase
        .rpc("get_public_branding", {
          p_hostname: typeof window !== "undefined" ? window.location.hostname : null,
        })
        .maybeSingle();
      return toRecord(data?.company_settings);
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

        if (data?.form_id) {
          const webForm = toRecord(data.web_form);
          const config = normalizeWebFormConfig(webForm.config);
          const fields = Array.isArray(data.fields)
            ? data.fields.map((item: unknown, index: number) => normalizeWebFormFieldRecord(item, index))
            : [];

          if (!cancelled) {
            setPublicForm({
              mode: "dynamic",
              slug: String(webForm.route_slug || requestedSlug),
              name: String(webForm.name || config.header_title || "وب فرم"),
              accessScope: (webForm.access_scope || "public") as WebFormAccessScope,
              targetModuleId: String(webForm.target_module_id || ""),
              config,
              fields,
              companySettings: toRecord(data.company_settings),
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

  const renderField = (field: WebFormFieldRecord) => {
    if (field.is_hidden) return null;

    const rules = field.is_required ? [{ required: true, message: `${field.label} را وارد کنید.` }] : [];
    const placeholder = field.label;

    if (field.field_type === "long_text") {
      return (
        <Form.Item key={field.field_key} name={field.field_key} label={field.label} rules={rules}>
          <Input.TextArea rows={4} placeholder={placeholder} />
        </Form.Item>
      );
    }

    if (field.field_type === "select") {
      const options = Array.isArray(field.config?.select_options) ? field.config.select_options : [];
      return (
        <Form.Item key={field.field_key} name={field.field_key} label={field.label} rules={rules}>
          <Select allowClear={!field.is_required} showSearch optionFilterProp="label" placeholder={placeholder} options={options} />
        </Form.Item>
      );
    }

    if (field.field_type === "checkbox") {
      return (
        <Form.Item key={field.field_key} name={field.field_key} valuePropName="checked">
          <Checkbox>{field.label}</Checkbox>
        </Form.Item>
      );
    }

    const inputType =
      field.field_type === "number"
        ? "number"
        : field.field_type === "date"
          ? "date"
          : field.field_type === "datetime"
            ? "datetime-local"
            : field.field_type === "phone"
              ? "tel"
              : "text";

    return (
      <Form.Item key={field.field_key} name={field.field_key} label={field.label} rules={rules}>
        <Input type={inputType} placeholder={placeholder} />
      </Form.Item>
    );
  };

  const buildSubmissionPayload = (values: Record<string, any>) =>
    (publicForm?.fields || []).reduce<Record<string, any>>((acc, field) => {
      const value = values[field.field_key];
      if (value !== undefined) {
        acc[field.field_key] = value;
      } else if (field.default_value !== undefined && field.default_value !== null) {
        acc[field.field_key] = field.default_value;
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
      if (targetModuleId && Object.keys(targetRecord).length > 0) {
        try {
          await runWorkflowsForEvent({
            moduleId: targetModuleId,
            event: "create",
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
        console.error("Public web form submit failed", error);
        message.error("ثبت فرم ناموفق بود.");
      }
    } finally {
      setSubmitting(false);
    }
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
              <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <div className="grid gap-3 md:grid-cols-2">
                  {(publicForm.fields || []).map((field) => (
                    <div key={field.field_key} className={field.field_type === "long_text" || field.field_type === "checkbox" ? "md:col-span-2" : ""}>
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
