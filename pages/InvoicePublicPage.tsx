import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Avatar,
  Button,
  ConfigProvider,
  Divider,
  Input,
  Spin,
  Steps,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  theme as antdTheme,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  PhoneOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  ShareAltOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { DEFAULT_BRANDING, BRAND_PALETTE_PRESETS, type BrandingConfig, type BrandingPaletteKey } from '../theme/brandTheme';
import { normalizePublicAssetUrl } from '../utils/assetUrl';
import { buildImagePreviewUrl } from '../utils/imagePreview';
import { supabasePublic } from '../supabaseClient';
import ResilientImage from '../components/common/ResilientImage';

const anonClient = supabasePublic;

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

const hexToRgba = (hex: string, alpha: number) => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  created:    { label: 'ایجاد شده',    color: 'blue' },
  proforma:   { label: 'پیش فاکتور',   color: 'orange' },
  confirmed:  { label: 'تایید شده',    color: 'cyan' },
  final:      { label: 'فاکتور نهایی', color: 'green' },
  prepayment: { label: 'پیش پرداخت',   color: 'gold' },
  settled:    { label: 'تسویه شده',    color: 'purple' },
  canceled:   { label: 'لغو شده',      color: 'red' },
  completed:  { label: 'تکمیل شده',   color: 'default' },
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
  rejected:  { label: 'رد شده',    color: 'red' },
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
  id?: string;
  content: string;
  author_name: string;
  created_at: string;
  reply_to?: string | null;
  metadata?: Record<string, any>;
};

// ─── phone display helpers ───────────────────────────────────────────────────

const toFarsiDigits = (str: string): string =>
  String(str).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const formatPhoneDisplay = (raw: string | null | undefined): string => {
  if (!raw) return '—';
  const normalized = normalizePhone(String(raw));
  return toFarsiDigits(normalized || String(raw));
};

// ─── item sub-line builder ───────────────────────────────────────────────────

const buildItemSubLine = (row: Record<string, any>, cfg: OnlineConfig): string => {
  const parts: string[] = [];

  if (cfg.showItemDates !== false) {
    if (row.start_date) parts.push(`از: ${toJalali(row.start_date)}`);
    if (row.end_date) parts.push(`تا: ${toJalali(row.end_date)}`);
  }

  if (cfg.showItemDimensions !== false) {
    const dims: string[] = [];
    if (row.length) dims.push(`طول ${formatNumber(row.length)}`);
    if (row.width) dims.push(`عرض ${formatNumber(row.width)}`);
    if (dims.length) parts.push(dims.join(' × '));
  }

  if (row.secondary_quantity && row.secondary_unit) {
    parts.push(`${formatNumber(row.secondary_quantity)} ${row.secondary_unit}`);
  }

  return parts.join(' | ');
};

// ─── inner content component ─────────────────────────────────────────────────

type ContentProps = {
  primaryColor: string;
  onBrandingLoad: (color: string) => void;
};

const InvoicePublicContent = ({ primaryColor, onBrandingLoad }: ContentProps) => {
  const { token } = antdTheme.useToken();
  const { message: antMessage } = App.useApp();
  const { code } = useParams<{ code: string }>();

  const moduleParam = new URLSearchParams(window.location.search).get('t') || 'invoices';
  const moduleId = moduleParam === 'p' ? 'purchase_invoices' : 'invoices';
  const isSales = moduleId === 'invoices';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InvoiceData | null>(null);
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);

  // confirm flow
  const [phoneOptions, setPhoneOptions] = useState<{ label: string; value: string; phone: string; displayPhone: string }[]>([]);
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
    if (!code) {
      setError('کد فاکتور نامعتبر است.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadInvoice = async () => {
      try {
        const { data: result, error: rpcErr } = await anonClient.rpc('get_public_invoice', {
          p_system_code: code,
          p_module: moduleId,
        });
        if (cancelled) return;
        if (rpcErr || !result) {
          setError('خطا در بارگذاری فاکتور.');
          setLoading(false);
          return;
        }
        if ((result as any).error === 'not_found') {
          setError('فاکتور پیدا نشد.');
          setLoading(false);
          return;
        }

        const invData = result as InvoiceData;
        setData(invData);
        setNotes(invData.notes || []);

        const bs = invData.branding?.branding_settings as Record<string, any> | undefined;
        const cs = invData.branding?.company_settings as Record<string, any> | undefined;

        // Logo: from company_settings (authoritative source for logo_url)
        const logoFromCompany = String(cs?.logo_url || '').trim() || null;
        // Brand name: branding_settings > company_settings fallback
        const brandName = String(
          bs?.brand_name || bs?.brandName ||
          cs?.company_full_name || cs?.trade_name ||
          DEFAULT_BRANDING.brandName
        );
        const shortName = String(
          bs?.short_name || bs?.shortName ||
          cs?.trade_name || cs?.company_full_name ||
          DEFAULT_BRANDING.shortName
        );

        const merged: BrandingConfig = {
          ...DEFAULT_BRANDING,
          brandName,
          shortName,
          logoUrl: logoFromCompany,
        };
        setBranding(merged);

        // Color: direct primary_color > palette_key lookup > company brand_palette_key
        const directColor = String(bs?.primary_color || '').trim();
        const paletteKey = (bs?.palette_key || cs?.brand_palette_key || '') as BrandingPaletteKey;
        const paletteColor = paletteKey ? BRAND_PALETTE_PRESETS[paletteKey]?.palette?.primary : '';
        const resolvedColor = directColor || paletteColor || '';
        if (resolvedColor) onBrandingLoad(resolvedColor);

        const inv = invData.invoice;
        const phoneCandidates: { label: string; value: string; phone: string; displayPhone: string }[] = [];
        const checkPhone = (raw: string | null | undefined, label: string, key: string) => {
          const n = normalizePhone(String(raw || ''));
          if (/^09\d{9}$/.test(n) && !phoneCandidates.find((p) => p.phone === n)) {
            phoneCandidates.push({ label, value: key, phone: n, displayPhone: formatPhoneDisplay(n) });
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
        const confirmedAt = isSales ? inv.customer_confirmed_at : inv.supplier_confirmed_at;
        if (confirmedAt) setConfirmStep('confirmed');
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError('خطا در بارگذاری. لطفاً صفحه را رفرش کنید.');
        setLoading(false);
      }
    };

    void loadInvoice();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, moduleId]);

  // ── countdown ─────────────────────────────────────────────────────────────

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
        setOtpError(res.data?.message || 'ارسال کد تایید ناموفق بود.');
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

  // ── print styles injection ────────────────────────────────────────────────

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'ip-print-styles';
    style.textContent = `
      @media print {
        .ip-no-print { display: none !important; }
        body { margin: 0; background: #fff !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('ip-print-styles')?.remove(); };
  }, []);

  // ── print / share handlers ────────────────────────────────────────────────

  const handlePrint = () => {
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) { window.print(); return; }

    const pc = primaryColor;
    const companyName = companySt?.company_full_name || branding.brandName || '';
    const companyAddress = companySt?.address || '';
    const companyPhone = [companySt?.phone, companySt?.mobile].filter(Boolean)
      .map((p: string) => formatPhoneDisplay(p)).join(' | ');
    const logoSrc = branding.logoUrl ? buildImagePreviewUrl(branding.logoUrl, 'gallery') : null;

    const buyerNamePrint = isSales ? invoice.customer_name : invoice.supplier_name;
    const buyerPhonePrint = formatPhoneDisplay(
      isSales ? (invoice.customer_mobile || invoice.customer_mobile2) : (invoice.supplier_mobile || invoice.supplier_mobile2)
    );
    const buyerAddressPrint = isSales ? (invoice.address || '') : '';
    const counterpartyTitle = isSales ? 'خریدار' : 'فروشنده';
    const companyPartyTitle = isSales ? 'فروشنده' : 'خریدار';
    const invoiceTitle = isSales ? 'فاکتور فروش' : 'فاکتور خرید';

    const filteredItems = (data?.items || []).filter(Boolean);

    const itemRows = filteredItems.map((row: Record<string, any>, idx: number) => {
      const subLine = buildItemSubLine(row, cfg);
      const desc = cfg.showItemNotes !== false && row.description ? row.description : '';
      return `
        <tr>
          <td style="border:1px solid #d1d5db;padding:4px 5px;text-align:center;">${toFarsiDigits(String(idx + 1))}</td>
          <td style="border:1px solid #d1d5db;padding:4px 5px;word-break:break-word;">
            <div style="font-weight:700;">${row.product_name || '—'}</div>
            ${subLine ? `<div style="font-size:9px;color:#64748b;margin-top:2px;">${subLine}</div>` : ''}
            ${desc ? `<div style="font-size:9px;color:#64748b;white-space:pre-wrap;">${desc}</div>` : ''}
          </td>
          <td style="border:1px solid #d1d5db;padding:4px 5px;text-align:center;">
            ${formatNumber(row.quantity)}
            ${row.main_unit ? `<div style="font-size:9px;color:#64748b;">${row.main_unit}</div>` : ''}
          </td>
          <td style="border:1px solid #d1d5db;padding:4px 5px;">${formatPrice(row.unit_price)}</td>
          ${cfg.showDiscount !== false ? `<td style="border:1px solid #d1d5db;padding:4px 5px;">${row.discount ? formatPrice(row.discount) : '—'}</td>` : ''}
          ${cfg.showVat !== false ? `<td style="border:1px solid #d1d5db;padding:4px 5px;">${row.vat ? formatPrice(row.vat) : '—'}</td>` : ''}
          <td style="border:1px solid #d1d5db;padding:4px 5px;font-weight:700;color:${pc};">${formatPrice(row.total_price)}</td>
        </tr>`;
    }).join('');

    const paymentsRows = (cfg.showPaymentsTable !== false && data?.payments?.length)
      ? (data.payments).map((p: Record<string, any>) => `
        <tr>
          <td style="border:1px solid #d1d5db;padding:3px 5px;">${toJalali(p.date)}</td>
          <td style="border:1px solid #d1d5db;padding:3px 5px;">${PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type || '—'}</td>
          <td style="border:1px solid #d1d5db;padding:3px 5px;font-weight:600;color:${pc};">${formatPrice(p.amount)}</td>
          <td style="border:1px solid #d1d5db;padding:3px 5px;">${p.description || '—'}</td>
        </tr>`).join('')
      : '';

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="UTF-8"/>
<title>${invoiceTitle} — ${invoice.system_code || ''}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Vazirmatn, Tahoma, sans-serif; font-size: 11px; color: #111827; direction: rtl; background: #fff; }
  table { width: 100%; border-collapse: collapse; }
  .brand-bg { background: ${pc}; }
  .brand-color { color: ${pc}; }
  .brand-light { background: rgba(0,0,0,0.04); }
  .section { margin-bottom: 7px; }
  th { background: rgba(0,0,0,0.07); font-weight: 700; padding: 4px 5px; border: 1px solid #d1d5db; text-align: right; }
  td { vertical-align: top; }
</style>
</head>
<body>
<!-- Header -->
<table style="width:100%;border-collapse:separate;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:8px;" class="section">
  <tbody><tr>
    <td style="width:35%;padding:10px;vertical-align:middle;background:rgba(0,0,0,0.03);">
      <div style="display:flex;align-items:center;gap:8px;">
        ${logoSrc ? `<img src="${logoSrc}" style="width:44px;height:44px;object-fit:contain;" />` : ''}
        <div>
          <div style="font-weight:800;font-size:13px;">${companyName}</div>
          ${companySt?.trade_name && companySt.trade_name !== companyName ? `<div style="font-size:10px;color:#6b7280;">${companySt.trade_name}</div>` : ''}
        </div>
      </div>
    </td>
    <td style="width:30%;padding:10px;text-align:center;vertical-align:middle;background:rgba(0,0,0,0.05);">
      <div style="font-weight:800;font-size:16px;color:${pc};">${invoiceTitle}</div>
    </td>
    <td style="width:35%;padding:10px;vertical-align:middle;background:rgba(0,0,0,0.03);font-size:11px;">
      <div>شماره: <strong>${invoice.system_code || '—'}</strong></div>
      <div>تاریخ: <strong>${toJalali(invoice.invoice_date)}</strong></div>
      <div style="margin-top:4px;"><span style="background:${pc};color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;">${STATUS_LABELS[invoice.status]?.label || invoice.status}</span></div>
    </td>
  </tr></tbody>
</table>

<!-- Parties -->
<table style="margin-bottom:7px;" class="section">
  <tbody><tr>
    <td style="width:50%;border:1px solid #e5e7eb;padding:8px;vertical-align:top;background:rgba(0,0,0,0.02);">
      <div style="font-weight:800;color:${pc};margin-bottom:5px;font-size:10px;">${companyPartyTitle}</div>
      ${companyName ? `<div>${companyName}</div>` : ''}
      ${companyAddress ? `<div style="font-size:9px;color:#64748b;">${companyAddress}</div>` : ''}
      ${companyPhone ? `<div style="font-size:9px;color:#64748b;">${companyPhone}</div>` : ''}
    </td>
    <td style="width:50%;border:1px solid #e5e7eb;border-right:none;padding:8px;vertical-align:top;">
      <div style="font-weight:800;color:${pc};margin-bottom:5px;font-size:10px;">${counterpartyTitle}</div>
      ${buyerNamePrint ? `<div>${buyerNamePrint}</div>` : ''}
      ${buyerAddressPrint ? `<div style="font-size:9px;color:#64748b;">${buyerAddressPrint}</div>` : ''}
      ${buyerPhonePrint && buyerPhonePrint !== '—' ? `<div style="font-size:9px;color:#64748b;">${buyerPhonePrint}</div>` : ''}
    </td>
  </tr></tbody>
</table>

${invoice.name ? `
<table style="margin-bottom:7px;" class="section">
  <tbody><tr>
    <td style="border:1px solid #e5e7eb;padding:6px 8px;font-size:10px;color:#64748b;width:20%;">عنوان</td>
    <td style="border:1px solid #e5e7eb;border-right:none;padding:6px 8px;">${invoice.name}</td>
  </tr></tbody>
</table>` : ''}

${cfg.showItemsTable !== false && filteredItems.length ? `
<!-- Items -->
<table style="font-size:9.5px;margin-bottom:7px;" class="section">
  <thead>
    <tr style="background:rgba(0,0,0,0.06);">
      <th style="width:5%;">ردیف</th>
      <th style="width:${28 - (cfg.showDiscount !== false ? 0 : 5) - (cfg.showVat !== false ? 0 : 5)}%;">کالا / شرح</th>
      <th style="width:10%;">تعداد</th>
      <th style="width:14%;">قیمت واحد</th>
      ${cfg.showDiscount !== false ? '<th style="width:10%;">تخفیف</th>' : ''}
      ${cfg.showVat !== false ? '<th style="width:10%;">مالیات</th>' : ''}
      <th style="width:15%;">جمع ردیف</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
    <tr style="background:rgba(0,0,0,0.04);">
      <td colspan="${4 + (cfg.showDiscount !== false ? 1 : 0) + (cfg.showVat !== false ? 1 : 0)}" style="border:1px solid #d1d5db;padding:5px;font-weight:800;">جمع کل فاکتور</td>
      <td style="border:1px solid #d1d5db;padding:5px;font-weight:800;color:${pc};">${formatPrice(invoice.total_invoice_amount)}</td>
    </tr>
  </tbody>
</table>` : ''}

<!-- Financial -->
<table style="margin-bottom:7px;" class="section">
  <tbody><tr>
    <td style="border:1px solid #e5e7eb;padding:7px 10px;text-align:center;width:33%;">
      <div style="font-size:9px;color:#6b7280;">مبلغ کل</div>
      <div style="font-weight:800;font-size:13px;color:${pc};">${formatPrice(invoice.total_invoice_amount)}</div>
    </td>
    <td style="border:1px solid #e5e7eb;border-right:none;padding:7px 10px;text-align:center;width:33%;">
      <div style="font-size:9px;color:#6b7280;">${isSales ? 'دریافت شده' : 'پرداخت شده'}</div>
      <div style="font-weight:700;font-size:12px;color:#16a34a;">${formatPrice(invoice.total_received_amount)}</div>
    </td>
    <td style="border:1px solid #e5e7eb;border-right:none;padding:7px 10px;text-align:center;width:33%;">
      <div style="font-size:9px;color:#6b7280;">مانده</div>
      <div style="font-weight:700;font-size:12px;color:#dc2626;">${formatPrice(invoice.remaining_balance)}</div>
    </td>
  </tr></tbody>
</table>

${paymentsRows ? `
<table style="font-size:9.5px;margin-bottom:7px;" class="section">
  <thead>
    <tr style="background:rgba(0,0,0,0.06);">
      <th>${isSales ? 'دریافت‌ها' : 'پرداخت‌ها'}</th><th>روش</th><th>مبلغ</th><th>توضیحات</th>
    </tr>
  </thead>
  <tbody>${paymentsRows}</tbody>
</table>` : ''}

${invoice.description ? `
<table style="margin-bottom:7px;" class="section">
  <tbody><tr>
    <td style="border:1px solid #e5e7eb;padding:6px 8px;font-size:10px;color:#6b7280;width:15%;font-weight:700;">توضیحات</td>
    <td style="border:1px solid #e5e7eb;border-right:none;padding:6px 8px;white-space:pre-wrap;">${invoice.description}</td>
  </tr></tbody>
</table>` : ''}

</body>
</html>`;

    printWin.document.write(html);
    printWin.document.close();
    printWin.onload = () => {
      printWin.focus();
      printWin.print();
    };
  };

  const handleShare = async () => {
    const url = window.location.href;
    const title = `فاکتور ${isSales ? 'فروش' : 'خرید'} — ${invoice.system_code || code || ''}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
      antMessage.success('لینک فاکتور کپی شد.');
    }
  };

  // ── derived ────────────────────────────────────────────────────────────────

  const cfg = useMemo<OnlineConfig>(() => data?.online_config || {}, [data]);
  const invoice = data?.invoice || {};
  const items = data?.items || [];
  const payments = data?.payments || [];
  const companySt = data?.branding?.company_settings as Record<string, any> | undefined;

  const invoiceStatus = String(invoice.status || '');
  const statusInfo = STATUS_LABELS[invoiceStatus] || { label: invoiceStatus, color: 'default' };
  const canConfirm = ['created', 'proforma'].includes(invoiceStatus);
  const confirmedAt = isSales ? invoice.customer_confirmed_at : invoice.supplier_confirmed_at;
  const confirmerName = isSales ? invoice.customer_confirmer_name : invoice.supplier_confirmer_name;

  // ── shared style helpers ──────────────────────────────────────────────────

  const card = {
    background: token.colorBgContainer,
    borderRadius: token.borderRadiusLG,
    border: `1px solid ${token.colorBorderSecondary}`,
    marginBottom: 12,
    overflow: 'hidden' as const,
  };

  const cardBody = { padding: '14px 16px' };

  const cardHead = {
    padding: '10px 16px',
    borderBottom: `1px solid ${token.colorBorderSecondary}`,
    background: hexToRgba(primaryColor, 0.06),
    fontWeight: 700,
    fontSize: 13,
    color: primaryColor,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
  };

  const fieldLabel = {
    fontSize: 11,
    color: token.colorTextTertiary,
    display: 'block',
    marginBottom: 2,
  };

  const fieldValue = {
    fontSize: 13,
    color: token.colorText,
    fontWeight: 500,
  };

  const logoUrl = branding.logoUrl ? normalizePublicAssetUrl(branding.logoUrl) : null;

  // ── loading / error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        background: token.colorBgLayout,
      }}>
        <Spin size="large" />
        <Text style={{ color: token.colorTextSecondary, fontSize: 13 }}>در حال بارگذاری فاکتور...</Text>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: token.colorBgLayout,
      }}>
        <Alert type="error" message={error} showIcon style={{ maxWidth: 400, width: '100%' }} />
      </div>
    );
  }

  const sellerTitle = isSales ? 'مشخصات فروشنده' : 'مشخصات خریدار';
  const buyerTitle = isSales ? 'مشخصات خریدار' : 'مشخصات فروشنده';
  const buyerName = isSales ? invoice.customer_name : invoice.supplier_name;
  const buyerPhone = isSales
    ? invoice.customer_mobile || invoice.customer_mobile2
    : invoice.supplier_mobile || invoice.supplier_mobile2;

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: token.colorBgLayout,
        fontFamily: 'Vazirmatn, sans-serif',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${hexToRgba(primaryColor, 0.82)} 100%)`,
        padding: '0',
      }}>
        <div style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          {/* logo */}
          {logoUrl ? (
            <ResilientImage
              src={logoUrl}
              preset="gallery"
              alt={branding.brandName}
              style={{
                width: 52,
                height: 52,
                objectFit: 'contain',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.15)',
                padding: 4,
                flexShrink: 0,
              }}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Avatar
              size={52}
              icon={<ShopOutlined />}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                flexShrink: 0,
              }}
            />
          )}

          {/* org info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Title
              level={5}
              style={{ color: '#fff', margin: 0, lineHeight: 1.4, fontWeight: 800 }}
            >
              {branding.brandName}
            </Title>
            {companySt?.trade_name && companySt.trade_name !== branding.brandName && (
              <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11 }}>
                {companySt.trade_name}
              </Text>
            )}
            <div style={{ marginTop: 2 }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
                {isSales ? 'فاکتور فروش' : 'فاکتور خرید'}{invoice.system_code ? ` — کد: ${invoice.system_code}` : ''}
              </Text>
            </div>
          </div>

          {/* status + date + actions */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <Tag color={statusInfo.color} style={{ margin: 0, fontWeight: 600 }}>
              {statusInfo.label}
            </Tag>
            {invoice.invoice_date && (
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>
                {toJalali(invoice.invoice_date)}
              </Text>
            )}
            <div className="ip-no-print" style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <Tooltip title="پرینت فاکتور">
                <Button
                  size="small"
                  icon={<PrinterOutlined />}
                  onClick={handlePrint}
                  style={{
                    background: 'rgba(255,255,255,0.18)',
                    border: '1px solid rgba(255,255,255,0.35)',
                    color: '#fff',
                    borderRadius: 6,
                  }}
                />
              </Tooltip>
              <Tooltip title="به اشتراک‌گذاری">
                <Button
                  size="small"
                  icon={<ShareAltOutlined />}
                  onClick={handleShare}
                  style={{
                    background: 'rgba(255,255,255,0.18)',
                    border: '1px solid rgba(255,255,255,0.35)',
                    color: '#fff',
                    borderRadius: 6,
                  }}
                />
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* ── Page Content ───────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px 12px 40px' }}>

        {/* ── Parties Section ─────────────────────────────────────────── */}
        <div style={card}>
          <div style={cardHead}>
            <UserOutlined />
            مشخصات طرفین
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
          }}>
            {/* Seller */}
            <div style={{
              padding: '12px 16px',
              borderLeft: `1px solid ${token.colorBorderSecondary}`,
            }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: primaryColor,
                marginBottom: 8,
                textTransform: 'uppercase' as const,
              }}>
                {sellerTitle}
              </div>
              {companySt?.company_full_name && (
                <div style={{ marginBottom: 4 }}>
                  <span style={fieldLabel}>نام شرکت</span>
                  <span style={fieldValue}>{companySt.company_full_name}</span>
                </div>
              )}
              {companySt?.address && (
                <div style={{ marginBottom: 4 }}>
                  <span style={fieldLabel}>آدرس</span>
                  <span style={{ ...fieldValue, fontSize: 12 }}>{companySt.address}</span>
                </div>
              )}
              {(companySt?.phone || companySt?.mobile) && (
                <div style={{ marginBottom: 4 }}>
                  <span style={fieldLabel}>تلفن</span>
                  <span style={fieldValue}>
                    {[companySt.phone, companySt.mobile]
                      .filter(Boolean)
                      .map((p: string) => formatPhoneDisplay(p))
                      .join(' | ')}
                  </span>
                </div>
              )}
              {!companySt?.company_full_name && (
                <Text style={{ color: token.colorTextQuaternary, fontSize: 12 }}>
                  {branding.brandName}
                </Text>
              )}
            </div>

            {/* Buyer */}
            <div style={{ padding: '12px 16px' }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: primaryColor,
                marginBottom: 8,
              }}>
                {buyerTitle}
              </div>
              {buyerName ? (
                <>
                  <div style={{ marginBottom: 4 }}>
                    <span style={fieldLabel}>نام</span>
                    <span style={fieldValue}>{buyerName}</span>
                  </div>
                  {isSales && invoice.address && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={fieldLabel}>آدرس</span>
                      <span style={{ ...fieldValue, fontSize: 12 }}>{invoice.address}</span>
                    </div>
                  )}
                  {buyerPhone && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={fieldLabel}>
                        <PhoneOutlined style={{ marginLeft: 3 }} />
                        موبایل
                      </span>
                      <span style={fieldValue}>{formatPhoneDisplay(buyerPhone)}</span>
                    </div>
                  )}
                </>
              ) : (
                <Text style={{ color: token.colorTextQuaternary, fontSize: 12 }}>اطلاعاتی ثبت نشده</Text>
              )}
            </div>
          </div>
        </div>

        {/* ── Invoice Meta ─────────────────────────────────────────────── */}
        {invoice.name && (
          <div style={card}>
            <div style={cardHead}>اطلاعات فاکتور</div>
            <div style={cardBody}>
              <div>
                <span style={fieldLabel}>عنوان</span>
                <span style={fieldValue}>{invoice.name}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Items Table ──────────────────────────────────────────────── */}
        {cfg.showItemsTable !== false && items.length > 0 && (
          <div style={card}>
            <div style={cardHead}>اقلام فاکتور</div>
            <div style={{ overflowX: 'auto' }}>
              <Table
                dataSource={items.filter(Boolean)}
                rowKey={(_, index) => `invoice-item-${index}`}
                pagination={false}
                size="small"
                style={{ direction: 'rtl' }}
                columns={[
                  {
                    title: 'ردیف',
                    width: 44,
                    render: (_: any, __: any, idx: number) => (
                      <span style={{ color: token.colorTextTertiary, fontSize: 11 }}>
                        {(idx + 1).toLocaleString('fa-IR')}
                      </span>
                    ),
                  },
                  {
                    title: 'کالا / شرح',
                    dataIndex: 'product_name',
                    render: (v: any, row: any) => {
                      const subLine = buildItemSubLine(row, cfg);
                      const hasDesc = cfg.showItemNotes !== false && row.description;
                      return (
                        <div>
                          <div style={{ fontWeight: 600, color: token.colorText }}>{v || '—'}</div>
                          {subLine && (
                            <div style={{
                              fontSize: 10,
                              color: token.colorTextTertiary,
                              marginTop: 2,
                              lineHeight: 1.7,
                            }}>
                              {subLine}
                            </div>
                          )}
                          {hasDesc && (
                            <div style={{
                              fontSize: 10,
                              color: token.colorTextTertiary,
                              marginTop: 1,
                              lineHeight: 1.7,
                              whiteSpace: 'pre-wrap',
                            }}>
                              {row.description}
                            </div>
                          )}
                        </div>
                      );
                    },
                  },
                  {
                    title: 'تعداد',
                    dataIndex: 'quantity',
                    align: 'center' as const,
                    render: (v: any, row: any) => (
                      <div style={{ textAlign: 'center' }}>
                        <div>{formatNumber(v)}</div>
                        {row.main_unit && (
                          <div style={{ fontSize: 10, color: token.colorTextTertiary }}>{row.main_unit}</div>
                        )}
                      </div>
                    ),
                  },
                  {
                    title: 'قیمت واحد',
                    dataIndex: 'unit_price',
                    render: (v: any) => (
                      <span style={{ fontSize: 12 }}>{formatPrice(v)}</span>
                    ),
                  },
                  ...(cfg.showDiscount !== false ? [{
                    title: 'تخفیف',
                    dataIndex: 'discount',
                    render: (v: any) => v ? (
                      <span style={{ color: token.colorError, fontSize: 12 }}>{formatPrice(v)}</span>
                    ) : <span style={{ color: token.colorTextQuaternary }}>—</span>,
                  }] : []),
                  ...(cfg.showVat !== false ? [{
                    title: 'مالیات',
                    dataIndex: 'vat',
                    render: (v: any) => v ? (
                      <span style={{ fontSize: 12 }}>{formatPrice(v)}</span>
                    ) : <span style={{ color: token.colorTextQuaternary }}>—</span>,
                  }] : []),
                  {
                    title: 'جمع ردیف',
                    dataIndex: 'total_price',
                    render: (v: any) => (
                      <span style={{ fontWeight: 700, color: primaryColor, fontSize: 12 }}>
                        {formatPrice(v)}
                      </span>
                    ),
                  },
                ]}
                summary={() => {
                  // ردیف + کالا/شرح + تعداد + قیمت واحد = 4، سپس تخفیف و مالیات اختیاری
                  const labelSpan =
                    4 +
                    (cfg.showDiscount !== false ? 1 : 0) +
                    (cfg.showVat !== false ? 1 : 0);
                  return (
                    <Table.Summary.Row style={{ background: hexToRgba(primaryColor, 0.05) }}>
                      <Table.Summary.Cell index={0} colSpan={labelSpan}>
                        <Text strong style={{ color: token.colorText }}>جمع کل فاکتور</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={labelSpan} colSpan={1}>
                        <Text strong style={{ color: primaryColor, fontSize: 14 }}>
                          {formatPrice(invoice.total_invoice_amount)}
                        </Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  );
                }}
              />
            </div>
          </div>
        )}

        {/* ── Financial Summary ────────────────────────────────────────── */}
        <div style={card}>
          <div style={cardHead}>خلاصه مالی</div>
          <div style={{
            ...cardBody,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 0,
          }}>
            <div style={{
              padding: '12px 16px',
              borderLeft: `1px solid ${token.colorBorderSecondary}`,
              textAlign: 'center' as const,
            }}>
              <div style={fieldLabel}>مبلغ کل</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: primaryColor }}>
                {formatPrice(invoice.total_invoice_amount)}
              </div>
            </div>
            <div style={{
              padding: '12px 16px',
              borderLeft: `1px solid ${token.colorBorderSecondary}`,
              textAlign: 'center' as const,
            }}>
              <div style={fieldLabel}>{isSales ? 'دریافت شده' : 'پرداخت شده'}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: token.colorSuccess }}>
                {formatPrice(invoice.total_received_amount)}
              </div>
            </div>
            <div style={{ padding: '12px 16px', textAlign: 'center' as const }}>
              <div style={fieldLabel}>مانده</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: token.colorError }}>
                {formatPrice(invoice.remaining_balance)}
              </div>
            </div>
          </div>
        </div>

        {/* ── Payments Table ───────────────────────────────────────────── */}
        {cfg.showPaymentsTable !== false && payments.length > 0 && (
          <div style={card}>
            <div style={cardHead}>
              {isSales ? 'جدول دریافت‌ها' : 'جدول پرداخت‌ها'}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <Table
                dataSource={payments}
                rowKey={(_, index) => `invoice-payment-${index}`}
                pagination={false}
                size="small"
                columns={[
                  {
                    title: 'تاریخ',
                    dataIndex: 'date',
                    render: (v: any) => toJalali(v),
                  },
                  {
                    title: 'روش',
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
                    render: (v: any) => (
                      <span style={{ fontWeight: 600, color: primaryColor }}>{formatPrice(v)}</span>
                    ),
                  },
                  {
                    title: 'توضیحات',
                    dataIndex: 'description',
                    render: (v: any) => v || '—',
                  },
                ]}
              />
            </div>
          </div>
        )}

        {/* ── Description ──────────────────────────────────────────────── */}
        {invoice.description && (
          <div style={card}>
            <div style={cardHead}>توضیحات فاکتور</div>
            <div style={cardBody}>
              <Text style={{
                ...fieldValue,
                fontWeight: 400,
                whiteSpace: 'pre-wrap',
                lineHeight: 1.9,
                display: 'block',
              }}>
                {invoice.description}
              </Text>
            </div>
          </div>
        )}

        {/* ── Confirmation ─────────────────────────────────────────────── */}
        {cfg.confirmationEnabled !== false && (
          <div style={card}>
            <div style={cardHead}>
              <SafetyCertificateOutlined />
              تایید فاکتور
            </div>
            <div style={cardBody}>
              {confirmStep === 'confirmed' || !canConfirm ? (
                confirmedAt ? (
                  <Alert
                    type="success"
                    showIcon
                    icon={<CheckCircleOutlined />}
                    message={
                      <span>
                        تایید شده توسط <strong>{confirmerName || '—'}</strong> در{' '}
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
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Text style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                    برای تایید رسمی این فاکتور، کد تایید به شماره موبایل شما ارسال می‌شود.
                  </Text>
                  <Steps
                    size="small"
                    current={confirmStep === 'idle' || confirmStep === 'select_phone' ? 0 : 1}
                    items={[{ title: 'انتخاب شماره' }, { title: 'تایید کد' }]}
                  />
                  {(confirmStep === 'idle' || confirmStep === 'select_phone') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
                        شماره موبایل برای دریافت کد تایید:
                      </Text>
                      {phoneOptions.length === 0 ? (
                        <Alert type="warning" message="شماره موبایلی برای ارسال کد تایید یافت نشد." showIcon />
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {phoneOptions.map((p) => (
                            <Button
                              key={p.value}
                              type={selectedPhoneKey === p.value ? 'primary' : 'default'}
                              size="small"
                              onClick={() => { setSelectedPhoneKey(p.value); setConfirmStep('select_phone'); }}
                            >
                              {p.label}: {p.displayPhone}
                            </Button>
                          ))}
                        </div>
                      )}
                      {selectedPhoneKey && (
                        <Button
                          type="primary"
                          loading={otpSending}
                          onClick={handleSendOtp}
                          icon={<SendOutlined />}
                          style={{ width: 'fit-content' }}
                        >
                          ارسال کد تایید
                        </Button>
                      )}
                      {otpError && <Alert type="error" message={otpError} showIcon />}
                    </div>
                  )}
                  {confirmStep === 'enter_otp' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <Text style={{ fontSize: 13 }}>
                        کد ۶ رقمی ارسال شده به{' '}
                        <strong>{phoneOptions.find((p) => p.value === selectedPhoneKey)?.displayPhone}</strong> را وارد کنید:
                      </Text>
                      <Input
                        size="large"
                        maxLength={6}
                        placeholder="کد تایید"
                        value={otpValue}
                        onChange={(e) => { setOtpValue(e.target.value); setOtpError(null); }}
                        onPressEnter={handleVerifyOtp}
                        style={{ maxWidth: 200, textAlign: 'center', letterSpacing: 4, fontSize: 20 }}
                      />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Button
                          type="primary"
                          loading={otpVerifying}
                          onClick={handleVerifyOtp}
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
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
            </div>
          </div>
        )}

        {/* ── Messaging ────────────────────────────────────────────────── */}
        {cfg.messagingEnabled !== false && (
          <div style={card}>
            <div style={cardHead}>
              <MessageOutlined />
              پیام‌ها
            </div>
            <div style={cardBody}>
              {notes.length > 0 ? (
                <Timeline
                  style={{ marginTop: 4 }}
                  items={notes.map((note) => {
                    const isExternal = note.metadata?.source === 'online_invoice';
                    const isConfirmation = note.metadata?.source === 'online_invoice_confirm';
                    return {
                      color: isConfirmation ? 'green' : isExternal ? 'blue' : primaryColor,
                      dot: isConfirmation ? <CheckCircleOutlined style={{ color: token.colorSuccess }} /> : undefined,
                      children: (
                        <div style={{
                          borderRadius: token.borderRadius,
                          padding: '8px 12px',
                          background: isExternal
                            ? hexToRgba(token.colorInfo as string, 0.06)
                            : token.colorBgLayout,
                          border: `1px solid ${token.colorBorderSecondary}`,
                          fontSize: 13,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                            <Text strong style={{ fontSize: 12 }}>{note.author_name || '—'}</Text>
                            <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
                              {toJalaliDateTime(note.created_at)}
                            </Text>
                          </div>
                          <Paragraph style={{ margin: 0, fontSize: 13 }}>{note.content}</Paragraph>
                        </div>
                      ),
                    };
                  })}
                />
              ) : (
                <Text style={{ color: token.colorTextQuaternary, fontSize: 13 }}>
                  هنوز پیامی ارسال نشده است.
                </Text>
              )}

              <Divider style={{ margin: '12px 0' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                  icon={<SendOutlined />}
                  style={{ width: 'fit-content' }}
                >
                  ارسال پیام
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', paddingTop: 16 }}>
          <Text style={{ fontSize: 11, color: token.colorTextQuaternary }}>
            این صفحه توسط {branding.brandName} ارائه شده است.
          </Text>
        </div>

      </div>
    </div>
  );
};

// ─── outer wrapper (ConfigProvider + dark mode) ───────────────────────────────

const InvoicePublicPage = () => {
  const [isDark, setIsDark] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_BRANDING.palette?.primary || '#3730A3');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <ConfigProvider
      direction="rtl"
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: primaryColor,
          fontFamily: 'Vazirmatn, sans-serif',
        },
      }}
    >
      <App>
        <InvoicePublicContent
          primaryColor={primaryColor}
          onBrandingLoad={setPrimaryColor}
        />
      </App>
    </ConfigProvider>
  );
};

export default InvoicePublicPage;
