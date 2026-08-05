import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Avatar,
  Button,
  ConfigProvider,
  Divider,
  Input,
  Modal,
  Steps,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  theme as antdTheme,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  MessageOutlined,
  PhoneOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  ShareAltOutlined,
  ShopOutlined,
  CreditCardOutlined,
  UploadOutlined,
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
import { getFinancialPaymentTypeLabelFa, getFinancialStatusLabelFa } from '../utils/financialValueLabels';
import { buildImagePreviewUrl } from '../utils/imagePreview';
import { supabasePublic } from '../supabaseClient';
import ResilientImage from '../components/common/ResilientImage';
import { buildInvoiceAdjustmentDisplay, hasInvoiceAdjustmentValue, resolveInvoiceGlobalDiscountAmount, resolveInvoiceRowBaseAmount } from '../utils/invoicePresentation';
import { FILE_STORAGE_BUCKET, fileStorageClient } from '../utils/storageClient';
import { joinStoragePath, sanitizeStorageFileName } from '../utils/storagePath';
import { normalizeRichTextHtmlForPrint } from '../utils/richText';
import RichTextContent from '../components/RichTextContent';
import { uploadFileWithProgress } from '../utils/uploadFileWithProgress';
import { parseNoteContent, resolveNoteAttachmentFileType } from '../utils/noteContent';
import SharedNoteCard from '../components/notes/SharedNoteCard';
import BrandLoadingScreen from '../components/common/BrandLoadingScreen';
import { persistLoadingBrandIdentity, resolveLoadingBrandIdentity } from '../utils/loadingBrand';
import { usePublicTimeTheme } from '../components/public/PublicThemeBoundary';
import { normalizeDigitsToEnglish } from '../utils/persianNumericInput';

const anonClient = supabasePublic;

const { Text, Title } = Typography;

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

const formatPrice = (value: number | null | undefined, currencyLabel = 'ریال') => {
  if (value == null || isNaN(Number(value))) return '—';
  return `${Math.round(Number(value)).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} ${currencyLabel}`;
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

const getPublicTableRowKey = (prefix: string, row: Record<string, any>) => {
  const candidates = [
    row?.row_key,
    row?.id,
    row?.key,
    row?.system_code,
    row?.product_id,
    row?.payment_id,
    row?.created_at,
    row?.date,
    row?.name,
    row?.title,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return `${prefix}-${normalized}`;
  }
  return `${prefix}-${JSON.stringify({
    title: row?.title,
    description: row?.description,
    quantity: row?.quantity,
    amount: row?.amount,
    unit_price: row?.unit_price,
    total_price: row?.total_price,
  })}`;
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

type PublicInvoicePaymentState = {
  available?: boolean;
  reason?: string;
  provider?: string;
  gateway_scope?: 'system' | 'org';
  amount?: number;
  currency?: 'IRR' | 'IRT';
  payment_domain?: string;
  callback_path?: string;
};

type PublicOnlinePaymentOption = {
  key: string;
  title?: string;
  amount: number;
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

type UploadingReceipt = {
  name: string;
  url: string;
  mimeType?: string | null;
  fileType?: string | null;
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

const applyBillboardTitles = (invoiceData: InvoiceData, titles: any) => {
  const rows = Array.isArray(titles) ? titles : [];
  if (!rows.some((item: any) => String(item?.title || '').trim())) return invoiceData;
  return {
    ...invoiceData,
    items: (invoiceData.items || []).map((item, index) => ({
      ...item,
      product_name: String(rows[index]?.title || '').trim() || item.product_name,
    })),
  };
};

// ─── inner content component ─────────────────────────────────────────────────

type ContentProps = {
  primaryColor: string;
  onBrandingLoad: (color: string) => void;
};

const InvoicePublicContent = ({ primaryColor, onBrandingLoad }: ContentProps) => {
  const { token } = antdTheme.useToken();
  const { message: antMessage } = App.useApp();
  const { code: rawCode } = useParams<{ code: string }>();
  // برخی سرویس‌های پیامکی رقم‌های لینک را فارسی یا عربی می‌کنند. کد عمومی
  // باید پیش از درخواست به همان شکل لاتین ذخیره‌شده در پایگاه داده برگردد.
  const code = normalizeDigitsToEnglish(rawCode || '').trim();

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
  const [pendingAttachments, setPendingAttachments] = useState<UploadingReceipt[]>([]);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null);
  const [paymentState, setPaymentState] = useState<PublicInvoicePaymentState | null>(null);
  const [onlinePaymentOptions, setOnlinePaymentOptions] = useState<PublicOnlinePaymentOption[]>([]);
  const [paymentStarting, setPaymentStarting] = useState(false);
  const [paymentChoiceOpen, setPaymentChoiceOpen] = useState(false);
  const [selectedPendingPaymentKey, setSelectedPendingPaymentKey] = useState<string | null>(null);

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
        const [{ data: result, error: rpcErr }, { data: billboardTitles }] = await Promise.all([
          anonClient.rpc('get_public_invoice', { p_system_code: code, p_module: moduleId }),
          anonClient.rpc('get_public_invoice_billboard_titles', { p_system_code: code, p_module: moduleId }),
        ]);
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

        const invData = applyBillboardTitles(result as InvoiceData, billboardTitles);
        setData(invData);
        setNotes(invData.notes || []);
        setPaymentState(null);
        setOnlinePaymentOptions([]);
        if (moduleId === 'invoices') {
          void Promise.all([
            anonClient.rpc('get_public_invoice_payment_state', {
              p_system_code: code,
              p_module: moduleId,
            }),
            anonClient.rpc('get_public_invoice_online_payment_options', {
              p_system_code: code,
              p_module: moduleId,
            }),
          ])
            .then(([{ data: paymentResult }, { data: paymentOptions }]: any[]) => {
              if (!cancelled && paymentResult && typeof paymentResult === 'object') {
                setPaymentState(paymentResult as PublicInvoicePaymentState);
              }
              if (!cancelled && Array.isArray(paymentOptions)) {
                setOnlinePaymentOptions(paymentOptions as PublicOnlinePaymentOption[]);
              }
            })
            .catch(() => {
              if (!cancelled) {
                setPaymentState(null);
                setOnlinePaymentOptions([]);
              }
            });
        }

        const bs = invData.branding?.branding_settings as Record<string, any> | undefined;
        const cs = invData.branding?.company_settings as Record<string, any> | undefined;
        persistLoadingBrandIdentity(resolveLoadingBrandIdentity(cs));

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
    if ((!messageText.trim() && pendingAttachments.length === 0) || !data) return;
    const authorName = counterpartyName;
    setMessageSending(true);
    const { data: result, error: rpcErr } = await anonClient.rpc('insert_public_invoice_note', {
      p_system_code: code,
      p_module: moduleId,
      p_content: messageText.trim(),
      p_author_name: authorName,
      p_attachments: pendingAttachments,
    });
    setMessageSending(false);
    if (rpcErr || result?.error) {
      antMessage.error('ارسال پیام ناموفق بود.');
      return;
    }
    const newNote: PublicNote = {
      id: result.id || Date.now().toString(),
      content: pendingAttachments.length > 0
        ? JSON.stringify({ text: messageText.trim(), attachments: pendingAttachments })
        : messageText.trim(),
      author_name: authorName,
      created_at: new Date().toISOString(),
      reply_to: null,
      metadata: { source: 'online_invoice' },
    };
    setNotes((prev) => [...prev, newNote]);
    setMessageText('');
    setPendingAttachments([]);
    antMessage.success('پیام ارسال شد.');
  };

  const handleCopyValue = async (rawValue: string | null | undefined, successLabel: string) => {
    const value = String(rawValue || '').trim();
    if (!value) return;
    await navigator.clipboard.writeText(value);
    antMessage.success(successLabel);
  };

  const buildReceiptMessage = () => {
    const invoiceTitle = String(invoice.name || 'بدون عنوان').trim() || 'بدون عنوان';
    const invoiceCode = String(invoice.system_code || '—').trim() || '—';
    const uploadedAt = toJalaliDateTime(new Date().toISOString());
    return `ثبت رسید واریزی برای فاکتور "${invoiceTitle}" به شماره "${invoiceCode}" در تاریخ "${uploadedAt}"`;
  };

  const handleReceiptUpload = async (file: File) => {
    if (!code) return false;
    setReceiptUploading(true);
    try {
      const finalName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${sanitizeStorageFileName(file.name || 'receipt')}`;
      const filePath = joinStoragePath('record_files', 'public_invoices', moduleId, code, 'receipts', finalName);
      await uploadFileWithProgress({
        client: fileStorageClient,
        bucket: FILE_STORAGE_BUCKET,
        path: filePath,
        file,
        label: file.name || 'رسید واریز',
        detail: 'رسید واریز',
      });
      const publicUrl = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath).data.publicUrl || '';
      const normalizedUrl = normalizePublicAssetUrl(publicUrl) || publicUrl;
      const nextAttachment: UploadingReceipt = {
        name: file.name || 'receipt',
        url: normalizedUrl,
        mimeType: file.type || null,
        fileType: resolveNoteAttachmentFileType({ name: file.name, url: normalizedUrl, mimeType: file.type || null }),
      };
      setPendingAttachments([nextAttachment]);
      setMessageText(buildReceiptMessage());
      antMessage.success('رسید واریز آماده ثبت شد.');
    } catch {
      antMessage.error('آپلود رسید واریز ناموفق بود.');
    } finally {
      setReceiptUploading(false);
    }
    return false;
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
      const rowBaseAmount = resolveInvoiceRowBaseAmount(row);
      const discountDisplay = buildInvoiceAdjustmentDisplay({
        value: row.discount,
        type: row.discount_type,
        baseAmount: rowBaseAmount,
        currencyLabel,
      });
      const vatDisplay = buildInvoiceAdjustmentDisplay({
        value: row.vat,
        type: row.vat_type,
        baseAmount: Math.max(0, rowBaseAmount - discountDisplay.amount),
        currencyLabel,
      });
      return `
        <tr>
          <td style="border:1px solid #d1d5db;padding:4px 5px;text-align:center;">${toFarsiDigits(String(idx + 1))}</td>
          <td style="border:1px solid #d1d5db;padding:4px 5px;word-break:break-word;">
            <div style="font-weight:700;">${row.product_name || '—'}</div>
            ${subLine ? `<div style="font-size:9px;color:#64748b;margin-top:2px;">${subLine}</div>` : ''}
            ${desc ? `<div class="rich-text-print" style="font-size:9px;color:#64748b;white-space:normal;">${normalizeRichTextHtmlForPrint(desc)}</div>` : ''}
          </td>
          <td style="border:1px solid #d1d5db;padding:4px 5px;text-align:center;">
            ${formatNumber(row.quantity)}
            ${row.main_unit ? `<div style="font-size:9px;color:#64748b;">${row.main_unit}</div>` : ''}
          </td>
          <td style="border:1px solid #d1d5db;padding:4px 5px;">${formatPrice(row.unit_price, currencyLabel)}</td>
          ${cfg.showDiscount !== false ? `<td style="border:1px solid #d1d5db;padding:4px 5px;">${discountDisplay.hasValue ? `<div>${discountDisplay.primaryText}</div>${discountDisplay.secondaryText ? `<div style="font-size:9px;color:#64748b;margin-top:2px;">${discountDisplay.secondaryText}</div>` : ''}` : '—'}</td>` : ''}
          ${cfg.showVat !== false ? `<td style="border:1px solid #d1d5db;padding:4px 5px;">${vatDisplay.hasValue ? `<div>${vatDisplay.primaryText}</div>${vatDisplay.secondaryText ? `<div style="font-size:9px;color:#64748b;margin-top:2px;">${vatDisplay.secondaryText}</div>` : ''}` : '—'}</td>` : ''}
          <td style="border:1px solid #d1d5db;padding:4px 5px;font-weight:700;color:${pc};">${formatPrice(row.total_price, currencyLabel)}</td>
        </tr>`;
    }).join('');

    const paymentsRows = (cfg.showPaymentsTable !== false && data?.payments?.length)
      ? (data.payments).map((p: Record<string, any>) => `
        <tr>
          <td style="border:1px solid #d1d5db;padding:3px 5px;">${toJalali(p.date)}</td>
          <td style="border:1px solid #d1d5db;padding:3px 5px;">${PAYMENT_TYPE_LABELS[p.payment_type] || getFinancialPaymentTypeLabelFa(p.payment_type, '—')}</td>
          <td style="border:1px solid #d1d5db;padding:3px 5px;font-weight:600;color:${pc};">${formatPrice(p.amount, currencyLabel)}</td>
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
  body { margin: 0; font-family: Peyda, Tahoma, Arial, sans-serif; font-size: 11px; color: #111827; direction: rtl; background: #fff; }
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
      <div style="margin-top:4px;"><span style="background:${pc};color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;">${STATUS_LABELS[invoice.status]?.label || getFinancialStatusLabelFa(invoice.status)}</span></div>
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
    ${globalDiscountDisplay.hasValue && globalDiscountAmount > 0 ? `
    <tr style="background:rgba(245,158,11,0.08);">
      <td colspan="${4 + (cfg.showDiscount !== false ? 1 : 0) + (cfg.showVat !== false ? 1 : 0)}" style="border:1px solid #d1d5db;padding:5px;font-weight:700;">تخفیف کل</td>
      <td style="border:1px solid #d1d5db;padding:5px;">
        <div style="font-weight:700;color:#b45309;">${globalDiscountDisplay.primaryText}</div>
        ${globalDiscountDisplay.secondaryText ? `<div style="font-size:9px;color:#64748b;">${globalDiscountDisplay.secondaryText}</div>` : ''}
      </td>
    </tr>` : ''}
    <tr style="background:rgba(0,0,0,0.04);">
      <td colspan="${4 + (cfg.showDiscount !== false ? 1 : 0) + (cfg.showVat !== false ? 1 : 0)}" style="border:1px solid #d1d5db;padding:5px;font-weight:800;">جمع کل فاکتور</td>
      <td style="border:1px solid #d1d5db;padding:5px;font-weight:800;color:${pc};">${formatPrice(invoice.total_invoice_amount, currencyLabel)}</td>
    </tr>
  </tbody>
</table>` : ''}

<!-- Financial -->
<table style="margin-bottom:7px;" class="section">
  <tbody><tr>
    <td style="border:1px solid #e5e7eb;padding:7px 10px;text-align:center;width:33%;">
      <div style="font-size:9px;color:#6b7280;">مبلغ کل</div>
      <div style="font-weight:800;font-size:13px;color:${pc};">${formatPrice(invoice.total_invoice_amount, currencyLabel)}</div>
    </td>
    <td style="border:1px solid #e5e7eb;border-right:none;padding:7px 10px;text-align:center;width:33%;">
      <div style="font-size:9px;color:#6b7280;">${isSales ? 'دریافت شده' : 'پرداخت شده'}</div>
      <div style="font-weight:700;font-size:12px;color:#16a34a;">${formatPrice(invoice.total_received_amount, currencyLabel)}</div>
    </td>
    <td style="border:1px solid #e5e7eb;border-right:none;padding:7px 10px;text-align:center;width:33%;">
      <div style="font-size:9px;color:#6b7280;">مانده</div>
      <div style="font-weight:700;font-size:12px;color:#dc2626;">${formatPrice(invoice.remaining_balance, currencyLabel)}</div>
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
    <td class="rich-text-print" style="border:1px solid #e5e7eb;border-right:none;padding:6px 8px;white-space:normal;">${normalizeRichTextHtmlForPrint(invoice.description)}</td>
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
    const publicPath = String(invoice.public_link || '').trim();
    const url = publicPath ? `${window.location.origin}${publicPath}` : window.location.href;
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
  const hasItemImages = useMemo(
    () => items.some((item) => Boolean(String(item?.image_url || '').trim())),
    [items],
  );
  const payments = data?.payments || [];
  const companySt = data?.branding?.company_settings as Record<string, any> | undefined;
  const currencyLabel = String(companySt?.currency_label || 'ریال').trim() || 'ریال';
  const paymentAccount = invoice.payment_account as Record<string, any> | undefined;
  const paymentAccountModule = String(invoice.payment_account_module || '').trim();
  const counterpartyName = String(
    isSales ? (invoice.customer_name || 'مشتری') : (invoice.supplier_name || 'تامین‌کننده')
  ).trim();
  const itemsSubtotalForGlobalDiscount = items.reduce((sum: number, row: any) => {
    const total = Number(row?.total_price ?? 0);
    return sum + (Number.isFinite(total) ? total : 0);
  }, 0);
  const globalDiscountDisplay = buildInvoiceAdjustmentDisplay({
    value: invoice.global_discount_value,
    type: invoice.global_discount_type,
    baseAmount: itemsSubtotalForGlobalDiscount,
    currencyLabel,
  });
  const globalDiscountAmount = resolveInvoiceGlobalDiscountAmount(
    itemsSubtotalForGlobalDiscount,
    invoice.global_discount_value,
    invoice.global_discount_type,
  );

  const invoiceStatus = String(invoice.status || '');
  const statusInfo = STATUS_LABELS[invoiceStatus] || { label: getFinancialStatusLabelFa(invoiceStatus), color: 'default' };
  const canConfirm = ['created', 'proforma'].includes(invoiceStatus);
  const confirmedAt = isSales ? invoice.customer_confirmed_at : invoice.supplier_confirmed_at;
  const confirmerName = isSales ? invoice.customer_confirmer_name : invoice.supplier_confirmer_name;
  const payableAmount = Math.max(0, Number(paymentState?.amount ?? invoice.remaining_balance ?? 0) || 0);
  const onlinePaymentAvailable = isSales && paymentState?.available === true && payableAmount > 0;

  const pendingPaymentOptions = useMemo(
    () => onlinePaymentOptions
      .map((payment) => ({
        key: String(payment?.key || '').trim(),
        title: String(payment?.title || 'دریافت آنلاین در انتظار').trim(),
        amount: Math.min(payableAmount, Math.max(0, Number(payment?.amount || 0))),
      }))
      .filter((item) => item.key && item.amount > 0),
    [onlinePaymentOptions, payableAmount]
  );
  const selectedPendingPayment = pendingPaymentOptions.find((item) => item.key === selectedPendingPaymentKey) || null;
  const selectedPaymentAmount = selectedPendingPayment?.amount || payableAmount;
  const remainingAfterSelectedPayment = Math.max(0, payableAmount - selectedPaymentAmount);

  const handleStartOnlinePayment = async (pendingPaymentRowKey: string | null = null) => {
    if (!code || !onlinePaymentAvailable) return;
    setPaymentStarting(true);
    try {
      const { data: paymentResult, error: paymentError } = await anonClient.functions.invoke('payment-gateway', {
        body: {
          action: 'create_invoice_payment',
          system_code: code,
          module: moduleId,
          return_origin: window.location.origin,
          pending_payment_row_key: pendingPaymentRowKey || undefined,
        },
      });
      if (paymentError || paymentResult?.success === false) {
        throw new Error(String(paymentResult?.message || 'شروع پرداخت آنلاین ناموفق بود.'));
      }
      const paymentUrl = String(paymentResult?.payment_url || paymentResult?.start_url || '').trim();
      if (!paymentUrl) throw new Error('آدرس پرداخت از درگاه دریافت نشد.');
      window.location.assign(paymentUrl);
    } catch (err: any) {
      antMessage.error(err?.message || 'شروع پرداخت آنلاین ناموفق بود.');
    } finally {
      setPaymentStarting(false);
    }
  };

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
    return <BrandLoadingScreen branding={branding} message="در حال بارگذاری فاکتور…" />;
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
        fontFamily: 'Peyda, Tahoma, Arial, sans-serif',
        paddingBottom: onlinePaymentAvailable ? 92 : 0,
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
              forcePreviewTransform
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
                rowKey={(row) => getPublicTableRowKey('invoice-item', row)}
                pagination={false}
                size="small"
                style={{ direction: 'rtl' }}
                columns={[
                  ...(hasItemImages ? [{
                    title: 'تصویر',
                    dataIndex: 'image_url',
                    width: 76,
                    render: (v: any, row: any) => {
                      const imageUrl = String(v || '').trim();
                      if (!imageUrl) {
                        return <span style={{ color: token.colorTextQuaternary, fontSize: 11 }}>—</span>;
                      }
                      const productTitle = String(row?.product_name || 'تصویر کالا').trim() || 'تصویر کالا';
                      return (
                        <button
                          type="button"
                          onClick={() => setPreviewImage({ src: imageUrl, title: productTitle })}
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 10,
                            overflow: 'hidden',
                            border: `1px solid ${token.colorBorderSecondary}`,
                            padding: 0,
                            background: token.colorBgContainer,
                            cursor: 'pointer',
                          }}
                          title="نمایش بزرگ‌تر تصویر"
                        >
                          <ResilientImage
                            src={imageUrl}
                            preset="thumb"
                            forcePreviewTransform
                            alt={productTitle}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      );
                    },
                  }] : []),
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
                              <RichTextContent value={row.description} />
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
                      <span style={{ fontSize: 12 }}>{formatPrice(v, currencyLabel)}</span>
                    ),
                  },
                  ...(cfg.showDiscount !== false ? [{
                    title: 'تخفیف',
                    dataIndex: 'discount',
                    render: (v: any, row: any) => {
                      const discountDisplay = buildInvoiceAdjustmentDisplay({
                        value: v,
                        type: row?.discount_type,
                        baseAmount: resolveInvoiceRowBaseAmount(row),
                        currencyLabel,
                      });
                      return discountDisplay.hasValue ? (
                        <div style={{ color: token.colorError, fontSize: 12, lineHeight: 1.7 }}>
                          <div>{discountDisplay.primaryText}</div>
                          {discountDisplay.secondaryText ? (
                            <div style={{ fontSize: 10, color: token.colorTextTertiary }}>{discountDisplay.secondaryText}</div>
                          ) : null}
                        </div>
                      ) : <span style={{ color: token.colorTextQuaternary }}>—</span>;
                    },
                  }] : []),
                  ...(cfg.showVat !== false ? [{
                    title: 'مالیات',
                    dataIndex: 'vat',
                    render: (v: any, row: any) => {
                      const discountAmount = buildInvoiceAdjustmentDisplay({
                        value: row?.discount,
                        type: row?.discount_type,
                        baseAmount: resolveInvoiceRowBaseAmount(row),
                        currencyLabel,
                      }).amount;
                      const vatDisplay = buildInvoiceAdjustmentDisplay({
                        value: v,
                        type: row?.vat_type,
                        baseAmount: Math.max(0, resolveInvoiceRowBaseAmount(row) - discountAmount),
                        currencyLabel,
                      });
                      return vatDisplay.hasValue ? (
                        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                          <div>{vatDisplay.primaryText}</div>
                          {vatDisplay.secondaryText ? (
                            <div style={{ fontSize: 10, color: token.colorTextTertiary }}>{vatDisplay.secondaryText}</div>
                          ) : null}
                        </div>
                      ) : <span style={{ color: token.colorTextQuaternary }}>—</span>;
                    },
                  }] : []),
                  {
                    title: 'جمع ردیف',
                    dataIndex: 'total_price',
                    render: (v: any) => (
                      <span style={{ fontWeight: 700, color: primaryColor, fontSize: 12 }}>
                        {formatPrice(v, currencyLabel)}
                      </span>
                    ),
                  },
                ]}
                summary={() => {
                  // ردیف + کالا/شرح + تعداد + قیمت واحد، به‌همراه ستون تصویر در صورت وجود آن
                  const labelSpan =
                    4 +
                    (hasItemImages ? 1 : 0) +
                    (cfg.showDiscount !== false ? 1 : 0) +
                    (cfg.showVat !== false ? 1 : 0);
                  return (
                    <>
                      {globalDiscountDisplay.hasValue && hasInvoiceAdjustmentValue(invoice.global_discount_value) ? (
                        <Table.Summary.Row style={{ background: hexToRgba('#f59e0b', 0.08) }}>
                          <Table.Summary.Cell index={0} colSpan={labelSpan}>
                            <Text strong style={{ color: '#b45309' }}>تخفیف کل</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={labelSpan} colSpan={1}>
                            <div style={{ lineHeight: 1.7 }}>
                              <Text strong style={{ color: '#b45309', fontSize: 13 }}>{globalDiscountDisplay.primaryText}</Text>
                              {globalDiscountDisplay.secondaryText ? (
                                <div style={{ fontSize: 10, color: token.colorTextTertiary }}>{globalDiscountDisplay.secondaryText}</div>
                              ) : null}
                            </div>
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      ) : null}
                      <Table.Summary.Row style={{ background: hexToRgba(primaryColor, 0.05) }}>
                        <Table.Summary.Cell index={0} colSpan={labelSpan}>
                          <Text strong style={{ color: token.colorText }}>جمع کل فاکتور</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={labelSpan} colSpan={1}>
                          <Text strong style={{ color: primaryColor, fontSize: 14 }}>
                            {formatPrice(invoice.total_invoice_amount, currencyLabel)}
                          </Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </>
                  );
                }}
              />
            </div>
          </div>
        )}

        {/* ── Financial Summary ────────────────────────────────────────── */}
        <div style={card}>
          <div style={cardHead}>خلاصه مالی</div>
          <div style={cardBody}>
            {globalDiscountDisplay.hasValue && hasInvoiceAdjustmentValue(invoice.global_discount_value) ? (
              <div style={{
                marginBottom: 12,
                padding: '10px 12px',
                borderRadius: token.borderRadius,
                background: hexToRgba('#f59e0b', 0.08),
                border: `1px solid ${hexToRgba('#f59e0b', 0.18)}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary }}>تخفیف کل</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#b45309' }}>{globalDiscountDisplay.primaryText}</div>
                </div>
                {globalDiscountDisplay.secondaryText ? (
                  <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{globalDiscountDisplay.secondaryText}</div>
                ) : null}
              </div>
            ) : null}
            <div style={{
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
                {formatPrice(invoice.total_invoice_amount, currencyLabel)}
              </div>
            </div>
            <div style={{
              padding: '12px 16px',
              borderLeft: `1px solid ${token.colorBorderSecondary}`,
              textAlign: 'center' as const,
            }}>
              <div style={fieldLabel}>{isSales ? 'دریافت شده' : 'پرداخت شده'}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: token.colorSuccess }}>
                {formatPrice(invoice.total_received_amount, currencyLabel)}
              </div>
            </div>
            <div style={{ padding: '12px 16px', textAlign: 'center' as const }}>
              <div style={fieldLabel}>مانده</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: token.colorError }}>
                {formatPrice(invoice.remaining_balance, currencyLabel)}
              </div>
            </div>
          </div>
          </div>
        </div>

        {paymentAccountModule === 'bank_accounts' && paymentAccount && (paymentAccount.card_number || paymentAccount.shaba || paymentAccount.account_number) ? (
          <div style={card}>
            <div style={cardHead}>شماره حساب جهت واریز وجه</div>
            <div style={cardBody}>
              <div style={{ marginBottom: 10, color: token.colorTextSecondary, lineHeight: 1.9 }}>
                بنام <strong style={{ color: token.colorText }}>{paymentAccount.account_holder_name || '—'}</strong>
                {' '}نزد بانک <strong style={{ color: token.colorText }}>{paymentAccount.bank_name || '—'}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {[
                  { key: 'card_number', label: 'شماره کارت', value: paymentAccount.card_number },
                  { key: 'shaba', label: 'شماره شبا', value: paymentAccount.shaba },
                  { key: 'account_number', label: 'شماره حساب', value: paymentAccount.account_number },
                ].map((item) => item.value ? (
                  <div
                    key={item.key}
                    style={{
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: token.borderRadius,
                      padding: '10px 12px',
                      background: token.colorBgLayout,
                    }}
                  >
                    <div style={{ ...fieldLabel, marginBottom: 6 }}>{item.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text strong style={{ fontSize: 14 }}>{toFarsiDigits(String(item.value))}</Text>
                      <Tooltip title="کپی">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => void handleCopyValue(String(item.value), `${item.label} کپی شد.`)}
                        />
                      </Tooltip>
                    </div>
                  </div>
                ) : null)}
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: token.colorTextTertiary, lineHeight: 1.9 }}>
                لطفا پس از واریز، حتما رسید واریز را برای ما ارسال نمایید. در انتهای همین صفحه هم می‌توانید رسید واریزی را آپلود نمایید.
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Payments Table ───────────────────────────────────────────── */}
        {cfg.showPaymentsTable !== false && payments.length > 0 && (
          <div style={card}>
            <div style={cardHead}>
              {isSales ? 'جدول دریافت‌ها' : 'جدول پرداخت‌ها'}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <Table
                dataSource={payments}
                rowKey={(row) => getPublicTableRowKey('invoice-payment', row)}
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
                    render: (v: any) => PAYMENT_TYPE_LABELS[v] || getFinancialPaymentTypeLabelFa(v, '—'),
                  },
                  {
                    title: 'وضعیت',
                    dataIndex: 'status',
                    render: (v: any) => {
                      const s = PAYMENT_STATUS_LABELS[v];
                      if (s) return <Tag color={s.color}>{s.label}</Tag>;
                      return getFinancialStatusLabelFa(v, '—');
                    },
                  },
                  {
                    title: 'مبلغ',
                    dataIndex: 'amount',
                    render: (v: any) => (
                      <span style={{ fontWeight: 600, color: primaryColor }}>{formatPrice(v, currencyLabel)}</span>
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
              <RichTextContent value={invoice.description} className="invoice-public-rich-text" />
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
                  <Alert
                    type="info"
                    showIcon
                    message={`اینجانب "${counterpartyName}"، توضیحات و قوانین را مطالعه و تایید می‌نمایم.`}
                  />
                  <Text style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                    برای تایید رسمی این فاکتور، کد تایید به شماره موبایل شما ارسال می‌شود.
                  </Text>
                  {confirmStep === 'idle' ? (
                    <Button
                      type="primary"
                      size="large"
                      icon={<SafetyCertificateOutlined />}
                      onClick={() => setConfirmStep('select_phone')}
                      style={{ width: 'fit-content', fontWeight: 700 }}
                    >
                      تایید فاکتور
                    </Button>
                  ) : null}
                  {confirmStep !== 'idle' ? (
                    <Steps
                      size="small"
                      current={confirmStep === 'select_phone' ? 0 : 1}
                      items={[{ title: 'انتخاب شماره' }, { title: 'تایید کد' }]}
                    />
                  ) : null}
                  {confirmStep === 'select_phone' && (
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
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Button
                            type="primary"
                            loading={otpSending}
                            onClick={handleSendOtp}
                            icon={<SendOutlined />}
                            style={{ width: 'fit-content' }}
                          >
                            ارسال کد تایید
                          </Button>
                          <Button onClick={() => setConfirmStep('idle')}>بازگشت</Button>
                        </div>
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
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {notes.map((note) => {
                    const parsed = parseNoteContent(note.content);
                    const sourceLabel = note.metadata?.source === 'online_invoice_confirm'
                      ? 'تایید فاکتور'
                      : note.metadata?.source === 'online_invoice'
                        ? 'فاکتور آنلاین'
                        : undefined;
                    return (
                      <SharedNoteCard
                        key={note.id || `${note.created_at}-${note.author_name}`}
                        authorName={note.author_name || '—'}
                        createdAtLabel={toJalaliDateTime(note.created_at)}
                        text={parsed.text}
                        attachments={parsed.attachments}
                        sourceLabel={sourceLabel}
                        onAttachmentClick={async (attachment) => {
                          const url = String(attachment?.url || '').trim();
                          if (!url) return;
                          if (String(attachment?.fileType || '').trim() === 'image') {
                            setPreviewImage({ src: url, title: attachment.name || 'پیوست' });
                            return;
                          }
                          window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                      />
                    );
                  })}
                </div>
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
                  maxLength={4000}
                  showCount
                />
                {pendingAttachments.length > 0 ? (
                  <div style={{
                    border: `1px dashed ${token.colorBorderSecondary}`,
                    borderRadius: token.borderRadius,
                    padding: '10px 12px',
                    background: token.colorBgLayout,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}>
                    <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                      فایل آماده ارسال:
                      {' '}
                      <strong style={{ color: token.colorText }}>{pendingAttachments[0]?.name || 'رسید واریز'}</strong>
                    </div>
                    <Button size="small" onClick={() => setPendingAttachments([])}>
                      حذف فایل
                    </Button>
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Upload
                    showUploadList={false}
                    accept="image/*,.pdf,.zip,.rar,.doc,.docx,.xls,.xlsx"
                    beforeUpload={handleReceiptUpload}
                    disabled={receiptUploading}
                  >
                    <Button loading={receiptUploading} icon={<UploadOutlined />}>
                      ثبت رسید واریز
                    </Button>
                  </Upload>
                  <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
                    در پایین صفحه، می توانید تصویر رسید واریزی را بارگزاری نمایید.
                  </Text>
                </div>
                <Button
                  type="primary"
                  loading={messageSending}
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() && pendingAttachments.length === 0}
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

        <Modal
          open={Boolean(previewImage)}
          footer={null}
          onCancel={() => setPreviewImage(null)}
          title={previewImage?.title || 'پیش نمایش'}
          width={720}
        >
          {previewImage ? (
            <ResilientImage
              src={previewImage.src}
              preset="gallery"
              alt={previewImage.title}
              className="max-h-[75vh] w-full rounded-xl object-contain"
            />
          ) : null}
        </Modal>

      </div>
      {onlinePaymentAvailable ? (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            background: token.colorBgContainer,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            boxShadow: '0 -12px 32px rgba(15,23,42,0.14)',
            padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div
            style={{
              maxWidth: 760,
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: token.colorTextTertiary }}>مبلغ قابل پرداخت</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: token.colorText }}>
                {formatPrice(payableAmount, currencyLabel)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, minWidth: 180, maxWidth: '100%' }}>
              {pendingPaymentOptions.length > 0 ? (
                <Text style={{ fontSize: 11, color: primaryColor, fontWeight: 700, textAlign: 'center' }}>
                  امکان پیش‌پرداخت وجود دارد
                </Text>
              ) : null}
              <Button
                type="primary"
                size="large"
                icon={<CreditCardOutlined />}
                loading={paymentStarting}
                onClick={() => pendingPaymentOptions.length > 0 ? setPaymentChoiceOpen(true) : void handleStartOnlinePayment()}
                style={{ width: '100%', fontWeight: 800, background: primaryColor }}
              >
                پرداخت سریع
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <Modal
        open={paymentChoiceOpen}
        onCancel={() => setPaymentChoiceOpen(false)}
        footer={null}
        title="انتخاب مبلغ پرداخت آنلاین"
      >
        <div className="space-y-3">
          <Alert type="info" showIcon message="می‌توانید یک دریافت در انتظار را به‌عنوان پیش‌پرداخت پرداخت کنید یا کل مانده فاکتور را تسویه کنید." />
          {pendingPaymentOptions.map((option) => {
            const selected = selectedPendingPaymentKey === option.key;
            return (
              <button key={option.key} type="button" onClick={() => setSelectedPendingPaymentKey(option.key)} className={`w-full rounded-xl border p-3 text-right transition-colors ${selected ? 'border-leather-500 bg-leather-50 dark:bg-leather-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center justify-between gap-3"><span className="font-bold">مبلغ قابل پیش پرداخت</span><span className="font-black">{formatPrice(option.amount, currencyLabel)}</span></div>
                <div className="mt-1 text-xs text-gray-500">پرداخت این ردیف به‌عنوان پیش‌پرداخت ثبت می‌شود.</div>
              </button>
            );
          })}
          <button type="button" onClick={() => setSelectedPendingPaymentKey(null)} className={`w-full rounded-xl border p-3 text-right transition-colors ${selectedPendingPaymentKey === null ? 'border-leather-500 bg-leather-50 dark:bg-leather-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between gap-3"><span className="font-bold">تسویه کامل فاکتور</span><span className="font-black">{formatPrice(payableAmount, currencyLabel)}</span></div>
            <div className="mt-1 text-xs text-gray-500">کل مانده فاکتور در این پرداخت تسویه می‌شود.</div>
          </button>
          <div className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-white/5">
            <div className="flex justify-between"><span>مبلغ نهایی قابل پرداخت</span><strong>{formatPrice(selectedPaymentAmount, currencyLabel)}</strong></div>
            <div className="mt-2 flex justify-between text-gray-500"><span>مانده فاکتور پس از این پرداخت</span><span>{formatPrice(remainingAfterSelectedPayment, currencyLabel)}</span></div>
          </div>
          <Button block type="primary" size="large" icon={<CreditCardOutlined />} loading={paymentStarting} onClick={() => void handleStartOnlinePayment(selectedPendingPaymentKey)} style={{ background: primaryColor, fontWeight: 900 }}>
            اتصال به درگاه پرداخت
          </Button>
        </div>
      </Modal>
    </div>
  );
};

// ─── outer wrapper (ConfigProvider + dark mode) ───────────────────────────────

const InvoicePublicPage = () => {
  const isDark = usePublicTimeTheme();
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_BRANDING.palette?.primary || '#3730A3');

  return (
    <ConfigProvider
      direction="rtl"
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: primaryColor,
          fontFamily: 'Peyda, Tahoma, Arial, sans-serif',
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
