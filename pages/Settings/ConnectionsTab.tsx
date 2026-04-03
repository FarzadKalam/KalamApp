import React, { useEffect, useMemo, useState } from 'react';
import {
  App as AntdApp,
  Alert,
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
} from 'antd';
import { CopyOutlined, ReloadOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { getSmsBalanceViaGateway, sendSmsViaGateway } from '../../utils/smsGateway';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import type { BotChannel } from '../../utils/botGateway';
import { formatIranMobileForInput } from '../../utils/phoneNumber';
import PhoneActionsPopover from '../../components/PhoneActionsPopover';

type ConnectionType =
  | 'sms'
  | 'email'
  | 'site'
  | 'telegram_bot'
  | 'bale_bot'
  | 'rubika_bot'
  | 'portal';

type ConnectionRecord = {
  id?: string;
  connection_type: ConnectionType;
  provider?: string | null;
  settings?: Record<string, any> | null;
  is_active?: boolean;
};

type BotInboundContact = {
  id: string;
  channel_type: BotChannel;
  chat_id: string;
  username?: string | null;
  display_name?: string | null;
  phone_number?: string | null;
  last_message_text?: string | null;
  last_seen_at?: string | null;
};

type FormValues = {
  sms: {
    provider?: string;
    username?: string;
    password?: string;
    api_key?: string;
    sender_number?: string;
    body_id?: string;
    otp_login_enabled?: boolean;
    otp_delivery_mode?: 'sms_only' | 'sms_and_bale';
    is_active?: boolean;
  };
  email: {
    provider?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    from_email?: string;
    from_name?: string;
    secure_tls?: boolean;
    is_active?: boolean;
  };
  site: {
    provider?: string;
    base_url?: string;
    api_key?: string;
    webhook_secret?: string;
    is_active?: boolean;
  };
  telegram_bot: {
    provider?: string;
    bot_token?: string;
    api_base_url?: string;
    webhook_secret?: string;
    bot_username?: string;
    is_active?: boolean;
  };
  bale_bot: {
    provider?: string;
    bot_token?: string;
    api_base_url?: string;
    webhook_secret?: string;
    bot_username?: string;
    is_active?: boolean;
  };
  rubika_bot: {
    provider?: string;
    bot_token?: string;
    api_base_url?: string;
    webhook_secret?: string;
    bot_name?: string;
    is_active?: boolean;
  };
  portal: {
    provider?: string;
    portal_title?: string;
    portal_slug?: string;
    login_mode?: 'otp' | 'password';
    base_url?: string;
    support_email?: string;
    allow_file_download?: boolean;
    allow_ticketing?: boolean;
    is_active?: boolean;
  };
};

const CONNECTION_TYPES: ConnectionType[] = [
  'sms',
  'email',
  'site',
  'telegram_bot',
  'bale_bot',
  'rubika_bot',
  'portal',
];

const DEFAULT_VALUES: FormValues = {
  sms: {
    provider: 'meli_payamak',
    username: '',
    password: '',
    api_key: '',
    sender_number: '',
    body_id: '',
    otp_login_enabled: false,
    otp_delivery_mode: 'sms_only',
    is_active: true,
  },
  email: {
    provider: 'smtp',
    host: '',
    port: 587,
    username: '',
    password: '',
    from_email: '',
    from_name: '',
    secure_tls: true,
    is_active: true,
  },
  site: {
    provider: 'rest_api',
    base_url: '',
    api_key: '',
    webhook_secret: '',
    is_active: true,
  },
  telegram_bot: {
    provider: 'telegram_bot_api',
    bot_token: '',
    api_base_url: 'https://api.telegram.org',
    webhook_secret: '',
    bot_username: '',
    is_active: false,
  },
  bale_bot: {
    provider: 'bale_bot_api',
    bot_token: '',
    api_base_url: 'https://tapi.bale.ai',
    webhook_secret: '',
    bot_username: '',
    is_active: false,
  },
  rubika_bot: {
    provider: 'rubika_bot_api',
    bot_token: '',
    api_base_url: 'https://botapi.rubika.ir',
    webhook_secret: '',
    bot_name: '',
    is_active: false,
  },
  portal: {
    provider: 'customer_portal',
    portal_title: '',
    portal_slug: '',
    login_mode: 'otp',
    base_url: '',
    support_email: '',
    allow_file_download: true,
    allow_ticketing: false,
    is_active: false,
  },
};

const isMissingTableError = (err: any) => {
  const errorCode = String(err?.code || '');
  const errorMessage = String(err?.message || '').toLowerCase();
  return (
    errorCode === '42P01' ||
    errorCode === 'PGRST205' ||
    errorMessage.includes('could not find the table') ||
    (errorMessage.includes('relation') && errorMessage.includes('does not exist'))
  );
};

const BOT_FORM_KEYS: Record<BotChannel, 'telegram_bot' | 'bale_bot' | 'rubika_bot'> = {
  telegram: 'telegram_bot',
  bale: 'bale_bot',
  rubika: 'rubika_bot',
};

const createWebhookSecret = (channel: BotChannel) => {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `kalam-${channel}-${randomPart}`;
};

const ConnectionsTab: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [smsTesting, setSmsTesting] = useState(false);
  const [smsBalanceLoading, setSmsBalanceLoading] = useState(false);
  const [smsBalance, setSmsBalance] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [rowIds, setRowIds] = useState<Partial<Record<ConnectionType, string>>>({});

  const [testMobile, setTestMobile] = useState('');
  const [testText, setTestText] = useState('این یک پیامک تست از سامانه ERP است.');
  const [botTestChatIds, setBotTestChatIds] = useState<Record<BotChannel, string>>({
    telegram: '',
    bale: '',
    rubika: '',
  });
  const [botTestTexts, setBotTestTexts] = useState<Record<BotChannel, string>>({
    telegram: 'این یک پیام تست از بات سازمان شماست.',
    bale: 'این یک پیام تست از بات سازمان شماست.',
    rubika: 'این یک پیام تست از بات سازمان شماست.',
  });
  const [botTesting, setBotTesting] = useState<Record<BotChannel, boolean>>({
    telegram: false,
    bale: false,
    rubika: false,
  });
  const [botInboundPreview, setBotInboundPreview] = useState<Record<BotChannel, BotInboundContact | null>>({
    telegram: null,
    bale: null,
    rubika: null,
  });
  const [botInboundLoading, setBotInboundLoading] = useState<Record<BotChannel, boolean>>({
    telegram: false,
    bale: false,
    rubika: false,
  });
  const [botInboundWaiting, setBotInboundWaiting] = useState<Record<BotChannel, boolean>>({
    telegram: false,
    bale: false,
    rubika: false,
  });
  const [botInboundCursor, setBotInboundCursor] = useState<Record<BotChannel, string | number | null>>({
    telegram: null,
    bale: null,
    rubika: null,
  });
  const [botInboundCountdown, setBotInboundCountdown] = useState<Record<BotChannel, number>>({
    telegram: 60,
    bale: 60,
    rubika: 60,
  });

  useEffect(() => {
    void fetchData();
  }, []);

  const smsProviderOptions = useMemo(
    () => [{ label: 'ملی پیامک', value: 'meli_payamak' }],
    []
  );

  const emailProviderOptions = useMemo(
    () => [{ label: 'SMTP', value: 'smtp' }],
    []
  );

  const siteProviderOptions = useMemo(
    () => [{ label: 'REST API', value: 'rest_api' }],
    []
  );

  const telegramProviderOptions = useMemo(
    () => [{ label: 'Telegram Bot API', value: 'telegram_bot_api' }],
    []
  );

  const baleProviderOptions = useMemo(
    () => [{ label: 'Bale Bot API', value: 'bale_bot_api' }],
    []
  );

  const rubikaProviderOptions = useMemo(
    () => [{ label: 'Rubika Bot API', value: 'rubika_bot_api' }],
    []
  );

  const portalProviderOptions = useMemo(
    () => [{ label: 'Customer Portal', value: 'customer_portal' }],
    []
  );

  const buildSmsOverrideSettings = (smsValues: FormValues['sms']) => ({
    mode: 'soap' as const,
    base_url: 'https://api.payamak-panel.com/post/send.asmx/SendSimpleSMS2',
    username: String(smsValues?.username || '').trim(),
    password: String(smsValues?.password || '').trim(),
    api_key: String(smsValues?.api_key || '').trim(),
    sender_number: String(smsValues?.sender_number || '').trim(),
    body_id: String(smsValues?.body_id || '').trim(),
    otp_login_enabled: smsValues?.otp_login_enabled === true,
    otp_delivery_mode: smsValues?.otp_delivery_mode || 'sms_only',
    is_flash: false,
  });

  const getBotConnectionId = (channel: BotChannel) => {
    const connectionType = `${channel}_bot` as ConnectionType;
    return rowIds[connectionType];
  };

  const copyBotValue = async (value: string, label: string) => {
    const text = String(value || '').trim();
    if (!text) {
      message.warning(`${label} برای کپی موجود نیست.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      message.success(`${label} کپی شد.`);
    } catch {
      message.error(`کپی ${label} ناموفق بود.`);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('*')
        .in('connection_type', CONNECTION_TYPES);

      if (error) {
        if (isMissingTableError(error)) {
          setTableMissing(true);
          form.setFieldsValue(DEFAULT_VALUES);
          return;
        }
        throw error;
      }

      const byType: Partial<Record<ConnectionType, ConnectionRecord>> = {};
      (data || []).forEach((row: any) => {
        const type = String(row?.connection_type || '') as ConnectionType;
        if (CONNECTION_TYPES.includes(type)) {
          byType[type] = row as ConnectionRecord;
        }
      });

      setRowIds({
        sms: byType.sms?.id,
        email: byType.email?.id,
        site: byType.site?.id,
        telegram_bot: byType.telegram_bot?.id,
        bale_bot: byType.bale_bot?.id,
        rubika_bot: byType.rubika_bot?.id,
        portal: byType.portal?.id,
      });

      const nextValues: FormValues = {
        sms: {
          ...DEFAULT_VALUES.sms,
          provider: String(byType.sms?.provider || DEFAULT_VALUES.sms.provider),
          ...(byType.sms?.settings || {}),
          is_active: byType.sms?.is_active ?? true,
        },
        email: {
          ...DEFAULT_VALUES.email,
          provider: String(byType.email?.provider || DEFAULT_VALUES.email.provider),
          ...(byType.email?.settings || {}),
          is_active: byType.email?.is_active ?? true,
        },
        site: {
          ...DEFAULT_VALUES.site,
          provider: String(byType.site?.provider || DEFAULT_VALUES.site.provider),
          ...(byType.site?.settings || {}),
          is_active: byType.site?.is_active ?? true,
        },
        telegram_bot: {
          ...DEFAULT_VALUES.telegram_bot,
          provider: String(byType.telegram_bot?.provider || DEFAULT_VALUES.telegram_bot.provider),
          ...(byType.telegram_bot?.settings || {}),
          is_active: byType.telegram_bot?.is_active ?? DEFAULT_VALUES.telegram_bot.is_active,
        },
        bale_bot: {
          ...DEFAULT_VALUES.bale_bot,
          provider: String(byType.bale_bot?.provider || DEFAULT_VALUES.bale_bot.provider),
          ...(byType.bale_bot?.settings || {}),
          is_active: byType.bale_bot?.is_active ?? DEFAULT_VALUES.bale_bot.is_active,
        },
        rubika_bot: {
          ...DEFAULT_VALUES.rubika_bot,
          provider: String(byType.rubika_bot?.provider || DEFAULT_VALUES.rubika_bot.provider),
          ...(byType.rubika_bot?.settings || {}),
          is_active: byType.rubika_bot?.is_active ?? DEFAULT_VALUES.rubika_bot.is_active,
        },
        portal: {
          ...DEFAULT_VALUES.portal,
          provider: String(byType.portal?.provider || DEFAULT_VALUES.portal.provider),
          ...(byType.portal?.settings || {}),
          is_active: byType.portal?.is_active ?? DEFAULT_VALUES.portal.is_active,
        },
      };

      form.setFieldsValue(nextValues);
      setSmsBalance(null);
      setTableMissing(false);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت تنظیمات اتصالات'));
      form.setFieldsValue(DEFAULT_VALUES);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const ensuredTelegramSecret = String(values.telegram_bot?.webhook_secret || '').trim() || createWebhookSecret('telegram');
      const ensuredBaleSecret = String(values.bale_bot?.webhook_secret || '').trim() || createWebhookSecret('bale');
      const ensuredRubikaSecret = String(values.rubika_bot?.webhook_secret || '').trim() || createWebhookSecret('rubika');

      form.setFieldsValue({
        telegram_bot: { ...(values.telegram_bot || {}), webhook_secret: ensuredTelegramSecret },
        bale_bot: { ...(values.bale_bot || {}), webhook_secret: ensuredBaleSecret },
        rubika_bot: { ...(values.rubika_bot || {}), webhook_secret: ensuredRubikaSecret },
      });
      setSaving(true);

      const rows: Array<Record<string, any>> = [
        {
          id: rowIds.sms,
          connection_type: 'sms',
          provider: values.sms?.provider || 'meli_payamak',
          settings: buildSmsOverrideSettings(values.sms || {}),
          is_active: values.sms?.is_active !== false,
        },
        {
          id: rowIds.email,
          connection_type: 'email',
          provider: values.email?.provider || 'smtp',
          settings: {
            host: values.email?.host || '',
            port: values.email?.port || 587,
            username: values.email?.username || '',
            password: values.email?.password || '',
            from_email: values.email?.from_email || '',
            from_name: values.email?.from_name || '',
            secure_tls: values.email?.secure_tls !== false,
          },
          is_active: values.email?.is_active !== false,
        },
        {
          id: rowIds.site,
          connection_type: 'site',
          provider: values.site?.provider || 'rest_api',
          settings: {
            base_url: values.site?.base_url || '',
            api_key: values.site?.api_key || '',
            webhook_secret: values.site?.webhook_secret || '',
          },
          is_active: values.site?.is_active !== false,
        },
        {
          id: rowIds.telegram_bot,
          connection_type: 'telegram_bot',
          provider: values.telegram_bot?.provider || 'telegram_bot_api',
          settings: {
            bot_token: values.telegram_bot?.bot_token || '',
            api_base_url: values.telegram_bot?.api_base_url || '',
            webhook_secret: ensuredTelegramSecret,
            bot_username: values.telegram_bot?.bot_username || '',
          },
          is_active: values.telegram_bot?.is_active === true,
        },
        {
          id: rowIds.bale_bot,
          connection_type: 'bale_bot',
          provider: values.bale_bot?.provider || 'bale_bot_api',
          settings: {
            bot_token: values.bale_bot?.bot_token || '',
            api_base_url: values.bale_bot?.api_base_url || '',
            webhook_secret: ensuredBaleSecret,
            bot_username: values.bale_bot?.bot_username || '',
          },
          is_active: values.bale_bot?.is_active === true,
        },
        {
          id: rowIds.rubika_bot,
          connection_type: 'rubika_bot',
          provider: values.rubika_bot?.provider || 'rubika_bot_api',
          settings: {
            bot_token: values.rubika_bot?.bot_token || '',
            api_base_url: values.rubika_bot?.api_base_url || '',
            webhook_secret: ensuredRubikaSecret,
            bot_name: values.rubika_bot?.bot_name || '',
          },
          is_active: values.rubika_bot?.is_active === true,
        },
        {
          id: rowIds.portal,
          connection_type: 'portal',
          provider: values.portal?.provider || 'customer_portal',
          settings: {
            portal_title: values.portal?.portal_title || '',
            portal_slug: values.portal?.portal_slug || '',
            login_mode: values.portal?.login_mode || 'otp',
            base_url: values.portal?.base_url || '',
            support_email: values.portal?.support_email || '',
            allow_file_download: values.portal?.allow_file_download !== false,
            allow_ticketing: values.portal?.allow_ticketing === true,
          },
          is_active: values.portal?.is_active === true,
        },
      ];

      const results = await Promise.all(
        rows.map(async (row) => {
          const payload = row.id
            ? row
            : (({ id, ...rest }) => rest)(row);

          const { data, error } = await supabase
            .from('integration_settings')
            .upsert([payload], { onConflict: 'org_id,connection_type' })
            .select('id, connection_type')
            .maybeSingle();

          if (error) throw error;
          return data || null;
        })
      );

      const nextIds: Partial<Record<ConnectionType, string>> = { ...rowIds };
      results.forEach((row: any) => {
        const type = String(row?.connection_type || '') as ConnectionType;
        if (CONNECTION_TYPES.includes(type)) {
          nextIds[type] = String(row.id);
        }
      });
      setRowIds(nextIds);
      setTableMissing(false);
      message.success('تنظیمات اتصالات ذخیره شد.');
    } catch (err: any) {
      if (Array.isArray(err?.errorFields)) return;
      if (isMissingTableError(err)) {
        setTableMissing(true);
        message.error('جدول integration_settings هنوز در دیتابیس ایجاد نشده است.');
        return;
      }
      message.error(toFaErrorMessage(err, 'خطا در ذخیره تنظیمات اتصالات'));
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestSms = async () => {
    try {
      const smsValues = form.getFieldValue('sms') || {};
      const provider = String(smsValues?.provider || '');
      const username = String(smsValues?.username || '').trim();
      const password = String(smsValues?.password || '').trim();
      const apiKey = String(smsValues?.api_key || '').trim();
      const senderNumber = String(smsValues?.sender_number || '').trim();

      if (provider !== 'meli_payamak') {
        message.error('در حال حاضر فقط ارسال تست برای ملی پیامک فعال است.');
        return;
      }
      if (!username && !apiKey) {
        message.error('حداقل نام کاربری یا API Key را وارد کنید.');
        return;
      }
      if (!password && !apiKey) {
        message.error('برای حالت نام کاربری، رمز عبور الزامی است.');
        return;
      }
      if (!senderNumber) {
        message.error('شماره ارسال کننده را وارد کنید.');
        return;
      }
      if (!testMobile.trim()) {
        message.error('شماره موبایل تست را وارد کنید.');
        return;
      }
      if (!testText.trim()) {
        message.error('متن پیامک تست را وارد کنید.');
        return;
      }

      setSmsTesting(true);
      const result = await sendSmsViaGateway({
        to: [formatIranMobileForInput(testMobile.trim())],
        text: testText.trim(),
        overrideSettings: buildSmsOverrideSettings(smsValues),
        allowDirectFallback: true,
      });
      const providerResult = Array.isArray(result?.provider_results) ? result.provider_results[0] : null;
      const providerToken = String(providerResult?.result || '').trim();
      message.info(
        providerToken
          ? `Ø®Ø±ÙˆØ¬ÛŒ provider: ${providerToken}. Ø§ÛŒÙ† Ù¾Ø§Ø³Ø® ÙÙ‚Ø· Ø«Ø¨Øª Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ø±Ø§ Ù†Ø´Ø§Ù† Ù…ÛŒâ€ŒØ¯Ù‡Ø¯ Ùˆ Ø¨Ù‡ Ù…Ø¹Ù†ÛŒ ØªØ§ÛŒÛŒØ¯ ØªØ­ÙˆÛŒÙ„ Ù†Ù‡Ø§ÛŒÛŒ Ø¨Ù‡ Ú¯ÙˆØ´ÛŒ Ù†ÛŒØ³Øª.`
          : 'Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ø§Ø±Ø³Ø§Ù„ Ø¯Ø± provider Ø«Ø¨Øª Ø´Ø¯ØŒ Ø§Ù…Ø§ ØªØ­ÙˆÛŒÙ„ Ù†Ù‡Ø§ÛŒÛŒ Ø¨Ù‡ Ú¯ÙˆØ´ÛŒ Ø¯Ø± Ø§ÛŒÙ† Ù…Ø³ÛŒØ± ØªØ§ÛŒÛŒØ¯ Ù†Ù…ÛŒâ€ŒØ´ÙˆØ¯.'
      );
      message.success('پیامک تست ارسال شد (درخواست ثبت شد).');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در ارسال پیامک تست'));
    } finally {
      setSmsTesting(false);
    }
  };

  const handleRefreshSmsBalance = async () => {
    try {
      const smsValues = form.getFieldValue('sms') || {};
      setSmsBalanceLoading(true);
      const result = await getSmsBalanceViaGateway(buildSmsOverrideSettings(smsValues));
      setSmsBalance(String(result.balance || '').trim() || 'نامشخص');
    } catch (err: any) {
      setSmsBalance(null);
      message.error(toFaErrorMessage(err, 'خطا در دریافت اعتبار پیامک'));
    } finally {
      setSmsBalanceLoading(false);
    }
  };

  const handleSendTestBot = async (channel: BotChannel) => {
    const formKey = BOT_FORM_KEYS[channel];
    try {
      const botValues = form.getFieldValue(formKey) || {};
      const botToken = String(botValues?.bot_token || '').trim();
      const apiBaseUrl = String(botValues?.api_base_url || '').trim();
      const chatId = String(botTestChatIds[channel] || '').trim();
      const text = String(botTestTexts[channel] || '').trim();

      if (!botToken) {
        message.error('توکن بات را وارد کنید.');
        return;
      }
      if (!apiBaseUrl) {
        message.error('API Base URL بات را وارد کنید.');
        return;
      }
      if (!chatId) {
        message.error('شناسه چت تست را وارد کنید.');
        return;
      }
      if (!text) {
        message.error('متن پیام تست را وارد کنید.');
        return;
      }

      setBotTesting((prev) => ({ ...prev, [channel]: true }));
      const connectionId = getBotConnectionId(channel);
      if (!connectionId) {
        message.error('ابتدا تنظیمات این بات را یک بار ذخیره کنید.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('bot-admin', {
        body: {
          action: 'send_test_message',
          channel,
          connectionId,
          chatId,
          text,
        },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(String(data?.message || 'ارسال پیام تست بات ناموفق بود.'));
      }
      message.success('پیام تست بات ارسال شد.');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در ارسال پیام تست بات'));
    } finally {
      setBotTesting((prev) => ({ ...prev, [channel]: false }));
    }
  };

  const pollLatestBotInboundContact = async (
    channel: BotChannel,
    options?: { silent?: boolean }
  ) => {
    const silent = options?.silent === true;
    const connectionId = getBotConnectionId(channel);
    if (!connectionId) {
      if (!silent) {
        message.error('ابتدا تنظیمات این بات را یک بار ذخیره کنید.');
      }
      return null;
    }

    try {
      if (!silent) {
        setBotInboundLoading((prev) => ({ ...prev, [channel]: true }));
      }

      const { data, error } = await supabase.functions.invoke('bot-admin', {
        body: {
          action: 'poll_updates',
          channel,
          connectionId,
          cursor: botInboundCursor[channel],
        },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(String(data?.message || 'خواندن پیام‌های بات ناموفق بود.'));
      }

      if (Object.prototype.hasOwnProperty.call(data, 'cursor')) {
        setBotInboundCursor((prev) => ({ ...prev, [channel]: data?.cursor ?? null }));
      }

      const row = data?.found && data?.contact ? (data.contact as BotInboundContact) : null;
      if (row) {
        setBotInboundPreview((prev) => ({ ...prev, [channel]: row }));
        setBotInboundWaiting((prev) => ({ ...prev, [channel]: false }));
        if (!silent) {
          message.success(`آخرین چت‌آیدی ${channel} دریافت شد.`);
        }
      }

      return row;
    } catch (err: any) {
      if (!silent) {
        message.error(toFaErrorMessage(err, 'خطا در خواندن آخرین چت‌آیدی بات'));
      }
      return null;
    } finally {
      if (!silent) {
        setBotInboundLoading((prev) => ({ ...prev, [channel]: false }));
      }
    }
  };

  const handleReadLatestBotChatId = async (channel: BotChannel) => {
    const connectionId = getBotConnectionId(channel);
    if (!connectionId) {
      message.error('ابتدا تنظیمات این بات را یک بار ذخیره کنید.');
      return;
    }

    try {
      setBotInboundLoading((prev) => ({ ...prev, [channel]: true }));
      const { data, error } = await supabase.functions.invoke('bot-admin', {
        body: {
          action: 'start_capture',
          channel,
          connectionId,
        },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(String(data?.message || 'شروع خواندن پیام‌های بات ناموفق بود.'));
      }

      setBotInboundPreview((prev) => ({ ...prev, [channel]: null }));
      setBotInboundCursor((prev) => ({ ...prev, [channel]: data?.cursor ?? null }));
      setBotInboundCountdown((prev) => ({ ...prev, [channel]: 60 }));
      setBotInboundWaiting((prev) => ({ ...prev, [channel]: true }));
      message.info('در حال انتظار برای اولین پیام جدید بات هستیم. حالا یک پیام جدید یا /start بفرستید.');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در شروع خواندن پیام‌های ورودی بات'));
    } finally {
      setBotInboundLoading((prev) => ({ ...prev, [channel]: false }));
    }
  };

  useEffect(() => {
    const waitingChannels = (Object.entries(botInboundWaiting) as Array<[BotChannel, boolean]>)
      .filter(([, waiting]) => waiting)
      .map(([channel]) => channel);

    if (waitingChannels.length === 0) return;

    const timer = window.setInterval(() => {
      waitingChannels.forEach((channel) => {
        void pollLatestBotInboundContact(channel, {
          silent: true,
        });
      });
    }, 3000);

    return () => window.clearInterval(timer);
  }, [botInboundCursor, botInboundWaiting]);

  useEffect(() => {
    const waitingChannels = (Object.entries(botInboundWaiting) as Array<[BotChannel, boolean]>)
      .filter(([, waiting]) => waiting)
      .map(([channel]) => channel);

    if (waitingChannels.length === 0) return;

    const timer = window.setInterval(() => {
      setBotInboundCountdown((prev) => {
        const next = { ...prev };
        waitingChannels.forEach((channel) => {
          const current = Number(prev[channel] || 0);
          if (current <= 1) {
            next[channel] = 0;
            setBotInboundWaiting((old) => ({ ...old, [channel]: false }));
            message.warning(`برای ${channel} تا ۶۰ ثانیه پیام جدیدی دریافت نشد.`);
          } else {
            next[channel] = current - 1;
          }
        });
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [botInboundWaiting, message]);

  const renderBotInboundCapture = (channel: BotChannel, accentClass: string) => {
    const displayLabel =
      channel === 'telegram' ? 'تلگرام' : channel === 'bale' ? 'بله' : 'روبیکا';
    const contact = botInboundPreview[channel];
    const waiting = botInboundWaiting[channel];
    const loading = botInboundLoading[channel];
    const countdown = botInboundCountdown[channel];

    return (
      <div className={`rounded-xl border border-dashed ${accentClass} p-3 bg-white/40 dark:bg-white/5 mt-3`}>
        <div className="font-semibold mb-2">خواندن آخرین چت‌آیدی {displayLabel}</div>
        <div className="text-xs text-gray-500 mb-3">
          بعد از ذخیره تنظیمات، یک پیام جدید یا <code>/start</code> به بات بفرستید. اولین پیام ورودی جدید از همین
          بخش خوانده می‌شود و اطلاعات لازم برای کپی نمایش داده خواهد شد.
        </div>
        <Space className="mb-3" wrap>
          <Button
            type="default"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => handleReadLatestBotChatId(channel)}
          >
            خواندن آخرین چت‌آیدی
          </Button>
          {waiting ? <span className="text-xs text-amber-600">در حال انتظار برای پیام جدید... {countdown} ثانیه</span> : null}
        </Space>
        {contact ? (
          <Alert
            type="info"
            showIcon
            message="اطلاعات آخرین پیام ورودی"
            description={
              <div className="text-xs leading-6 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span>نام کاربری: {contact.username || 'نامشخص'}</span>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => void copyBotValue(contact.username || '', 'نام کاربری')}
                  >
                    کپی
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span>شماره تماس:</span>
                    {contact.phone_number ? <PhoneActionsPopover value={contact.phone_number} size="sm" /> : <span>ثبت نشده</span>}
                  </span>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => void copyBotValue(contact.phone_number || '', 'شماره تماس')}
                  >
                    کپی
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>چت‌آیدی: {contact.chat_id}</span>
                  <Button
                    size="small"
                    type="primary"
                    icon={<CopyOutlined />}
                    onClick={() => void copyBotValue(contact.chat_id, 'چت‌آیدی')}
                  >
                    کپی
                  </Button>
                </div>
                <div>نام نمایشی: {contact.display_name || 'نامشخص'}</div>
                <div>آخرین پیام: {contact.last_message_text || 'بدون متن'}</div>
              </div>
            }
          />
        ) : null}
        {!contact && !waiting ? (
          <div className="text-xs text-gray-500">
            هنوز پیام ورودی برای این بات ثبت نشده است. بعد از ارسال اولین پیام، دوباره این دکمه را بزنید.
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto py-4">
      {tableMissing ? (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message="جدول integration_settings در دیتابیس یافت نشد."
          description="اسکریپت migration مربوط به این بخش را اجرا کنید، سپس صفحه را رفرش کنید."
        />
      ) : null}

      <Form form={form} layout="vertical" initialValues={DEFAULT_VALUES} disabled={loading}>
        <Collapse
          defaultActiveKey={CONNECTION_TYPES}
          className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
          expandIconPosition="end"
          items={[
            {
              key: 'sms',
              label: 'اتصال سامانه پیامک',
              children: (
                <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Form.Item label="ارائه‌دهنده پیامک" name={['sms', 'provider']}>
                    <Select options={smsProviderOptions} />
                  </Form.Item>
                  <Form.Item label="فعال" name={['sms', 'is_active']} valuePropName="checked">
                    <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                  </Form.Item>
                  <Form.Item label="OTP ورود" name={['sms', 'otp_login_enabled']} valuePropName="checked">
                    <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                  </Form.Item>

                  <Form.Item label="نام کاربری ملی پیامک" name={['sms', 'username']}>
                    <Input placeholder="معمولا شماره موبایل پنل" />
                  </Form.Item>
                  <Form.Item label="API Key" name={['sms', 'api_key']}>
                    <Input placeholder="کلید API ملی پیامک" />
                  </Form.Item>
                  <Form.Item label="رمز عبور یا API Key" name={['sms', 'password']}>
                    <Input.Password placeholder="طبق مستندات ملی‌پیامک می‌توانید API Key را اینجا قرار دهید" />
                  </Form.Item>

                  <Form.Item label="خط ارسال" name={['sms', 'sender_number']}>
                    <Input placeholder="مثال: 5000..." />
                  </Form.Item>
                  <Form.Item label="کد الگو (اختیاری)" name={['sms', 'body_id']}>
                    <Input placeholder="برای Pattern/Base Number در صورت نیاز" />
                  </Form.Item>
                  <Form.Item label="ارسال OTP" name={['sms', 'otp_delivery_mode']}>
                    <Select
                      options={[
                        { label: 'فقط پیامک', value: 'sms_only' },
                        { label: 'پیامک + آینه بله (بعدا)', value: 'sms_and_bale' },
                      ]}
                    />
                  </Form.Item>
                </div>

                  <div className="text-xs text-gray-500 mb-3">
                    مسیرهای فنی ملی‌پیامک داخل سیستم ثابت نگه داشته شده‌اند و از دید کاربر نمایش داده نمی‌شوند.
                    ورود با شماره از `Supabase Auth` استفاده می‌کند و برای فعال‌سازی واقعی آن باید تنظیمات
                    self-hosted را طبق فایل <code>SMS_AUTH_SETUP.md</code> انجام بدهی.
                  </div>

                  <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-3 mb-3 bg-gray-50/70 dark:bg-white/5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">اعتبار پیامک</div>
                        <div className="text-xs text-gray-500 mt-1">
                          برای خواندن مانده اعتبار و متدهای SOAP، نام کاربری و مقدار Password/API Key لازم است. بازگشت `0` می‌تواند نشانه خطای احراز هویت هم باشد، نه فقط شارژ صفر.
                        </div>
                      </div>
                      <Button
                        icon={<ReloadOutlined />}
                        loading={smsBalanceLoading}
                        onClick={handleRefreshSmsBalance}
                      >
                        بروزرسانی
                      </Button>
                    </div>
                    <div className="mt-3 text-sm">
                      <span className="text-gray-500">مانده فعلی: </span>
                      <span className="font-semibold">{smsBalance || 'هنوز دریافت نشده'}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-dashed border-leather-300 dark:border-leather-700 p-3 bg-leather-50/30 dark:bg-white/5">
                    <div className="font-semibold mb-2">ارسال پیامک تست</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Form.Item label="شماره موبایل تست" className="mb-0">
                        <Input
                          value={testMobile}
                          onChange={(e) => setTestMobile(e.target.value)}
                          placeholder="مثال: 0912..."
                        />
                      </Form.Item>
                      <Form.Item label="متن پیامک تست" className="mb-0">
                        <Input.TextArea
                          rows={2}
                          value={testText}
                          onChange={(e) => setTestText(e.target.value)}
                        />
                      </Form.Item>
                    </div>
                    <Space className="mt-3">
                      <Button
                        type="default"
                        icon={<SendOutlined />}
                        loading={smsTesting}
                        onClick={handleSendTestSms}
                      >
                        ارسال پیامک تست
                      </Button>
                    </Space>
                  </div>
                </>
              ),
            },
            {
              key: 'email',
              label: 'اتصال ایمیل',
              children: (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Form.Item label="ارائه‌دهنده ایمیل" name={['email', 'provider']}>
                    <Select options={emailProviderOptions} />
                  </Form.Item>
                  <Form.Item label="پورت" name={['email', 'port']}>
                    <InputNumber className="w-full persian-number" min={1} />
                  </Form.Item>
                  <Form.Item label="فعال" name={['email', 'is_active']} valuePropName="checked">
                    <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                  </Form.Item>

                  <Form.Item label="SMTP Host" name={['email', 'host']}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="نام کاربری" name={['email', 'username']}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="رمز عبور" name={['email', 'password']}>
                    <Input.Password />
                  </Form.Item>

                  <Form.Item label="ایمیل فرستنده" name={['email', 'from_email']}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="نام فرستنده" name={['email', 'from_name']}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="امنیت TLS" name={['email', 'secure_tls']} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </div>
              ),
            },
            {
              key: 'site',
              label: 'اتصال سایت',
              children: (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Form.Item label="نوع اتصال" name={['site', 'provider']}>
                    <Select options={siteProviderOptions} />
                  </Form.Item>
                  <Form.Item label="Base URL سایت" name={['site', 'base_url']} className="md:col-span-2">
                    <Input />
                  </Form.Item>
                  <Form.Item label="API Key" name={['site', 'api_key']}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="Webhook Secret" name={['site', 'webhook_secret']}>
                    <Input.Password />
                  </Form.Item>
                  <Form.Item label="فعال" name={['site', 'is_active']} valuePropName="checked">
                    <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                  </Form.Item>
                </div>
              ),
            },
            {
              key: 'telegram_bot',
              label: 'اتصال بات تلگرام',
              children: (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item label="ارائه‌دهنده" name={['telegram_bot', 'provider']}>
                      <Select options={telegramProviderOptions} />
                    </Form.Item>
                    <Form.Item label="نام کاربری بات" name={['telegram_bot', 'bot_username']}>
                      <Input placeholder="@your_bot" />
                    </Form.Item>
                    <Form.Item label="فعال" name={['telegram_bot', 'is_active']} valuePropName="checked">
                      <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                    </Form.Item>

                    <Form.Item label="Bot Token" name={['telegram_bot', 'bot_token']} className="md:col-span-2">
                      <Input.Password />
                    </Form.Item>
                    <Form.Item name={['telegram_bot', 'webhook_secret']} hidden>
                      <Input />
                    </Form.Item>

                    <Form.Item label="API Base URL" name={['telegram_bot', 'api_base_url']} className="md:col-span-3">
                      <Input />
                    </Form.Item>
                  </div>
                  <div className="text-xs text-gray-500">
                    برای به‌دست آوردن Chat ID، بعد از ذخیره تنظیمات یک پیام یا /start به بات بفرستید.
                  </div>
                  <div className="rounded-xl border border-dashed border-sky-300 dark:border-sky-700 p-3 bg-sky-50/30 dark:bg-white/5 mt-3">
                    <div className="font-semibold mb-2">ارسال تست بات تلگرام</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Form.Item label="Chat ID تست" className="mb-0">
                        <Input
                          value={botTestChatIds.telegram}
                          onChange={(e) => setBotTestChatIds((prev) => ({ ...prev, telegram: e.target.value }))}
                        />
                      </Form.Item>
                      <Form.Item label="متن تست" className="mb-0">
                        <Input.TextArea
                          rows={2}
                          value={botTestTexts.telegram}
                          onChange={(e) => setBotTestTexts((prev) => ({ ...prev, telegram: e.target.value }))}
                        />
                      </Form.Item>
                    </div>
                    <Space className="mt-3">
                      <Button
                        type="default"
                        icon={<SendOutlined />}
                        loading={botTesting.telegram}
                        onClick={() => handleSendTestBot('telegram')}
                      >
                        ارسال تست تلگرام
                      </Button>
                    </Space>
                  </div>
                  {renderBotInboundCapture('telegram', 'border-sky-300 dark:border-sky-700')}
                </>
              ),
            },
            {
              key: 'bale_bot',
              label: 'اتصال بات بله',
              children: (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item label="ارائه‌دهنده" name={['bale_bot', 'provider']}>
                      <Select options={baleProviderOptions} />
                    </Form.Item>
                    <Form.Item label="شناسه/نام بات" name={['bale_bot', 'bot_username']}>
                      <Input />
                    </Form.Item>
                    <Form.Item label="فعال" name={['bale_bot', 'is_active']} valuePropName="checked">
                      <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                    </Form.Item>

                    <Form.Item label="Bot Token" name={['bale_bot', 'bot_token']} className="md:col-span-2">
                      <Input.Password />
                    </Form.Item>
                    <Form.Item name={['bale_bot', 'webhook_secret']} hidden>
                      <Input />
                    </Form.Item>

                    <Form.Item label="API Base URL" name={['bale_bot', 'api_base_url']} className="md:col-span-3">
                      <Input />
                    </Form.Item>
                  </div>
                  <div className="text-xs text-gray-500">
                    تنظیمات این بخش per-org ذخیره می‌شود تا هر سازمان بات خودش را داشته باشد.
                  </div>
                  <div className="rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700 p-3 bg-emerald-50/30 dark:bg-white/5 mt-3">
                    <div className="font-semibold mb-2">ارسال تست بات بله</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Form.Item label="Chat ID تست" className="mb-0">
                        <Input
                          value={botTestChatIds.bale}
                          onChange={(e) => setBotTestChatIds((prev) => ({ ...prev, bale: e.target.value }))}
                        />
                      </Form.Item>
                      <Form.Item label="متن تست" className="mb-0">
                        <Input.TextArea
                          rows={2}
                          value={botTestTexts.bale}
                          onChange={(e) => setBotTestTexts((prev) => ({ ...prev, bale: e.target.value }))}
                        />
                      </Form.Item>
                    </div>
                    <Space className="mt-3">
                      <Button
                        type="default"
                        icon={<SendOutlined />}
                        loading={botTesting.bale}
                        onClick={() => handleSendTestBot('bale')}
                      >
                        ارسال تست بله
                      </Button>
                    </Space>
                  </div>
                  {renderBotInboundCapture('bale', 'border-emerald-300 dark:border-emerald-700')}
                </>
              ),
            },
            {
              key: 'rubika_bot',
              label: 'اتصال بات روبیکا',
              children: (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item label="ارائه‌دهنده" name={['rubika_bot', 'provider']}>
                      <Select options={rubikaProviderOptions} />
                    </Form.Item>
                    <Form.Item label="نام بات" name={['rubika_bot', 'bot_name']}>
                      <Input />
                    </Form.Item>
                    <Form.Item label="فعال" name={['rubika_bot', 'is_active']} valuePropName="checked">
                      <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                    </Form.Item>

                    <Form.Item label="Bot Token" name={['rubika_bot', 'bot_token']} className="md:col-span-2">
                      <Input.Password />
                    </Form.Item>
                    <Form.Item name={['rubika_bot', 'webhook_secret']} hidden>
                      <Input />
                    </Form.Item>

                    <Form.Item label="API Base URL" name={['rubika_bot', 'api_base_url']} className="md:col-span-3">
                      <Input />
                    </Form.Item>
                  </div>
                  <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-700 p-3 bg-amber-50/30 dark:bg-white/5 mt-3">
                    <div className="font-semibold mb-2">ارسال تست بات روبیکا</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Form.Item label="Chat ID تست" className="mb-0">
                        <Input
                          value={botTestChatIds.rubika}
                          onChange={(e) => setBotTestChatIds((prev) => ({ ...prev, rubika: e.target.value }))}
                        />
                      </Form.Item>
                      <Form.Item label="متن تست" className="mb-0">
                        <Input.TextArea
                          rows={2}
                          value={botTestTexts.rubika}
                          onChange={(e) => setBotTestTexts((prev) => ({ ...prev, rubika: e.target.value }))}
                        />
                      </Form.Item>
                    </div>
                    <Space className="mt-3">
                      <Button
                        type="default"
                        icon={<SendOutlined />}
                        loading={botTesting.rubika}
                        onClick={() => handleSendTestBot('rubika')}
                      >
                        ارسال تست روبیکا
                      </Button>
                    </Space>
                  </div>
                  {renderBotInboundCapture('rubika', 'border-amber-300 dark:border-amber-700')}
                </>
              ),
            },
            {
              key: 'portal',
              label: 'تنظیمات پورتال مشتریان',
              children: (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item label="نوع سرویس" name={['portal', 'provider']}>
                      <Select options={portalProviderOptions} />
                    </Form.Item>
                    <Form.Item label="عنوان پورتال" name={['portal', 'portal_title']}>
                      <Input placeholder="مثال: پورتال مشتریان" />
                    </Form.Item>
                    <Form.Item label="فعال" name={['portal', 'is_active']} valuePropName="checked">
                      <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                    </Form.Item>

                    <Form.Item label="Portal Slug" name={['portal', 'portal_slug']}>
                      <Input placeholder="example" />
                    </Form.Item>
                    <Form.Item label="حالت ورود" name={['portal', 'login_mode']}>
                      <Select
                        options={[
                          { label: 'رمز یکبار مصرف', value: 'otp' },
                          { label: 'رمز عبور', value: 'password' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item label="ایمیل پشتیبانی" name={['portal', 'support_email']}>
                      <Input />
                    </Form.Item>

                    <Form.Item label="Base URL پورتال" name={['portal', 'base_url']} className="md:col-span-3">
                      <Input placeholder="https://portal.example.com یا /portal" />
                    </Form.Item>

                    <Form.Item label="اجازه دانلود فایل" name={['portal', 'allow_file_download']} valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item label="فعال‌سازی تیکتینگ" name={['portal', 'allow_ticketing']} valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </div>
                  <Alert
                    type="info"
                    showIcon
                    message="ساب‌دامین هنوز اجرایی نشده است."
                    description="فعلا این تنظیمات برای آماده‌سازی پورتال و نگهداری تنظیمات per-org ذخیره می‌شود. در فاز بعد route/path-based یا subdomain-based روی آن سوار می‌شود."
                  />
                </>
              ),
            },
          ]}
        />

        <div className="flex justify-end mt-4 sticky bottom-0 bg-white dark:bg-[#1a1a1a] py-3 border-t border-gray-100 dark:border-gray-800 z-10">
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
            className="bg-leather-600 hover:!bg-leather-500 border-none h-11 px-8 rounded-xl"
          >
            ذخیره تنظیمات اتصالات
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default ConnectionsTab;
