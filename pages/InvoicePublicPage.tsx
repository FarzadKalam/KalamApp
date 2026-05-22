import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Col,
  Divider,
  Input,
  Row,
  Spin,
  Steps,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { DEFAULT_BRANDING, type BrandingConfig } from '../theme/brandTheme';
import { normalizePublicAssetUrl } from '../utils/assetUrl';
import { supabase } from '../supabaseClient';

const anonClient = supabase;

const { Text, Title, Paragraph } = Typography;

// ─── helpers ────────────────────────────────────────────────────────────────

const toJalali = (value: string | null | undefined): string => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const obj = new DateObject({ date: d, calendar: gregorian, locale: gregorian_en });
    return obj.convert(persian, persian_fa).format('YYYY/MM/DD');
  } catch {
    return String(value);
  }
};

const toJalaliDateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const obj = new DateObject({ date: d, calendar: gregorian, locale: gregorian_en });
    return obj.convert(persian, persian_fa).format('YYYY/MM/DD HH:mm');
  } catch {
    return String(value);
  }
};

const formatPrice = (value: number | null | undefined) => {
  if (value == null || isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('fa-IR') + ' ریال';
};

const formatNumber = (value: number | null | undefined) => {
  if (value == null || isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('fa-IR');
};

const normalizePhone = (raw: string): string => {
  let digits = String(raw || '').replace(/[^\d۰-۹]/g, '');
  digits = digits.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('98') && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
  return digits;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  created:   { label: 'ایجاد شده', color: 'blue' },
  proforma:  { label: 'پیش فاکتور', color: 'orange' },
  confirmed: { label: 'تایید شده', color: 'cyan' },
  final:     { label: 'فاکتور نهایی', color: 'green' },
  prepayment:{ label: 'پیش پرداخت', color: 'gold' },
  settled:   { label: 'تسویه شده', color: 'purple' },
  canceled:  { label: 'لغو شده', color: 'red' },
  completed: { label: 'تکمیل شده', color: 'default' },
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: 'نقد',
  transfer: 'انتقال بانکی',
  cheque: 'چک',
  pos: 'کارتخوان',
  online: 'پرداخت آنلاین',
  barter: 'تهاتر',
  other: 'سایر',
};

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: 'در انتظار', color: 'orange' },
  confirmed: { label: 'تایید شده', color: 'green' },
  rejected:  { label: 'رد شده', color: 'red' },
  settled:   { label: 'تسویه شده', color: 'purple' },
};

const OTP_RESEND_SECONDS = 90;

// ─── types ──────────────────────────────────────────────────────────────────

type InvoiceData = {
  invoice: Record<string, any>;
  items: Record<string, any>[];
  payments: Record<string, any>[];
  notes: PublicNote[];
  branding: {
    branding_settings?: Record<string, any>;
    company_settings?: Record<string, any>;
  };
  online_config: OnlineConfig;
  org_id: string;
};

type OnlineConfig = {
  enabled?: boolean;
  showItemsTable?: boolean;
  showItemNotes?: boolean;
  showItemDimensions?: boolean;
  showItemDates?: boolean;
  showDiscount?: boolean;
  showVat?: boolean;
  showPaymentsTable?: boolean;
  confirmationEnabled?: boolean;
  messagingEnabled?: boolean;
  visibleFields?: { key: string; visible: boolean }[];
};

type PublicNote = {
  id: string;
  content: string;
  author_name: string;
  created_at: string;
  reply_to: string | null;
  metadata?: Record<string, any>;
};

// ─── field label helpers ─────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  name: 'عنوان فاکتور',
  invoice_date: 'تاریخ',
  status: 'وضعیت',
  customer_id: 'نام مشتری',
  supplier_id: 'نام تامین‌کننده',
  description: 'توضیحات',
  sale_source: 'منبع فروش',
  province: 'استان',
  city: 'شهر',
  postal_code: 'کد پستی',
  address: 'آدرس',
  total_invoice_amount: 'مبلغ کل فاکتور',
  total_received_amount: 'مبلغ دریافت شده',
  remaining_balance: 'مانده حساب',
};

const getFieldLabel = (key: string) => FIELD_LABELS[key] || key;

// ─── component ───────────────────────────────────────────────────────────────

const InvoicePublicPage = () => {
  const { code } = useParams<{ code: string }>();
  const { message: antMessage } = App.useApp();

  const moduleParam = new URLSearchParams(window.location.search).get('t') || 'invoices';
  const moduleId = moduleParam === 'p' ? 'purchase_invoices' : 'invoices';
  const isSales = moduleId === 'invoices';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InvoiceData | null>(null);
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);

  // confirm flow
  const [phoneOptions, setPhoneOptions] = useState<{ label: string; value: string; phone: string }[]>([]);
  const [selectedPhoneKey, setSelectedPhoneKey] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState<'idle' | 'select_phone' | 'enter_otp' | 'confirmed'>('idle');
  const [otpValue, setOtpValue] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // messaging
  const [messageText, setMessageText] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [notes, setNotes] = useState<PublicNote[]>([]);

  // ── load invoice ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!code) { setError('کد فاکتور نامعتبر است.'); setLoading(false); return; }

    anonClient.rpc('get_public_invoice', { p_system_code: code, p_module: moduleId })
      .then(({ data: result, error: rpcErr }) => {
        if (rpcErr || !result) { setError('خطا در بارگذاری فاکتور.'); setLoading(false); return; }
        if (result.error === 'not_found') { setError('فاکتور پیدا نشد.'); setLoading(false); return; }

        const invData = result as InvoiceData;
        setData(invData);
        setNotes(invData.notes || []);

        // apply branding
        const bs = invData.branding?.branding_settings as Record<string, any> | undefined;
        if (bs) {
          const merged: BrandingConfig = {
            ...DEFAULT_BRANDING,
            brandName: String(bs.brand_name || DEFAULT_BRANDING.brandName),
            shortName: String(bs.short_name || DEFAULT_BRANDING.shortName),
            logoUrl: String(bs.logo_url || '').trim() || null,
          };
          setBranding(merged);
          if (bs.primary_color) {
            document.documentElement.style.setProperty('--color-primary', bs.primary_color);
          }
        }

        // extract phone options from customer/supplier (names come from DB join — no UUIDs shown)
        const inv = invData.invoice;
        const phoneCandidates: { label: string; value: string; phone: string }[] = [];

        const checkPhone = (raw: string | null | undefined, label: string, key: string) => {
          const n = normalizePhone(String(raw || ''));
          if (/^09\d{9}$/.test(n) && !phoneCandidates.find((p) => p.phone === n)) {
            phoneCandidates.push({ label, value: key, phone: n });
          }
        };

        if (isSales) {
          checkPhone(inv.customer_mobile, 'موبایل اصلی', 'customer_mobile');
          checkPhone(inv.customer_mobile2, 'موبایل دوم', 'customer_mobile2');
          checkPhone(inv.customer_assistant_mobile, 'دستیار', 'customer_assistant_mobile');
        } else {
          checkPhone(inv.supplier_mobile, 'موبایل اصلی', 'supplier_mobile');
          checkPhone(inv.supplier_mobile2, 'موبایل دوم', 'supplier_mobile2');
        }

        setPhoneOptions(phoneCandidates);

        // if invoice already confirmed
        const confirmedAt = isSales ? inv.customer_confirmed_at : inv.supplier_confirmed_at;
        if (confirmedAt) setConfirmStep('confirmed');

        setLoading(false);
      })
      .catch(() => { setError('خطا در بارگذاری. لطفاً صفحه را رفرش کنید.'); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, moduleId]);

  // ── countdown timer ────────────────────────────────────────────────────────

  const startCountdown = () => {
    setResendCountdown(OTP_RESEND_SECONDS);
    if (resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) { clearInterval(resendTimer.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (resendTimer.current) clearInterval(resendTimer.current); }, []);

  // ── send OTP ───────────────────────────────────────────────────────────────

  const handleSendOtp = async () => {
    if (!selectedPhoneKey || !data) return;
    const phoneObj = phoneOptions.find((p) => p.value === selectedPhoneKey);
    if (!phoneObj) return;

    setOtpSending(true);
    setOtpError(null);

    try {
      const res = await anonClient.functions.invoke('invoice-otp', {
        body: { system_code: code, module: moduleId, phone: phoneObj.phone },
      });

      if (res.error || res.data?.error) {
        const msg = res.data?.message || 'ارسال کد تایید ناموفق بود.';
        setOtpError(msg);
      } else {
        setConfirmStep('enter_otp');
        startCountdown();
        antMessage.success('کد تایید ارسال شد.');
      }
    } catch {
      setOtpError('خطا در ارسال کد. دوباره امتحان کنید.');
    } finally {
      setOtpSending(false);
    }
  };

  // ── verify OTP ─────────────────────────────────────────────────────────────

  const handleVerifyOtp = async () => {
    if (!data || !selectedPhoneKey) return;
    const phoneObj = phoneOptions.find((p) => p.value === selectedPhoneKey);
    if (!phoneObj) return;

    const digits = String(otpValue).replace(/[^\d۰-۹]/g, '')
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

    if (digits.length < 4) { setOtpError('کد تایید را کامل وارد کنید.'); return; }

    setOtpVerifying(true);
    setOtpError(null);

    const inv = data.invoice;
    const confirmerName = isSales
      ? String(inv.customer_name || 'مشتری')
      : String(inv.supplier_name || 'تامین‌کننده');

    const { data: result, error: rpcErr } = await anonClient.rpc('verify_invoice_confirm_otp', {
      p_system_code: code,
      p_module: moduleId,
      p_phone: phoneObj.phone,
      p_otp_code: digits,
      p_confirmer_name: confirmerName,
    });

    setOtpVerifying(false);

    if (rpcErr || result?.error) {
      const errMap: Record<string, string> = {
        otp_invalid: 'کد تایید اشتباه است.',
        otp_expired: 'کد تایید منقضی شده است. دوباره درخواست دهید.',
        otp_not_sent: 'ابتدا کد تایید را درخواست دهید.',
        invalid_status: 'وضعیت فاکتور امکان تایید را نمی‌دهد.',
      };
      setOtpError(errMap[result?.error] || 'خطا در تایید کد.');
      return;
    }

    // success — update local state
    setConfirmStep('confirmed');
    setData((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      return {
        ...prev,
        invoice: {
          ...prev.invoice,
          status: 'confirmed',
          customer_confirmed_at: isSales ? now : prev.invoice.customer_confirmed_at,
          supplier_confirmed_at: !isSales ? now : prev.invoice.supplier_confirmed_at,
          customer_confirmer_name: isSales ? confirmerName : prev.invoice.customer_confirmer_name,
          supplier_confirmer_name: !isSales ? confirmerName : prev.invoice.supplier_confirmer_name,
        },
      };
    });

    // refresh notes
    const { data: newData } = await anonClient.rpc('get_public_invoice', { p_system_code: code, p_module: moduleId }) as any;
    if (newData?.notes) setNotes(newData.notes as PublicNote[]);

    antMessage.success('فاکتور با موفقیت تایید شد!');
  };

  // ── send message ───────────────────────────────────────────────────────────

  const handleSendMessage = async () => {
    if (!messageText.trim() || !data) return;

    const inv = data.invoice;
    const authorName = isSales
      ? String(inv.customer_name || 'مشتری')
      : String(inv.supplier_name || 'تامین‌کننده');

    setMessageSending(true);

    const { data: result, error: rpcErr } = await anonClient.rpc('insert_public_invoice_note', {
      p_system_code: code,
      p_module: moduleId,
      p_content: messageText.trim(),
      p_author_name: authorName,
    });

    setMessageSending(false);

    if (rpcErr || result?.error) {
      antMessage.error('ارسال پیام ناموفق بود.');
      return;
    }

    const newNote: PublicNote = {
      id: result.id || Date.now().toString(),
      content: messageText.trim(),
      author_name: authorName,
      created_at: new Date().toISOString(),
      reply_to: null,
      metadata: { source: 'online_invoice' },
    };

    setNotes((prev) => [...prev, newNote]);
    setMessageText('');
    antMessage.success('پیام ارسال شد.');
  };

  // ── derived ────────────────────────────────────────────────────────────────

  const cfg = useMemo<OnlineConfig>(() => data?.online_config || {}, [data]);
  const invoice = data?.invoice || {};
  const items = data?.items || [];
  const payments = data?.payments || [];

  const invoiceStatus = String(invoice.status || '');
  const statusInfo = STATUS_LABELS[invoiceStatus] || { label: invoiceStatus, color: 'default' };
  const canConfirm = ['created', 'proforma'].includes(invoiceStatus);

  const confirmedAt = isSales ? invoice.customer_confirmed_at : invoice.supplier_confirmed_at;
  const confirmerName = isSales ? invoice.customer_confirmer_name : invoice.supplier_confirmer_name;

  const primaryColor = branding.palette?.primary || '#3730A3';

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spin size="large" tip="در حال بارگذاری فاکتور..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Alert type="error" message={error} showIcon className="max-w-md w-full" />
      </div>
    );
  }

  const logoUrl = branding.logoUrl ? normalizePublicAssetUrl(branding.logoUrl) : null;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl" style={{ fontFamily: 'Vazirmatn, sans-serif' }}>
      {/* Header */}
      <div
        className="w-full py-4 px-6 flex items-center gap-3 shadow-sm"
        style={{ background: primaryColor }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt={branding.brandName} className="h-10 object-contain" />
        ) : (
          <Avatar size={40} style={{ background: 'rgba(255,255,255,0.2)' }} icon={<UserOutlined />} />
        )}
        <div>
          <Title level={5} className="!text-white !mb-0">{branding.brandName}</Title>
          <Text className="text-white/80 text-xs">
            {isSales ? 'فاکتور فروش' : 'فاکتور خرید'} — کد: {invoice.system_code || code}
          </Text>
        </div>
        <div className="mr-auto">
          <Tag color={statusInfo.color} className="text-sm px-3 py-1">{statusInfo.label}</Tag>
        </div>
      </div>

      <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">

        {/* Invoice Info */}
        <Card
          title={<span className="font-bold">اطلاعات فاکتور</span>}
          size="small"
          className="shadow-sm"
        >
          <Row gutter={[16, 12]}>
            {invoice.name && (
              <Col xs={24} md={12}>
                <Text className="text-gray-500 text-xs block">عنوان فاکتور</Text>
                <Text className="font-medium">{invoice.name}</Text>
              </Col>
            )}
            {invoice.invoice_date && (
              <Col xs={24} md={12}>
                <Text className="text-gray-500 text-xs block">تاریخ</Text>
                <Text className="font-medium">{toJalali(invoice.invoice_date)}</Text>
              </Col>
            )}
            {isSales && invoice.customer_name && (
              <Col xs={24} md={12}>
                <Text className="text-gray-500 text-xs block">مشتری</Text>
                <Text className="font-medium">{invoice.customer_name}</Text>
              </Col>
            )}
            {!isSales && invoice.supplier_name && (
              <Col xs={24} md={12}>
                <Text className="text-gray-500 text-xs block">تامین‌کننده</Text>
                <Text className="font-medium">{invoice.supplier_name}</Text>
              </Col>
            )}
            {invoice.description && (
              <Col xs={24}>
                <Text className="text-gray-500 text-xs block">توضیحات</Text>
                <Text>{invoice.description}</Text>
              </Col>
            )}
          </Row>
        </Card>

        {/* Items Table */}
        {cfg.showItemsTable !== false && items.length > 0 && (
          <Card title={<span className="font-bold">اقلام فاکتور</span>} size="small" className="shadow-sm overflow-auto">
            <Table
              dataSource={items}
              rowKey={(r) => r.id || Math.random().toString()}
              pagination={false}
              size="small"
              scroll={{ x: 600 }}
              columns={[
                {
                  title: 'نام محصول/خدمت',
                  dataIndex: 'product_name',
                  render: (v: any, row: any) => (
                    <div>
                      <span>{v || '—'}</span>
                      {cfg.showItemNotes !== false && row.description && (
                        <div className="text-xs text-gray-400 mt-0.5">{row.description}</div>
                      )}
                      {cfg.showItemDates !== false && (row.start_date || row.end_date) && (
                        <div className="text-xs text-gray-400">
                          {row.start_date && `از: ${toJalali(row.start_date)}`}
                          {row.end_date && ` تا: ${toJalali(row.end_date)}`}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  title: 'تعداد/مقدار',
                  dataIndex: 'quantity',
                  render: (v: any) => formatNumber(v),
                },
                {
                  title: 'واحد',
                  dataIndex: 'main_unit',
                  render: (v: any) => v || '—',
                },
                {
                  title: 'قیمت واحد',
                  dataIndex: 'unit_price',
                  render: (v: any) => formatPrice(v),
                },
                ...(cfg.showDiscount !== false ? [{
                  title: 'تخفیف',
                  dataIndex: 'discount',
                  render: (v: any) => v ? formatPrice(v) : '—',
                }] : []),
                ...(cfg.showVat !== false ? [{
                  title: 'ارزش افزوده',
                  dataIndex: 'vat',
                  render: (v: any) => v ? formatPrice(v) : '—',
                }] : []),
                ...(cfg.showItemDimensions !== false ? [
                  { title: 'طول', dataIndex: 'length', render: (v: any) => v ? formatNumber(v) : '—' },
                  { title: 'عرض', dataIndex: 'width', render: (v: any) => v ? formatNumber(v) : '—' },
                ] : []),
                {
                  title: 'جمع ردیف',
                  dataIndex: 'total_price',
                  render: (v: any) => <span className="font-semibold">{formatPrice(v)}</span>,
                },
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <Text strong>جمع کل فاکتور</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} colSpan={5}>
                    <Text strong style={{ color: primaryColor }}>
                      {formatPrice(invoice.total_invoice_amount)}
                    </Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        )}

        {/* Financial Summary */}
        <Card title={<span className="font-bold">خلاصه مالی</span>} size="small" className="shadow-sm">
          <Row gutter={[16, 12]}>
            <Col xs={24} md={8}>
              <Text className="text-gray-500 text-xs block">مبلغ کل</Text>
              <Text strong style={{ color: primaryColor, fontSize: 16 }}>
                {formatPrice(invoice.total_invoice_amount)}
              </Text>
            </Col>
            <Col xs={24} md={8}>
              <Text className="text-gray-500 text-xs block">{isSales ? 'دریافت شده' : 'پرداخت شده'}</Text>
              <Text strong className="text-green-600 text-base">
                {formatPrice(invoice.total_received_amount)}
              </Text>
            </Col>
            <Col xs={24} md={8}>
              <Text className="text-gray-500 text-xs block">مانده</Text>
              <Text strong className="text-red-500 text-base">
                {formatPrice(invoice.remaining_balance)}
              </Text>
            </Col>
          </Row>
        </Card>

        {/* Payments Table */}
        {cfg.showPaymentsTable !== false && payments.length > 0 && (
          <Card
            title={<span className="font-bold">{isSales ? 'جدول دریافت‌ها' : 'جدول پرداخت‌ها'}</span>}
            size="small"
            className="shadow-sm overflow-auto"
          >
            <Table
              dataSource={payments}
              rowKey={(r) => r.id || Math.random().toString()}
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'تاریخ',
                  dataIndex: 'date',
                  render: (v: any) => toJalali(v),
                },
                {
                  title: 'روش پرداخت',
                  dataIndex: 'payment_type',
                  render: (v: any) => PAYMENT_TYPE_LABELS[v] || v || '—',
                },
                {
                  title: 'وضعیت',
                  dataIndex: 'status',
                  render: (v: any) => {
                    const s = PAYMENT_STATUS_LABELS[v];
                    return s ? <Tag color={s.color}>{s.label}</Tag> : (v || '—');
                  },
                },
                {
                  title: 'مبلغ',
                  dataIndex: 'amount',
                  render: (v: any) => <span className="font-semibold">{formatPrice(v)}</span>,
                },
                {
                  title: 'توضیحات',
                  dataIndex: 'description',
                  render: (v: any) => v || '—',
                },
              ]}
            />
          </Card>
        )}

        {/* Confirmation Section */}
        {cfg.confirmationEnabled !== false && (
          <Card
            title={
              <span className="font-bold flex items-center gap-2">
                <SafetyCertificateOutlined />
                تایید فاکتور
              </span>
            }
            size="small"
            className="shadow-sm"
          >
            {confirmStep === 'confirmed' || !canConfirm ? (
              <div className="space-y-3">
                {confirmedAt ? (
                  <Alert
                    type="success"
                    showIcon
                    icon={<CheckCircleOutlined />}
                    message={
                      <span>
                        آخرین بار تایید شده توسط <strong>{confirmerName || '—'}</strong> در{' '}
                        <strong>{toJalaliDateTime(confirmedAt)}</strong>
                      </span>
                    }
                  />
                ) : (
                  <Alert
                    type="warning"
                    showIcon
                    message={`در وضعیت «${statusInfo.label}» امکان تایید وجود ندارد.`}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <Text className="text-gray-600 text-sm">
                  برای تایید رسمی این فاکتور، کد تایید به شماره موبایل شما ارسال می‌شود.
                </Text>

                <Steps
                  size="small"
                  current={confirmStep === 'idle' || confirmStep === 'select_phone' ? 0 : 1}
                  items={[
                    { title: 'انتخاب شماره' },
                    { title: 'تایید کد' },
                  ]}
                />

                {(confirmStep === 'idle' || confirmStep === 'select_phone') && (
                  <div className="space-y-3">
                    <Text className="text-xs text-gray-500">شماره موبایل برای دریافت کد تایید:</Text>
                    {phoneOptions.length === 0 ? (
                      <Alert type="warning" message="شماره موبایلی برای ارسال کد تایید یافت نشد." showIcon />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {phoneOptions.map((p) => (
                          <Button
                            key={p.value}
                            type={selectedPhoneKey === p.value ? 'primary' : 'default'}
                            size="small"
                            onClick={() => { setSelectedPhoneKey(p.value); setConfirmStep('select_phone'); }}
                            style={selectedPhoneKey === p.value ? { background: primaryColor, borderColor: primaryColor } : {}}
                          >
                            {p.label}: {p.phone}
                          </Button>
                        ))}
                      </div>
                    )}
                    {selectedPhoneKey && (
                      <Button
                        type="primary"
                        loading={otpSending}
                        onClick={handleSendOtp}
                        style={{ background: primaryColor, borderColor: primaryColor }}
                        icon={<SendOutlined />}
                      >
                        ارسال کد تایید
                      </Button>
                    )}
                    {otpError && <Alert type="error" message={otpError} showIcon />}
                  </div>
                )}

                {confirmStep === 'enter_otp' && (
                  <div className="space-y-3">
                    <Text className="text-sm">
                      کد ۶ رقمی ارسال شده به{' '}
                      <strong>{phoneOptions.find((p) => p.value === selectedPhoneKey)?.phone}</strong> را وارد کنید:
                    </Text>
                    <Input
                      size="large"
                      maxLength={6}
                      placeholder="کد تایید"
                      value={otpValue}
                      onChange={(e) => { setOtpValue(e.target.value); setOtpError(null); }}
                      onPressEnter={handleVerifyOtp}
                      className="text-center text-xl tracking-widest max-w-[200px]"
                    />
                    <div className="flex flex-wrap gap-2 items-center">
                      <Button
                        type="primary"
                        loading={otpVerifying}
                        onClick={handleVerifyOtp}
                        style={{ background: primaryColor, borderColor: primaryColor }}
                        icon={<CheckCircleOutlined />}
                      >
                        تایید فاکتور
                      </Button>
                      <Button
                        type="link"
                        disabled={resendCountdown > 0 || otpSending}
                        loading={otpSending}
                        onClick={handleSendOtp}
                        size="small"
                      >
                        {resendCountdown > 0 ? (
                          <span className="flex items-center gap-1">
                            <ClockCircleOutlined />
                            {resendCountdown} ثانیه تا ارسال مجدد
                          </span>
                        ) : 'ارسال مجدد کد'}
                      </Button>
                    </div>
                    {otpError && <Alert type="error" message={otpError} showIcon />}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Messaging Section */}
        {cfg.messagingEnabled !== false && (
          <Card
            title={
              <span className="font-bold flex items-center gap-2">
                <MessageOutlined />
                پیام‌ها
              </span>
            }
            size="small"
            className="shadow-sm"
          >
            {/* Timeline of notes */}
            {notes.length > 0 ? (
              <Timeline
                className="mt-3"
                items={notes.map((note) => {
                  const isExternal = note.metadata?.source === 'online_invoice';
                  const isConfirmation = note.metadata?.source === 'online_invoice_confirm';
                  return {
                    color: isConfirmation ? 'green' : isExternal ? 'blue' : primaryColor,
                    dot: isConfirmation ? <CheckCircleOutlined className="text-green-500" /> : undefined,
                    children: (
                      <div
                        className={`rounded-lg p-3 text-sm ${
                          isExternal
                            ? 'bg-blue-50 border border-blue-100'
                            : 'bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <Text strong className="text-xs">
                            {note.author_name || '—'}
                          </Text>
                          <Text className="text-xs text-gray-400">
                            {toJalaliDateTime(note.created_at)}
                          </Text>
                        </div>
                        <Paragraph className="!mb-0 text-sm">{note.content}</Paragraph>
                      </div>
                    ),
                  };
                })}
              />
            ) : (
              <Text className="text-gray-400 text-sm">هنوز پیامی ارسال نشده است.</Text>
            )}

            <Divider className="my-3" />

            {/* Message input */}
            <div className="space-y-2">
              <Input.TextArea
                rows={3}
                placeholder="پیام خود را بنویسید..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                maxLength={1000}
                showCount
              />
              <Button
                type="primary"
                loading={messageSending}
                onClick={handleSendMessage}
                disabled={!messageText.trim()}
                style={{ background: primaryColor, borderColor: primaryColor }}
                icon={<SendOutlined />}
              >
                ارسال پیام
              </Button>
            </div>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <Text className="text-xs text-gray-400">
            این صفحه توسط {branding.brandName} ارائه شده است.
          </Text>
        </div>
      </div>
    </div>
  );
};

export default InvoicePublicPage;
