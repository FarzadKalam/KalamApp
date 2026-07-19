import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Avatar,
  Button,
  ConfigProvider,
  Input,
  Modal,
  Spin,
  Steps,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme as antdTheme,
} from 'antd';
import {
  CheckCircleOutlined,
  FileOutlined,
  InboxOutlined,
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
import { isImageFileLike } from '../utils/imagePreview';
import { supabasePublic } from '../supabaseClient';
import ResilientImage from '../components/common/ResilientImage';

const { Text, Title } = Typography;
const anonClient = supabasePublic;

type PartyKey = 'delivered_by' | 'received_by';
type ConfirmStep = 'idle' | 'select_phone' | 'enter_otp' | 'confirmed';

type PhoneOption = {
  label: string;
  value: string;
  phone: string;
};

type DeliveryFile = {
  id?: string;
  url: string;
  name?: string | null;
  file_type?: string | null;
  mime_type?: string | null;
};

type DeliveryPublicData = {
  delivery: Record<string, any>;
  items: Record<string, any>[];
  files: DeliveryFile[];
  branding: {
    branding_settings?: Record<string, any>;
    company_settings?: Record<string, any>;
  };
  phone_options: Record<PartyKey, PhoneOption[]>;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'پیش‌نویس', color: 'default' },
  pending_signature: { label: 'در انتظار امضا', color: 'orange' },
  signed: { label: 'امضا شده', color: 'blue' },
  confirmed: { label: 'تایید شده', color: 'green' },
  archived: { label: 'بایگانی', color: 'gray' },
  canceled: { label: 'لغو شده', color: 'red' },
};

const FORM_TYPE_LABELS: Record<string, string> = {
  goods_delivery: 'تحویل کالا',
  goods_receipt: 'رسید کالا',
  document_delivery: 'تحویل سند',
  document_receipt: 'رسید سند',
  asset_delivery: 'تحویل دارایی',
  other: 'سایر',
};

const toFarsiDigits = (value: string): string =>
  String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);

const normalizePhone = (raw: string): string => {
  let digits = String(raw || '').replace(/[^\d۰-۹]/g, '');
  digits = digits.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('98') && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
  return digits;
};

const getDeliveryTableRowKey = (row: Record<string, any>) => {
  const candidates = [
    row?.row_key,
    row?.id,
    row?.key,
    row?.system_code,
    row?.product_id,
    row?.created_at,
    row?.title,
    row?.name,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return `delivery-item-${normalized}`;
  }
  return `delivery-item-${JSON.stringify({
    title: row?.title,
    quantity: row?.quantity,
    unit: row?.unit,
    description: row?.description,
  })}`;
};

const formatPhoneDisplay = (raw: string | null | undefined): string => {
  const normalized = normalizePhone(String(raw || ''));
  return normalized ? toFarsiDigits(normalized) : '—';
};

const toJalaliDateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new DateObject({ date, calendar: gregorian, locale: gregorian_en })
      .convert(persian, persian_fa)
      .format('YYYY/MM/DD HH:mm');
  } catch {
    return String(value);
  }
};

const hexToRgba = (hex: string, alpha: number) => {
  const clean = String(hex || '#3730A3').replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r || 55},${g || 48},${b || 163},${alpha})`;
};

const buildFullPublicUrl = (path: string) => {
  if (!path) return window.location.href;
  if (/^https?:\/\//i.test(path)) return path;
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
};

const dedupeFiles = (files: DeliveryFile[]) => {
  const seen = new Set<string>();
  return (files || []).filter((file) => {
    const url = String(file?.url || '').trim();
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
};

const renderItemTitle = (row: Record<string, any>) =>
  String(row?.product_name || row?.title || row?.name || row?.description || 'قلم تحویلی').trim();

type ConfirmationBoxProps = {
  party: PartyKey;
  title: string;
  partyName: string;
  confirmedAt?: string | null;
  confirmerName?: string | null;
  phoneOptions: PhoneOption[];
  step: ConfirmStep;
  selectedPhoneKey: string | null;
  otpValue: string;
  otpSending: boolean;
  otpVerifying: boolean;
  otpError: string | null;
  canConfirm: boolean;
  onStart: () => void;
  onBack: () => void;
  onSelectPhone: (value: string) => void;
  onOtpChange: (value: string) => void;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
};

const ConfirmationBox = ({
  title,
  partyName,
  confirmedAt,
  confirmerName,
  phoneOptions,
  step,
  selectedPhoneKey,
  otpValue,
  otpSending,
  otpVerifying,
  otpError,
  canConfirm,
  onStart,
  onBack,
  onSelectPhone,
  onOtpChange,
  onSendOtp,
  onVerifyOtp,
}: ConfirmationBoxProps) => {
  if (confirmedAt || step === 'confirmed') {
    return (
      <Alert
        type="success"
        showIcon
        icon={<CheckCircleOutlined />}
        message={
          <span>
            {title} توسط <strong>{confirmerName || partyName || '—'}</strong> در{' '}
            <strong>{toJalaliDateTime(confirmedAt)}</strong> تایید شده است.
          </span>
        }
      />
    );
  }

  if (!canConfirm) {
    return <Alert type="warning" showIcon message="در وضعیت فعلی امکان تایید آنلاین وجود ندارد." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Alert
        type="info"
        showIcon
        message={`اینجانب "${partyName || title}" اطلاعات فرم و اقلام تحویلی را تایید می‌کنم.`}
      />
      {step === 'idle' ? (
        <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={onStart} style={{ width: 'fit-content', fontWeight: 700 }}>
          تایید {title}
        </Button>
      ) : null}
      {step !== 'idle' ? (
        <Steps size="small" current={step === 'select_phone' ? 0 : 1} items={[{ title: 'انتخاب شماره' }, { title: 'تایید کد' }]} />
      ) : null}
      {step === 'select_phone' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {phoneOptions.length === 0 ? (
            <Alert type="warning" showIcon message="شماره موبایل معتبری برای ارسال کد ثبت نشده است." />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {phoneOptions.map((option) => (
                <Button
                  key={option.value}
                  size="small"
                  type={selectedPhoneKey === option.value ? 'primary' : 'default'}
                  onClick={() => onSelectPhone(option.value)}
                >
                  {option.label}: {formatPhoneDisplay(option.phone)}
                </Button>
              ))}
            </div>
          )}
          {selectedPhoneKey ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button type="primary" loading={otpSending} icon={<SendOutlined />} onClick={onSendOtp}>
                ارسال کد تایید
              </Button>
              <Button onClick={onBack}>بازگشت</Button>
            </div>
          ) : null}
          {otpError ? <Alert type="error" showIcon message={otpError} /> : null}
        </div>
      ) : null}
      {step === 'enter_otp' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Text style={{ fontSize: 13 }}>
            کد ارسال شده به{' '}
            <strong>{formatPhoneDisplay(phoneOptions.find((option) => option.value === selectedPhoneKey)?.phone)}</strong> را وارد کنید:
          </Text>
          <Input
            size="large"
            maxLength={6}
            placeholder="کد تایید"
            value={otpValue}
            onChange={(event) => onOtpChange(event.target.value)}
            onPressEnter={onVerifyOtp}
            style={{ maxWidth: 200, textAlign: 'center', letterSpacing: 4, fontSize: 20 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button type="primary" loading={otpVerifying} icon={<CheckCircleOutlined />} onClick={onVerifyOtp}>
              ثبت تایید
            </Button>
            <Button type="link" loading={otpSending} onClick={onSendOtp}>
              ارسال مجدد کد
            </Button>
          </div>
          {otpError ? <Alert type="error" showIcon message={otpError} /> : null}
        </div>
      ) : null}
    </div>
  );
};

const DeliveryPublicContent = ({ primaryColor, onBrandingLoad }: { primaryColor: string; onBrandingLoad: (color: string) => void }) => {
  const { token } = antdTheme.useToken();
  const { message } = App.useApp();
  const { code } = useParams<{ code: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DeliveryPublicData | null>(null);
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);
  const [previewFile, setPreviewFile] = useState<DeliveryFile | null>(null);
  const [step, setStep] = useState<Record<PartyKey, ConfirmStep>>({ delivered_by: 'idle', received_by: 'idle' });
  const [selectedPhoneKey, setSelectedPhoneKey] = useState<Record<PartyKey, string | null>>({ delivered_by: null, received_by: null });
  const [otpValue, setOtpValue] = useState<Record<PartyKey, string>>({ delivered_by: '', received_by: '' });
  const [otpSending, setOtpSending] = useState<Record<PartyKey, boolean>>({ delivered_by: false, received_by: false });
  const [otpVerifying, setOtpVerifying] = useState<Record<PartyKey, boolean>>({ delivered_by: false, received_by: false });
  const [otpError, setOtpError] = useState<Record<PartyKey, string | null>>({ delivered_by: null, received_by: null });

  const applyLoadedData = (loaded: DeliveryPublicData) => {
    setData(loaded);
    const delivery = loaded.delivery || {};
    setStep({
      delivered_by: delivery.delivered_by_confirmed_at ? 'confirmed' : 'idle',
      received_by: delivery.received_by_confirmed_at ? 'confirmed' : 'idle',
    });

    const bs = loaded.branding?.branding_settings;
    const cs = loaded.branding?.company_settings;
    const brandName = String(bs?.brand_name || bs?.brandName || cs?.company_full_name || cs?.trade_name || DEFAULT_BRANDING.brandName);
    const shortName = String(bs?.short_name || bs?.shortName || cs?.trade_name || cs?.company_full_name || DEFAULT_BRANDING.shortName);
    setBranding({ ...DEFAULT_BRANDING, brandName, shortName, logoUrl: String(cs?.logo_url || '').trim() || null });

    const directColor = String(bs?.primary_color || '').trim();
    const paletteKey = (bs?.palette_key || cs?.brand_palette_key || '') as BrandingPaletteKey;
    const paletteColor = paletteKey ? BRAND_PALETTE_PRESETS[paletteKey]?.palette?.primary : '';
    if (directColor || paletteColor) onBrandingLoad(directColor || paletteColor);
  };

  const loadDelivery = async () => {
    if (!code) {
      setError('لینک تحویل نامعتبر است.');
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: result, error: rpcError } = await anonClient.rpc('get_public_delivery_form', { p_code: code });
    if (rpcError || !result) {
      setError('خطا در بارگذاری فرم تحویل.');
      setLoading(false);
      return;
    }
    if ((result as any).error === 'not_found') {
      setError('فرم تحویل پیدا نشد.');
      setLoading(false);
      return;
    }
    applyLoadedData(result as DeliveryPublicData);
    setLoading(false);
  };

  useEffect(() => {
    void loadDelivery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const delivery = data?.delivery || {};
  const statusInfo = STATUS_LABELS[String(delivery.status || '')] || { label: String(delivery.status || '—'), color: 'default' };
  const files = useMemo(() => dedupeFiles(data?.files || []), [data?.files]);
  const items = Array.isArray(data?.items) ? data?.items || [] : [];
  const logoUrl = branding.logoUrl ? normalizePublicAssetUrl(branding.logoUrl) : null;
  const canConfirm = ['draft', 'pending_signature', 'signed'].includes(String(delivery.status || ''));

  const card = {
    background: token.colorBgContainer,
    borderRadius: token.borderRadiusLG,
    border: `1px solid ${token.colorBorderSecondary}`,
    marginBottom: 12,
    overflow: 'hidden' as const,
  };
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
  const cardBody = { padding: '14px 16px' };
  const fieldLabel = { fontSize: 11, color: token.colorTextTertiary, display: 'block', marginBottom: 2 };
  const fieldValue = { fontSize: 13, color: token.colorText, fontWeight: 500 };

  const infoRows = [
    { label: 'عنوان فرم', value: delivery.name },
    { label: 'زمان تحویل', value: toJalaliDateTime(delivery.delivery_date) },
    { label: 'نوع فرم', value: FORM_TYPE_LABELS[String(delivery.form_type || '')] || delivery.form_type },
    { label: 'محل تحویل', value: delivery.location_text },
    { label: 'تحویل‌دهنده', value: delivery.delivered_by_name },
    { label: 'تحویل‌گیرنده', value: delivery.received_by_name },
  ].filter((row) => String(row.value || '').trim() && String(row.value || '').trim() !== '—');

  const getSelectedPhone = (party: PartyKey) =>
    (data?.phone_options?.[party] || []).find((option) => option.value === selectedPhoneKey[party])?.phone || '';

  const patchPartyState = (setter: React.Dispatch<React.SetStateAction<any>>, party: PartyKey, value: unknown) => {
    setter((prev: Record<PartyKey, unknown>) => ({ ...prev, [party]: value }));
  };

  const handleSendOtp = async (party: PartyKey) => {
    const phone = getSelectedPhone(party);
    if (!phone || !code) return;
    patchPartyState(setOtpSending, party, true);
    patchPartyState(setOtpError, party, null);
    try {
      const response = await anonClient.functions.invoke('invoice-otp', {
        body: { system_code: code, module: 'delivery_forms', party, phone },
      });
      if (response.error || response.data?.error) {
        patchPartyState(setOtpError, party, response.data?.message || 'ارسال کد تایید ناموفق بود.');
        return;
      }
      patchPartyState(setStep, party, 'enter_otp');
      message.success('کد تایید ارسال شد.');
    } catch {
      patchPartyState(setOtpError, party, 'خطا در ارسال کد. دوباره امتحان کنید.');
    } finally {
      patchPartyState(setOtpSending, party, false);
    }
  };

  const handleVerifyOtp = async (party: PartyKey) => {
    const phone = getSelectedPhone(party);
    const digits = String(otpValue[party] || '').replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    if (!phone || !code) return;
    if (digits.length < 4) {
      patchPartyState(setOtpError, party, 'کد تایید را کامل وارد کنید.');
      return;
    }
    patchPartyState(setOtpVerifying, party, true);
    patchPartyState(setOtpError, party, null);
    const confirmerName = party === 'delivered_by'
      ? String(delivery.delivered_by_name || 'تحویل‌دهنده')
      : String(delivery.received_by_name || 'تحویل‌گیرنده');
    const { data: result, error: rpcError } = await anonClient.rpc('verify_delivery_confirm_otp', {
      p_code: code,
      p_party: party,
      p_phone: phone,
      p_otp_code: digits,
      p_confirmer_name: confirmerName,
    });
    patchPartyState(setOtpVerifying, party, false);
    if (rpcError || result?.error) {
      const errMap: Record<string, string> = {
        otp_invalid: 'کد تایید اشتباه است.',
        otp_expired: 'کد تایید منقضی شده است. دوباره درخواست دهید.',
        otp_not_sent: 'ابتدا کد تایید را درخواست دهید.',
        invalid_status: 'وضعیت فرم تحویل امکان تایید را نمی‌دهد.',
        already_confirmed: 'این بخش قبلا تایید شده است.',
      };
      patchPartyState(setOtpError, party, errMap[result?.error] || 'خطا در تایید کد.');
      return;
    }
    patchPartyState(setStep, party, 'confirmed');
    message.success('تایید با موفقیت ثبت شد.');
    await loadDelivery();
  };

  const handleShare = async () => {
    const url = buildFullPublicUrl(String(delivery.public_link || ''));
    if (navigator.share) {
      try {
        await navigator.share({ title: delivery.name || 'فرم تحویل', url });
        return;
      } catch {
        // user cancelled
      }
    }
    await navigator.clipboard.writeText(url);
    message.success('لینک تحویل کپی شد.');
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: token.colorBgLayout, flexDirection: 'column' }}>
        <Spin size="large" />
        <Text style={{ color: token.colorTextSecondary, fontSize: 13 }}>در حال بارگذاری فرم تحویل...</Text>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: token.colorBgLayout }}>
        <Alert type="error" showIcon message={error} style={{ maxWidth: 420, width: '100%' }} />
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: token.colorBgLayout, fontFamily: 'Peyda, Tahoma, Arial, sans-serif' }}>
      <div style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${hexToRgba(primaryColor, 0.82)} 100%)` }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          {logoUrl ? (
            <ResilientImage src={logoUrl} preset="gallery" forcePreviewTransform alt={branding.brandName} style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 10, background: 'rgba(255,255,255,0.15)', padding: 4, flexShrink: 0 }} />
          ) : (
            <Avatar size={52} icon={<ShopOutlined />} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Title level={5} style={{ color: '#fff', margin: 0, lineHeight: 1.4, fontWeight: 800 }}>
              {branding.brandName}
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11 }}>
              فرم تحویل{delivery.system_code ? ` - شماره: ${delivery.system_code}` : ''}
            </Text>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <Tag color={statusInfo.color} style={{ margin: 0, fontWeight: 600 }}>{statusInfo.label}</Tag>
            <Tooltip title="به اشتراک‌گذاری">
              <Button size="small" icon={<ShareAltOutlined />} onClick={handleShare} style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', borderRadius: 6 }} />
            </Tooltip>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '16px 12px 40px' }}>
        <div style={card}>
          <div style={cardHead}>
            <UserOutlined />
            اطلاعات تحویل
          </div>
          <div style={{ ...cardBody, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {infoRows.map((row) => (
              <div key={row.label}>
                <span style={fieldLabel}>{row.label}</span>
                <span style={fieldValue}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {files.length > 0 ? (
          <div style={card}>
            <div style={cardHead}>
              <InboxOutlined />
              تصاویر و فایل‌ها
            </div>
            <div style={{ ...cardBody, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))', gap: 10 }}>
              {files.map((file) => {
                const isImage = isImageFileLike(file.url, file.name, file.mime_type);
                return (
                  <button
                    key={`${file.id || file.url}`}
                    type="button"
                    onClick={() => isImage ? setPreviewFile(file) : window.open(file.url, '_blank', 'noopener,noreferrer')}
                    style={{
                      border: `1px solid ${token.colorBorderSecondary}`,
                      background: token.colorBgLayout,
                      borderRadius: 8,
                      overflow: 'hidden',
                      padding: 0,
                      textAlign: 'right',
                      cursor: 'pointer',
                      minHeight: 132,
                    }}
                  >
                    {isImage ? (
                      <ResilientImage src={file.url} preset="thumb" forcePreviewTransform alt={file.name || 'فایل'} style={{ width: '100%', height: 92, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center', color: primaryColor }}>
                        <FileOutlined style={{ fontSize: 28 }} />
                      </div>
                    )}
                    <div style={{ padding: '7px 8px', fontSize: 12, color: token.colorText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {file.name || 'فایل تحویل'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div style={card}>
          <div style={cardHead}>
            <InboxOutlined />
            اقلام تحویلی
          </div>
          <div style={{ overflowX: 'auto' }}>
            <Table
              dataSource={items}
              rowKey={(row) => getDeliveryTableRowKey(row)}
              pagination={false}
              size="small"
              locale={{ emptyText: 'قلمی ثبت نشده است.' }}
              columns={[
                { title: 'شرح', dataIndex: 'title', render: (_value, row) => renderItemTitle(row) },
                { title: 'تعداد/مقدار', dataIndex: 'quantity', width: 120, render: (value) => value ? toFarsiDigits(String(value)) : '—' },
                { title: 'واحد', dataIndex: 'unit', width: 100, render: (value) => value || '—' },
                { title: 'شماره/سریال', dataIndex: 'serial_no', width: 140, render: (value) => value || '—' },
                { title: 'توضیحات', dataIndex: 'description', render: (value) => value || '—' },
              ]}
            />
          </div>
        </div>

        {delivery.notes ? (
          <div style={card}>
            <div style={cardHead}>یادداشت‌ها و شرایط تحویل</div>
            <div style={cardBody}>
              <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9 }}>{delivery.notes}</Text>
            </div>
          </div>
        ) : null}

        <div style={card}>
          <div style={cardHead}>
            <SafetyCertificateOutlined />
            تایید الکترونیکی تحویل
          </div>
          <div style={{ ...cardBody, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <ConfirmationBox
              party="delivered_by"
              title="تحویل‌دهنده"
              partyName={delivery.delivered_by_name || 'تحویل‌دهنده'}
              confirmedAt={delivery.delivered_by_confirmed_at}
              confirmerName={delivery.delivered_by_confirmer_name}
              phoneOptions={data?.phone_options?.delivered_by || []}
              step={step.delivered_by}
              selectedPhoneKey={selectedPhoneKey.delivered_by}
              otpValue={otpValue.delivered_by}
              otpSending={otpSending.delivered_by}
              otpVerifying={otpVerifying.delivered_by}
              otpError={otpError.delivered_by}
              canConfirm={canConfirm}
              onStart={() => patchPartyState(setStep, 'delivered_by', 'select_phone')}
              onBack={() => patchPartyState(setStep, 'delivered_by', 'idle')}
              onSelectPhone={(value) => patchPartyState(setSelectedPhoneKey, 'delivered_by', value)}
              onOtpChange={(value) => { patchPartyState(setOtpValue, 'delivered_by', value); patchPartyState(setOtpError, 'delivered_by', null); }}
              onSendOtp={() => void handleSendOtp('delivered_by')}
              onVerifyOtp={() => void handleVerifyOtp('delivered_by')}
            />
            <ConfirmationBox
              party="received_by"
              title="تحویل‌گیرنده"
              partyName={delivery.received_by_name || 'تحویل‌گیرنده'}
              confirmedAt={delivery.received_by_confirmed_at}
              confirmerName={delivery.received_by_confirmer_name}
              phoneOptions={data?.phone_options?.received_by || []}
              step={step.received_by}
              selectedPhoneKey={selectedPhoneKey.received_by}
              otpValue={otpValue.received_by}
              otpSending={otpSending.received_by}
              otpVerifying={otpVerifying.received_by}
              otpError={otpError.received_by}
              canConfirm={canConfirm}
              onStart={() => patchPartyState(setStep, 'received_by', 'select_phone')}
              onBack={() => patchPartyState(setStep, 'received_by', 'idle')}
              onSelectPhone={(value) => patchPartyState(setSelectedPhoneKey, 'received_by', value)}
              onOtpChange={(value) => { patchPartyState(setOtpValue, 'received_by', value); patchPartyState(setOtpError, 'received_by', null); }}
              onSendOtp={() => void handleSendOtp('received_by')}
              onVerifyOtp={() => void handleVerifyOtp('received_by')}
            />
          </div>
        </div>

        <div style={{ textAlign: 'center', paddingTop: 16 }}>
          <Text style={{ fontSize: 11, color: token.colorTextQuaternary }}>
            این صفحه توسط {branding.brandName} ارائه شده است.
          </Text>
        </div>
      </div>

      <Modal
        open={Boolean(previewFile)}
        footer={null}
        onCancel={() => setPreviewFile(null)}
        title={previewFile?.name || 'پیش‌نمایش'}
        width={760}
      >
        {previewFile ? (
          <ResilientImage src={previewFile.url} preset="gallery" alt={previewFile.name || 'فایل'} className="max-h-[75vh] w-full rounded-lg object-contain" />
        ) : null}
      </Modal>
    </div>
  );
};

const DeliveryPublicPage = () => {
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_BRANDING.palette?.primary || '#3730A3');

  return (
    <ConfigProvider
      direction="rtl"
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: primaryColor,
          fontFamily: 'Peyda, Tahoma, Arial, sans-serif',
        },
      }}
    >
      <App>
        <DeliveryPublicContent primaryColor={primaryColor} onBrandingLoad={setPrimaryColor} />
      </App>
    </ConfigProvider>
  );
};

export default DeliveryPublicPage;
