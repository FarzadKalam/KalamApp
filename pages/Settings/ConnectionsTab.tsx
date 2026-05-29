import React, { useEffect, useMemo, useState } from 'react';
import {
  App as AntdApp,
  Alert,
  AutoComplete,
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
} from 'antd';
import { CopyOutlined, ReloadOutlined, SafetyCertificateOutlined, SaveOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { getSmsBalanceViaGateway, sendSmsViaGateway } from '../../utils/smsGateway';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { OFFICIAL_BOT_API_BASE_URL, type BotChannel } from '../../utils/botGateway';
import { formatIranMobileForInput } from '../../utils/phoneNumber';
import PhoneActionsPopover from '../../components/PhoneActionsPopover';
import AiSparkleIcon from '../../components/ai/AiSparkleIcon';
import {
  TAXPAYER_DEFAULT_BASE_URL,
  TAXPAYER_INTEGRATION_MODE_OPTIONS,
  TAXPAYER_LEGACY_BASE_URL,
  TAXPAYER_V2_BASE_URL,
  type TaxpayerIntegrationMode,
} from '../../utils/taxpayerSystem';
import { fetchSessionBootstrap } from '../../utils/sessionCache';

type ConnectionType =
  | 'sms'
  | 'email'
  | 'site'
  | 'voip'
  | 'telegram_bot'
  | 'bale_bot'
  | 'rubika_bot'
  | 'portal';

type ConnectionRecord = {
  id?: string;
  org_id?: string | null;
  connection_type: ConnectionType;
  provider?: string | null;
  settings?: Record<string, any> | null;
  is_active?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
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
  last_payload?: Record<string, any> | null;
  provider_debug?: Record<string, any> | null;
  provider_result_count?: number | null;
  capture_diagnostic?: Record<string, any> | null;
};

const TELEGRAM_OFFICIAL_API_BASE_URL = OFFICIAL_BOT_API_BASE_URL.telegram;
const BALE_OFFICIAL_API_BASE_URL = OFFICIAL_BOT_API_BASE_URL.bale;
const RUBIKA_OFFICIAL_API_BASE_URL = OFFICIAL_BOT_API_BASE_URL.rubika;

type FormValues = {
  sms: {
    provider?: string;
    username?: string;
    password?: string;
    api_key?: string;
    sender_number?: string;
    body_id?: string;
    webhook_secret?: string;
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
  voip: {
    provider?: string;
    base_url?: string;
    webservice_token?: string;
    service_id?: string;
    default_extension?: string;
    webhook_secret?: string;
    smartcall_enabled?: boolean;
    default_dial_mode?: 'telefonchy_smartcall' | 'sip_link' | 'tel_link';
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
  ai_provider: {
    provider?: string;
    base_url?: string;
    model?: string;
    api_key?: string;
    has_api_key?: boolean;
    is_active?: boolean;
  };
  taxpayer_system: {
    integration_mode?: TaxpayerIntegrationMode;
    fiscal_id?: string;
    base_url?: string;
    private_key?: string;
    certificate_pem?: string;
    legacy_last_serial?: string | number;
    has_private_key?: boolean;
    has_certificate?: boolean;
    is_active?: boolean;
  };
};

const CONNECTION_TYPES: ConnectionType[] = [
  'sms',
  'email',
  'site',
  'voip',
  'telegram_bot',
  'bale_bot',
  'rubika_bot',
  'portal',
];

const CONNECTION_PANEL_SEARCH_TEXT: Record<string, string> = {
  sms: 'پیامک ملی پیامک otp احراز پیام',
  email: 'ایمیل smtp mail',
  site: 'سایت api webhook',
  voip: 'تلفن voip تلفنچی telefonchy تماس داخلی اپراتور smartcall',
  ai_provider: 'هوش مصنوعی ai openai avalai مدل',
  taxpayer_system: 'سامانه مودیان شناسه حافظه مالیاتی کلید خصوصی گواهی امضا سریال صورتحساب cer crt',
  telegram_bot: 'بات تلگرام telegram chat id',
  bale_bot: 'بات بله bale chat id',
  rubika_bot: 'بات روبیکا rubika chat id',
  portal: 'پورتال مشتریان portal',
};

const normalizeConnectionSearchText = (value: string) =>
  String(value || '')
    .replace(/[\u200c\u200f]/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const DEFAULT_VALUES: FormValues = {
  sms: {
    provider: 'meli_payamak',
    username: '',
    password: '',
    api_key: '',
    sender_number: '',
    body_id: '',
    webhook_secret: '',
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
  voip: {
    provider: 'telefonchy',
    base_url: 'https://panel.telefonchy.com',
    webservice_token: '',
    service_id: '',
    default_extension: '',
    webhook_secret: '',
    smartcall_enabled: true,
    default_dial_mode: 'telefonchy_smartcall',
    is_active: false,
  },
  telegram_bot: {
    provider: 'telegram_bot_api',
    bot_token: '',
    api_base_url: TELEGRAM_OFFICIAL_API_BASE_URL,
    webhook_secret: '',
    bot_username: '',
    is_active: false,
  },
  bale_bot: {
    provider: 'bale_bot_api',
    bot_token: '',
    api_base_url: BALE_OFFICIAL_API_BASE_URL,
    webhook_secret: '',
    bot_username: '',
    is_active: false,
  },
  rubika_bot: {
    provider: 'rubika_bot_api',
    bot_token: '',
    api_base_url: RUBIKA_OFFICIAL_API_BASE_URL,
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
  ai_provider: {
    provider: 'avalai',
    base_url: 'https://api.avalai.ir/v1',
    model: 'gpt-4o-mini',
    api_key: '',
    has_api_key: false,
    is_active: true,
  },
  taxpayer_system: {
    integration_mode: 'certificate_v2',
    fiscal_id: '',
    base_url: TAXPAYER_DEFAULT_BASE_URL,
    private_key: '',
    certificate_pem: '',
    legacy_last_serial: '',
    has_private_key: false,
    has_certificate: false,
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

const createWebhookSecret = (channel: BotChannel | 'sms' | 'voip') => {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `kalam-${channel}-${randomPart}`;
};

const taxpayerBaseUrlForMode = (mode?: string) =>
  mode === 'no_certificate_legacy' ? TAXPAYER_LEGACY_BASE_URL : TAXPAYER_V2_BASE_URL;

const toTimeValue = (value: unknown) => {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const pickPreferredConnectionRow = (rows: ConnectionRecord[]) => {
  if (!rows.length) return null;
  return [...rows].sort((left, right) => {
    const leftActive = left.is_active === true ? 1 : 0;
    const rightActive = right.is_active === true ? 1 : 0;
    if (leftActive !== rightActive) return rightActive - leftActive;

    const leftHasToken = String(left.settings?.bot_token || '').trim() ? 1 : 0;
    const rightHasToken = String(right.settings?.bot_token || '').trim() ? 1 : 0;
    if (leftHasToken !== rightHasToken) return rightHasToken - leftHasToken;

    const updatedDiff = toTimeValue(right.updated_at) - toTimeValue(left.updated_at);
    if (updatedDiff !== 0) return updatedDiff;

    return toTimeValue(right.created_at) - toTimeValue(left.created_at);
  })[0] || null;
};

const ConnectionsTab: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [smsTesting, setSmsTesting] = useState(false);
  const [smsBalanceLoading, setSmsBalanceLoading] = useState(false);
  const [smsBalance, setSmsBalance] = useState<string | null>(null);
  const [voipTesting, setVoipTesting] = useState(false);
  const [voipSyncing, setVoipSyncing] = useState(false);
  const [voipSyncInfo, setVoipSyncInfo] = useState<Record<string, any> | null>(null);
  const [taxpayerTesting, setTaxpayerTesting] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiCreditLoading, setAiCreditLoading] = useState(false);
  const [aiModelOptions, setAiModelOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [aiCreditInfo, setAiCreditInfo] = useState<Record<string, any> | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [rowIds, setRowIds] = useState<Partial<Record<ConnectionType, string>>>({});
  const [connectionSearch, setConnectionSearch] = useState('');
  const [activePanelKeys, setActivePanelKeys] = useState<string[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const smsWebhookSecret = Form.useWatch(['sms', 'webhook_secret'], form);
  const voipWebhookSecret = Form.useWatch(['voip', 'webhook_secret'], form);

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
    void fetchSessionBootstrap(supabase).then((snapshot) => {
      setCurrentOrgId(snapshot.orgId || snapshot.profile?.org_id || null);
    }).catch(() => setCurrentOrgId(null));
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

  const voipProviderOptions = useMemo(
    () => [{ label: 'تلفنچی', value: 'telefonchy' }],
    []
  );

  const voipDialModeOptions = useMemo(
    () => [
      { label: 'Smart Call تلفنچی', value: 'telefonchy_smartcall' },
      { label: 'لینک SIP', value: 'sip_link' },
      { label: 'لینک تلفن', value: 'tel_link' },
    ],
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

  const aiProviderOptions = useMemo(
    () => [
      { label: 'AvalAI', value: 'avalai' },
      { label: 'OpenAI', value: 'openai' },
      { label: 'ArvanCloud / Custom', value: 'custom' },
    ],
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
    webhook_secret: String(smsValues?.webhook_secret || '').trim(),
    inbound_webhook_secret: String(smsValues?.webhook_secret || '').trim(),
    is_flash: false,
  });

  const buildVoipRequestSettings = (voipValues: FormValues['voip']) => ({
    provider: String(voipValues?.provider || 'telefonchy').trim(),
    base_url: String(voipValues?.base_url || 'https://panel.telefonchy.com').trim(),
    webservice_token: String(voipValues?.webservice_token || '').trim(),
    service_id: String(voipValues?.service_id || '').trim(),
    default_extension: String(voipValues?.default_extension || '').trim(),
    webhook_secret: String(voipValues?.webhook_secret || '').trim(),
    smartcall_enabled: voipValues?.smartcall_enabled === true,
    default_dial_mode: voipValues?.default_dial_mode || 'telefonchy_smartcall',
    is_active: voipValues?.is_active === true,
  });

  const getTaxpayerSystemValues = (): FormValues['taxpayer_system'] =>
    form.getFieldValue('taxpayer_system') || DEFAULT_VALUES.taxpayer_system;

  const smsInboundWebhookUrl = useMemo(() => {
    const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
    const secret = String(smsWebhookSecret || '').trim();
    if (!supabaseUrl || !currentOrgId || !secret) return '';
    const params = new URLSearchParams({
      org_id: currentOrgId,
      secret,
    });
    return `${supabaseUrl}/functions/v1/melipayamak-inbound?${params.toString()}&to=$TO$&body=$TEXT$&from=$FROM$`;
  }, [currentOrgId, smsWebhookSecret]);

  const voipWebhookUrl = useMemo(() => {
    const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
    const secret = String(voipWebhookSecret || '').trim();
    if (!supabaseUrl || !currentOrgId || !secret) return '';
    const params = new URLSearchParams({
      org_id: currentOrgId,
      secret,
    });
    return `${supabaseUrl}/functions/v1/telefonchy_call_webhook?${params.toString()}`;
  }, [currentOrgId, voipWebhookSecret]);

  const buildTaxpayerSystemRequestSettings = () => {
    const values = getTaxpayerSystemValues();
    const integrationMode = values.integration_mode === 'no_certificate_legacy' ? 'no_certificate_legacy' : 'certificate_v2';
    return {
      integration_mode: integrationMode,
      fiscal_id: String(values.fiscal_id || '').trim().toUpperCase(),
      base_url: taxpayerBaseUrlForMode(integrationMode),
      private_key: String(values.private_key || '').trim(),
      certificate_pem: String(values.certificate_pem || '').trim(),
      legacy_last_serial: String(values.legacy_last_serial || '').trim(),
      is_active: values.is_active === true,
    };
  };

  const hasTaxpayerSystemInput = (values: FormValues['taxpayer_system'] | undefined) => {
    const merged = {
      ...DEFAULT_VALUES.taxpayer_system,
      ...(values || {}),
    };
    return (
      merged.is_active === true ||
      merged.has_private_key === true ||
      merged.has_certificate === true ||
      merged.integration_mode !== DEFAULT_VALUES.taxpayer_system.integration_mode ||
      Boolean(String(merged.fiscal_id || '').trim()) ||
      Boolean(String(merged.private_key || '').trim()) ||
      Boolean(String(merged.certificate_pem || '').trim()) ||
      Boolean(String(merged.legacy_last_serial || '').trim())
    );
  };

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

      const groupedByType = new Map<ConnectionType, ConnectionRecord[]>();
      (data || []).forEach((row: any) => {
        const type = String(row?.connection_type || '') as ConnectionType;
        if (!CONNECTION_TYPES.includes(type)) return;
        groupedByType.set(type, [...(groupedByType.get(type) || []), row as ConnectionRecord]);
      });

      const byType: Partial<Record<ConnectionType, ConnectionRecord>> = {};
      CONNECTION_TYPES.forEach((type) => {
        const picked = pickPreferredConnectionRow(groupedByType.get(type) || []);
        if (picked) byType[type] = picked;
      });

      setRowIds({
        sms: byType.sms?.id,
        email: byType.email?.id,
        site: byType.site?.id,
        voip: byType.voip?.id,
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
        voip: {
          ...DEFAULT_VALUES.voip,
          provider: String(byType.voip?.provider || DEFAULT_VALUES.voip.provider),
          ...(byType.voip?.settings || {}),
          is_active: byType.voip?.is_active ?? DEFAULT_VALUES.voip.is_active,
        },
        telegram_bot: {
          ...DEFAULT_VALUES.telegram_bot,
          provider: String(byType.telegram_bot?.provider || DEFAULT_VALUES.telegram_bot.provider),
          ...(byType.telegram_bot?.settings || {}),
          api_base_url: TELEGRAM_OFFICIAL_API_BASE_URL,
          is_active: byType.telegram_bot?.is_active ?? DEFAULT_VALUES.telegram_bot.is_active,
        },
        bale_bot: {
          ...DEFAULT_VALUES.bale_bot,
          provider: String(byType.bale_bot?.provider || DEFAULT_VALUES.bale_bot.provider),
          ...(byType.bale_bot?.settings || {}),
          api_base_url: BALE_OFFICIAL_API_BASE_URL,
          is_active: byType.bale_bot?.is_active ?? DEFAULT_VALUES.bale_bot.is_active,
        },
        rubika_bot: {
          ...DEFAULT_VALUES.rubika_bot,
          provider: String(byType.rubika_bot?.provider || DEFAULT_VALUES.rubika_bot.provider),
          ...(byType.rubika_bot?.settings || {}),
          api_base_url: RUBIKA_OFFICIAL_API_BASE_URL,
          is_active: byType.rubika_bot?.is_active ?? DEFAULT_VALUES.rubika_bot.is_active,
        },
        portal: {
          ...DEFAULT_VALUES.portal,
          provider: String(byType.portal?.provider || DEFAULT_VALUES.portal.provider),
          ...(byType.portal?.settings || {}),
          is_active: byType.portal?.is_active ?? DEFAULT_VALUES.portal.is_active,
        },
        ai_provider: DEFAULT_VALUES.ai_provider,
        taxpayer_system: DEFAULT_VALUES.taxpayer_system,
      };

      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke('ai-assistant', {
          body: { action: 'get_provider_settings' },
        });
        if (aiError) throw aiError;
        if (aiData?.success && aiData?.settings) {
          nextValues.ai_provider = {
            ...DEFAULT_VALUES.ai_provider,
            provider: String(aiData.settings.provider || DEFAULT_VALUES.ai_provider.provider),
            base_url: String(aiData.settings.base_url || DEFAULT_VALUES.ai_provider.base_url),
            model: String(aiData.settings.model || DEFAULT_VALUES.ai_provider.model),
            api_key: '',
            has_api_key: aiData.settings.has_api_key === true,
            is_active: aiData.settings.is_active !== false,
          };
          if (nextValues.ai_provider.model) {
            setAiModelOptions((prev) => {
              const map = new Map(prev.map((item) => [item.value, item]));
              map.set(String(nextValues.ai_provider.model), {
                label: String(nextValues.ai_provider.model),
                value: String(nextValues.ai_provider.model),
              });
              return Array.from(map.values());
            });
          }
        }
      } catch (aiError) {
        console.warn('Could not load AI provider settings', aiError);
      }

      try {
        const { data: taxpayerData, error: taxpayerError } = await supabase.functions.invoke('taxpayer_system', {
          body: { action: 'get_settings' },
        });
        if (taxpayerError) throw taxpayerError;
        if (taxpayerData?.success && taxpayerData?.settings) {
          const taxpayerSettings = taxpayerData.settings;
          const integrationMode =
            taxpayerSettings.integration_mode === 'no_certificate_legacy' ? 'no_certificate_legacy' : 'certificate_v2';
          nextValues.taxpayer_system = {
            ...DEFAULT_VALUES.taxpayer_system,
            integration_mode: integrationMode,
            fiscal_id: String(taxpayerSettings.fiscal_id || ''),
            base_url: taxpayerBaseUrlForMode(integrationMode),
            private_key: '',
            certificate_pem: '',
            legacy_last_serial: taxpayerSettings.legacy_last_serial ? String(taxpayerSettings.legacy_last_serial) : '',
            has_private_key: taxpayerSettings.has_private_key === true,
            has_certificate: taxpayerSettings.has_certificate === true,
            is_active: taxpayerSettings.is_active === true,
          };
        }
      } catch (taxpayerError) {
        console.warn('Could not load taxpayer system settings', taxpayerError);
      }

      form.setFieldsValue(nextValues);
      setSmsBalance(null);
      setAiCreditInfo(null);
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
      const currentSmsValues = {
        ...(form.getFieldValue('sms') || {}),
        ...(values.sms || {}),
      };
      const currentPortalValues = {
        ...(form.getFieldValue('portal') || {}),
        ...(values.portal || {}),
      };
      const currentVoipValues = {
        ...(form.getFieldValue('voip') || {}),
        ...(values.voip || {}),
      };
      const currentAiProviderValues = {
        ...(form.getFieldValue('ai_provider') || {}),
        ...(values.ai_provider || {}),
      };
      const currentTaxpayerSystemValues = {
        ...(form.getFieldValue('taxpayer_system') || {}),
        ...(values.taxpayer_system || {}),
      };
      const normalizedRubikaValues = {
        ...(values.rubika_bot || {}),
        api_base_url: RUBIKA_OFFICIAL_API_BASE_URL,
      };
      const normalizedTelegramValues = {
        ...(values.telegram_bot || {}),
        api_base_url: TELEGRAM_OFFICIAL_API_BASE_URL,
      };
      const normalizedBaleValues = {
        ...(values.bale_bot || {}),
        api_base_url: BALE_OFFICIAL_API_BASE_URL,
      };
      const ensuredTelegramSecret = String(normalizedTelegramValues?.webhook_secret || '').trim() || createWebhookSecret('telegram');
      const ensuredBaleSecret = String(normalizedBaleValues?.webhook_secret || '').trim() || createWebhookSecret('bale');
      const ensuredRubikaSecret = String(normalizedRubikaValues?.webhook_secret || '').trim() || createWebhookSecret('rubika');

      form.setFieldsValue({
        telegram_bot: { ...normalizedTelegramValues, webhook_secret: ensuredTelegramSecret },
        bale_bot: { ...normalizedBaleValues, webhook_secret: ensuredBaleSecret },
        rubika_bot: { ...normalizedRubikaValues, webhook_secret: ensuredRubikaSecret, api_base_url: RUBIKA_OFFICIAL_API_BASE_URL },
      });
      setSaving(true);

      const rows: Array<Record<string, any>> = [
        {
          id: rowIds.sms,
          connection_type: 'sms',
          provider: values.sms?.provider || 'meli_payamak',
          settings: buildSmsOverrideSettings(currentSmsValues),
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
          id: rowIds.voip,
          connection_type: 'voip',
          provider: currentVoipValues.provider || 'telefonchy',
          settings: {
            base_url: currentVoipValues.base_url || 'https://panel.telefonchy.com',
            webservice_token: currentVoipValues.webservice_token || '',
            service_id: currentVoipValues.service_id || '',
            default_extension: currentVoipValues.default_extension || '',
            webhook_secret: currentVoipValues.webhook_secret || '',
            smartcall_enabled: currentVoipValues.smartcall_enabled === true,
            default_dial_mode: currentVoipValues.default_dial_mode || 'telefonchy_smartcall',
          },
          is_active: currentVoipValues.is_active === true,
        },
        {
          id: rowIds.telegram_bot,
          connection_type: 'telegram_bot',
          provider: normalizedTelegramValues?.provider || 'telegram_bot_api',
          settings: {
            bot_token: normalizedTelegramValues?.bot_token || '',
            api_base_url: TELEGRAM_OFFICIAL_API_BASE_URL,
            webhook_secret: ensuredTelegramSecret,
            bot_username: normalizedTelegramValues?.bot_username || '',
          },
          is_active: normalizedTelegramValues?.is_active === true,
        },
        {
          id: rowIds.bale_bot,
          connection_type: 'bale_bot',
          provider: normalizedBaleValues?.provider || 'bale_bot_api',
          settings: {
            bot_token: normalizedBaleValues?.bot_token || '',
            api_base_url: BALE_OFFICIAL_API_BASE_URL,
            webhook_secret: ensuredBaleSecret,
            bot_username: normalizedBaleValues?.bot_username || '',
          },
          is_active: normalizedBaleValues?.is_active === true,
        },
        {
          id: rowIds.rubika_bot,
          connection_type: 'rubika_bot',
          provider: normalizedRubikaValues?.provider || 'rubika_bot_api',
          settings: {
            bot_token: normalizedRubikaValues?.bot_token || '',
            api_base_url: RUBIKA_OFFICIAL_API_BASE_URL,
            webhook_secret: ensuredRubikaSecret,
            bot_name: normalizedRubikaValues?.bot_name || '',
          },
          is_active: normalizedRubikaValues?.is_active === true,
        },
        {
          id: rowIds.portal,
          connection_type: 'portal',
          provider: values.portal?.provider || 'customer_portal',
          settings: {
            portal_title: currentPortalValues.portal_title || '',
            portal_slug: currentPortalValues.portal_slug || '',
            login_mode: currentPortalValues.login_mode || 'otp',
            base_url: currentPortalValues.base_url || '',
            support_email: currentPortalValues.support_email || '',
            allow_file_download: currentPortalValues.allow_file_download !== false,
            allow_ticketing: currentPortalValues.allow_ticketing === true,
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

      const { data: aiSaveData, error: aiSaveError } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'save_provider_settings',
          settings: {
            provider: currentAiProviderValues.provider || 'avalai',
            base_url: currentAiProviderValues.base_url || 'https://api.avalai.ir/v1',
            model: currentAiProviderValues.model || 'gpt-4o-mini',
            api_key: currentAiProviderValues.api_key || '',
            is_active: currentAiProviderValues.is_active !== false,
          },
        },
      });
      if (aiSaveError) throw aiSaveError;
      if (!aiSaveData?.success) {
        throw new Error(String(aiSaveData?.message || 'ذخیره تنظیمات AI ناموفق بود.'));
      }
      if (aiSaveData?.settings) {
        form.setFieldsValue({
          ai_provider: {
            ...currentAiProviderValues,
            api_key: '',
            has_api_key: aiSaveData.settings.has_api_key === true,
          },
        });
      }
      if (hasTaxpayerSystemInput(currentTaxpayerSystemValues)) {
        const { data: taxpayerSaveData, error: taxpayerSaveError } = await supabase.functions.invoke('taxpayer_system', {
          body: {
            action: 'save_settings',
            settings: buildTaxpayerSystemRequestSettings(),
          },
        });
        if (taxpayerSaveError) throw taxpayerSaveError;
        if (!taxpayerSaveData?.success) {
          throw new Error(String(taxpayerSaveData?.message || 'ذخیره تنظیمات سامانه مودیان ناموفق بود.'));
        }
        if (taxpayerSaveData?.settings) {
          form.setFieldsValue({
            taxpayer_system: {
              ...currentTaxpayerSystemValues,
              ...taxpayerSaveData.settings,
              private_key: '',
              has_private_key: taxpayerSaveData.settings.has_private_key === true,
              has_certificate: taxpayerSaveData.settings.has_certificate === true,
            },
          });
        }
      }

      const rubikaConnectionId = String(nextIds.rubika_bot || '').trim();
      if (normalizedRubikaValues?.is_active === true && rubikaConnectionId) {
        const { data: rubikaCaptureData, error: rubikaCaptureError } = await supabase.functions.invoke('bot-admin', {
          body: {
            action: 'start_capture',
            channel: 'rubika',
            connectionId: rubikaConnectionId,
          },
        });
        if (rubikaCaptureError || !rubikaCaptureData?.success) {
          message.warning('تنظیمات ذخیره شد، اما ثبت دوباره endpoint روبیکا کامل نشد. وضعیت بخش «خواندن آخرین چت‌آیدی روبیکا» را بررسی کنید.');
        } else if (rubikaCaptureData?.provider_result?.warning) {
          message.warning(`تنظیمات ذخیره شد، اما راه‌اندازی دریافت روبیکا هشدار داد: ${String(rubikaCaptureData.provider_result.warning)}`);
        }
      }

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

  const getAiProviderValues = () => form.getFieldValue('ai_provider') || {};

  const buildAiProviderRequestSettings = () => {
    const values = getAiProviderValues();
    return {
      provider: values.provider || 'avalai',
      base_url: values.base_url || 'https://api.avalai.ir/v1',
      model: values.model || 'gpt-4o-mini',
      api_key: values.api_key || '',
      is_active: values.is_active !== false,
    };
  };

  const handleFetchAiModels = async (options?: { silent?: boolean }) => {
    setAiModelsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'list_models',
          settings: buildAiProviderRequestSettings(),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'دریافت مدل‌ها ناموفق بود.'));
      const models = Array.isArray(data.models) ? data.models : [];
      const currentModel = String(getAiProviderValues()?.model || '').trim();
      const optionsMap = new Map<string, { label: string; value: string }>();
      models.forEach((item: any) => {
        const value = String(item?.id || item?.value || '').trim();
        if (!value) return;
        optionsMap.set(value, { label: String(item?.label || value), value });
      });
      if (currentModel && !optionsMap.has(currentModel)) {
        optionsMap.set(currentModel, { label: currentModel, value: currentModel });
      }
      const nextOptions = Array.from(optionsMap.values());
      setAiModelOptions(nextOptions);
      if (nextOptions.length && !currentModel) {
        form.setFieldValue(['ai_provider', 'model'], nextOptions[0].value);
      }
      if (!options?.silent) {
        if (data.warning) message.warning(String(data.warning));
        message.success('لیست مدل‌ها به‌روزرسانی شد.');
      }
      return nextOptions;
    } catch (err: any) {
      if (!options?.silent) message.error(toFaErrorMessage(err, 'خطا در دریافت مدل‌ها'));
      return [];
    } finally {
      setAiModelsLoading(false);
    }
  };

  const handleTestAiProvider = async () => {
    setAiTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'test_provider',
          settings: buildAiProviderRequestSettings(),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'تست اتصال AI ناموفق بود.'));
      message.success(data.message || 'اتصال AI برقرار است.');
      await handleFetchAiModels({ silent: true });
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در تست اتصال AI'));
    } finally {
      setAiTesting(false);
    }
  };

  const handleTestTaxpayerSystem = async () => {
    setTaxpayerTesting(true);
    try {
      const settings = buildTaxpayerSystemRequestSettings();
      const currentValues = getTaxpayerSystemValues();
      if (!settings.fiscal_id) {
        throw new Error('شناسه یکتای حافظه مالیاتی را وارد کنید.');
      }
      if (!settings.private_key && !currentValues.has_private_key) {
        throw new Error('کلید خصوصی امضای سامانه مودیان را وارد و ذخیره کنید.');
      }
      if (settings.integration_mode === 'certificate_v2' && !settings.certificate_pem && !currentValues.has_certificate) {
        throw new Error('برای مسیر نسخه ۲، گواهی امضا را وارد و ذخیره کنید.');
      }

      const { data: saveData, error: saveError } = await supabase.functions.invoke('taxpayer_system', {
        body: {
          action: 'save_settings',
          settings,
        },
      });
      if (saveError) throw saveError;
      if (!saveData?.success) {
        throw new Error(String(saveData?.message || 'ذخیره تنظیمات سامانه مودیان ناموفق بود.'));
      }
      if (saveData?.settings) {
        form.setFieldsValue({
          taxpayer_system: {
            ...currentValues,
            ...saveData.settings,
            private_key: '',
            certificate_pem: '',
            has_private_key: saveData.settings.has_private_key === true,
            has_certificate: saveData.settings.has_certificate === true,
          },
        });
      }

      const { data, error } = await supabase.functions.invoke('taxpayer_system', {
        body: { action: 'test_connection' },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(String(data?.message || 'تست اتصال سامانه مودیان ناموفق بود.'));
      }
      message.success(String(data?.message || 'اتصال سامانه مودیان برقرار است.'));
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در تست اتصال سامانه مودیان'));
    } finally {
      setTaxpayerTesting(false);
    }
  };

  const handleFetchAiCredit = async () => {
    setAiCreditLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'get_credit',
          settings: buildAiProviderRequestSettings(),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'دریافت اعتبار AI ناموفق بود.'));
      setAiCreditInfo(data);
      if (data.available === false) {
        message.warning(String(data.message || 'مسیر مشاهده اعتبار برای این provider پشتیبانی نشد.'));
      } else {
        message.success('اعتبار AI دریافت شد.');
      }
    } catch (err: any) {
      setAiCreditInfo(null);
      message.error(toFaErrorMessage(err, 'خطا در مشاهده اعتبار AI'));
    } finally {
      setAiCreditLoading(false);
    }
  };

  const renderAiCreditSummary = () => {
    if (!aiCreditInfo) return null;
    if (aiCreditInfo.available === false) {
      return (
        <Alert
          type="warning"
          showIcon
          className="mt-3"
          message="مشاهده اعتبار برای این provider از مسیر عمومی پشتیبانی نشد."
          description={aiCreditInfo.message}
        />
      );
    }
    const credit = aiCreditInfo.credit || {};
    const parts = [
      credit.value !== null && credit.value !== undefined ? `اعتبار: ${String(credit.value)} ${credit.currency || ''}`.trim() : '',
      credit.toman ? `تومان: ${Number(credit.toman).toLocaleString('fa-IR')}` : '',
      credit.rial ? `ریال: ${Number(credit.rial).toLocaleString('fa-IR')}` : '',
      credit.token ? `توکن: ${Number(credit.token).toLocaleString('fa-IR')}` : '',
    ].filter(Boolean);
    return (
      <Alert
        type="success"
        showIcon
        className="mt-3"
        message="اعتبار سرویس AI"
        description={parts.length ? parts.join(' · ') : 'پاسخ provider دریافت شد، اما مقدار استانداردی برای اعتبار پیدا نشد.'}
      />
    );
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
        title: 'پیامک تست',
        metadata: {
          source_type: 'settings_test_sms',
          source_module: 'settings_connections',
        },
      });
      const providerResult = Array.isArray(result?.provider_results) ? result.provider_results[0] : null;
      const providerToken = String(providerResult?.result || '').trim();
      const providerMethod = String(result?.provider_method || providerResult?.method || '').trim();
      message.info(
        providerToken
          ? `${providerMethod ? `روش ارسال: ${providerMethod}. ` : ''}شناسه ثبت درخواست provider: ${providerToken}. این پاسخ فقط ثبت درخواست در سامانه پیامک را نشان می‌دهد و به معنی تایید تحویل نهایی به گوشی نیست.`
          : 'درخواست ارسال در provider ثبت شد، اما شناسه‌ای برای نمایش برنگشت. تحویل نهایی به گوشی از این مسیر تایید نمی‌شود.'
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

  const handleTestVoipConnection = async () => {
    const voipValues = form.getFieldValue('voip') || {};
    const settings = buildVoipRequestSettings(voipValues);
    if (settings.provider !== 'telefonchy') {
      message.error('در حال حاضر فقط تست اتصال تلفنچی پشتیبانی می‌شود.');
      return;
    }
    if (!settings.base_url) {
      message.error('Base URL تلفنچی را وارد کنید.');
      return;
    }
    if (!settings.webservice_token) {
      message.error('Webservice Token تلفنچی را وارد کنید.');
      return;
    }
    if (!settings.service_id) {
      message.error('Service ID تلفنچی را وارد کنید.');
      return;
    }

    setVoipTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('telefonchy_smartcall', {
        body: {
          action: 'test_connection',
          overrideSettings: settings,
        },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(String(data?.message || 'تست اتصال VoIP ناموفق بود.'));
      }
      message.success(String(data?.message || 'اتصال تلفنچی برقرار است.'));
      if (Number(data?.sample_count || 0) === 0) {
        message.info('اتصال برقرار است، اما در بازه تست نمونه تماسی از API برنگشت.');
      }
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در تست اتصال VoIP'));
    } finally {
      setVoipTesting(false);
    }
  };

  const handleSyncRecentVoipCalls = async () => {
    const voipValues = form.getFieldValue('voip') || {};
    const settings = buildVoipRequestSettings(voipValues);
    if (!settings.webservice_token || !settings.service_id) {
      message.error('برای همگام‌سازی، Webservice Token و Service ID تلفنچی لازم است.');
      return;
    }

    setVoipSyncing(true);
    setVoipSyncInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke('telefonchy_smartcall', {
        body: {
          action: 'sync_recent_calls',
          overrideSettings: settings,
          days: 7,
          perPage: 50,
        },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(String(data?.message || 'همگام‌سازی تماس‌های VoIP ناموفق بود.'));
      }
      setVoipSyncInfo(data);
      message.success(String(data?.message || 'تماس‌های اخیر VoIP همگام‌سازی شد.'));
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در همگام‌سازی تماس‌های VoIP'));
    } finally {
      setVoipSyncing(false);
    }
  };

  const handleSendTestBot = async (channel: BotChannel) => {
    const formKey = BOT_FORM_KEYS[channel];
    try {
      const botValues = form.getFieldValue(formKey) || {};
      const botToken = String(botValues?.bot_token || '').trim();
      const apiBaseUrl = OFFICIAL_BOT_API_BASE_URL[channel];
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

      const row = data?.found && data?.contact
        ? ({
          ...(data.contact as BotInboundContact),
          provider_debug: data?.provider_debug || null,
          provider_result_count: Number(data?.provider_result_count || 0) || 0,
          capture_diagnostic: data?.capture_diagnostic && typeof data.capture_diagnostic === 'object'
            ? data.capture_diagnostic
            : null,
        } as BotInboundContact)
        : null;
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
      if (data?.provider_result?.warning) {
        message.warning(`راه‌اندازی دریافت ${channel === 'rubika' ? 'روبیکا' : channel} با هشدار همراه بود: ${String(data.provider_result.warning)}`);
      }
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
                {channel === 'rubika' ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-2 py-2 text-[11px] text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
                    <div>تعداد آپدیت‌های provider: {contact.provider_result_count ?? 0}</div>
                    <div>وضعیت provider: {String(contact.provider_debug?.status || contact.capture_diagnostic?.provider_http_status || '-')}</div>
                    <div>پیام provider: {String(contact.provider_debug?.message || contact.capture_diagnostic?.warning || '-')}</div>
                    <div>webhook: {String(contact.capture_diagnostic?.webhook_url || '-')}</div>
                  </div>
                ) : null}
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

  const normalizedConnectionSearch = normalizeConnectionSearchText(connectionSearch);
  const shouldShowConnectionPanel = (key: string) => {
    if (!normalizedConnectionSearch) return true;
    const searchText = normalizeConnectionSearchText(CONNECTION_PANEL_SEARCH_TEXT[key] || key);
    return searchText.includes(normalizedConnectionSearch);
  };
  const hasVisibleConnectionPanel = Object.keys(CONNECTION_PANEL_SEARCH_TEXT).some((key) => shouldShowConnectionPanel(key));
  const visibleActivePanelKeys = activePanelKeys.filter((key) => shouldShowConnectionPanel(key));

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
        <div className="mb-4">
          <Input
            allowClear
            size="large"
            prefix={<SearchOutlined className="text-gray-400" />}
            placeholder="جستجو در اتصالات..."
            value={connectionSearch}
            onChange={(e) => setConnectionSearch(e.target.value)}
          />
        </div>
        <Collapse
          activeKey={visibleActivePanelKeys}
          className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
          expandIconPosition="end"
          onChange={(keys) =>
            setActivePanelKeys(Array.isArray(keys) ? keys.map((key) => String(key)) : keys ? [String(keys)] : [])
          }
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
                  <Form.Item label="رمز دریافت پیامک" name={['sms', 'webhook_secret']}>
                    <Input.Password
                      placeholder="برای URL دریافت پیامک ملی‌پیامک"
                      addonAfter={(
                        <Button
                          type="link"
                          size="small"
                          onClick={() => form.setFieldValue(['sms', 'webhook_secret'], createWebhookSecret('sms'))}
                        >
                          ساخت
                        </Button>
                      )}
                    />
                  </Form.Item>
                </div>

                  <div className="text-xs text-gray-500 mb-3">
                    مسیرهای فنی ملی‌پیامک داخل سیستم ثابت نگه داشته شده‌اند و از دید کاربر نمایش داده نمی‌شوند.
                    ورود با شماره از `Supabase Auth` استفاده می‌کند و برای فعال‌سازی واقعی آن باید تنظیمات
                    self-hosted را طبق فایل <code>SMS_AUTH_SETUP.md</code> انجام بدهی.
                  </div>

                  <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-3 mb-3 bg-gray-50/70 dark:bg-white/5">
                    <div className="font-semibold mb-2">URL دریافت پیامک</div>
                    <div className="text-xs text-gray-500 mb-2">
                      در پنل ملی‌پیامک همین URL را برای دریافت پیامک ثبت کن. پارامترها با الگوی مستندات ملی‌پیامک پر شده‌اند و endpoint باید پاسخ <code>ok</code> برگرداند.
                    </div>
                    <Input
                      dir="ltr"
                      readOnly
                      value={smsInboundWebhookUrl || 'برای ساخت URL، ابتدا تنظیمات را ذخیره کن و رمز دریافت پیامک داشته باش.'}
                      addonAfter={(
                        <Button
                          type="link"
                          size="small"
                          icon={<CopyOutlined />}
                          disabled={!smsInboundWebhookUrl}
                          onClick={async () => {
                            if (!smsInboundWebhookUrl) return;
                            await navigator.clipboard?.writeText(smsInboundWebhookUrl);
                            message.success('URL دریافت پیامک کپی شد.');
                          }}
                        >
                          کپی
                        </Button>
                      )}
                    />
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
              key: 'voip',
              label: 'اتصال تلفن VoIP',
              children: (
                <>
                  <Alert
                    type="info"
                    showIcon
                    className="mb-3"
                    message="اتصال فعلی برای کنترل و ثبت تماس است."
                    description="در این فاز مکالمه داخل مرورگر پیاده‌سازی نشده و تماس از طریق تلفنچی و کلاینت‌های SIP مثل PortSIP انجام می‌شود. KalamApp گزارش، ارتباط با رکوردها، اعلان و Smart Call را مدیریت می‌کند."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item label="ارائه‌دهنده VoIP" name={['voip', 'provider']}>
                      <Select options={voipProviderOptions} />
                    </Form.Item>
                    <Form.Item label="فعال" name={['voip', 'is_active']} valuePropName="checked">
                      <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                    </Form.Item>
                    <Form.Item label="Smart Call" name={['voip', 'smartcall_enabled']} valuePropName="checked">
                      <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                    </Form.Item>

                    <Form.Item label="Base URL" name={['voip', 'base_url']} className="md:col-span-2">
                      <Input placeholder="https://panel.telefonchy.com" />
                    </Form.Item>
                    <Form.Item label="حالت پیش‌فرض شماره‌گیری" name={['voip', 'default_dial_mode']}>
                      <Select options={voipDialModeOptions} />
                    </Form.Item>

                    <Form.Item label="Webservice Token" name={['voip', 'webservice_token']} className="md:col-span-2">
                      <Input.Password placeholder="توکن وب‌سرویس تلفنچی" autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item label="Service ID" name={['voip', 'service_id']}>
                      <Input placeholder="شناسه سرویس تلفنچی" />
                    </Form.Item>
                    <Form.Item label="داخلی پیش‌فرض" name={['voip', 'default_extension']}>
                      <Input placeholder="مثال: 101" />
                    </Form.Item>
                    <Form.Item label="Webhook Secret" name={['voip', 'webhook_secret']} className="md:col-span-2">
                      <Input.Password placeholder="برای اعتبارسنجی webhook داخلی" autoComplete="new-password" />
                    </Form.Item>
                    <div className="md:col-span-3">
                      <Space wrap>
                        <Button
                          icon={<SafetyCertificateOutlined />}
                          loading={voipTesting}
                          onClick={handleTestVoipConnection}
                        >
                          تست اتصال VoIP
                        </Button>
                        <Button
                          icon={<ReloadOutlined />}
                          loading={voipSyncing}
                          onClick={handleSyncRecentVoipCalls}
                        >
                          همگام‌سازی تماس‌های اخیر
                        </Button>
                        <Button
                          icon={<CopyOutlined />}
                          disabled={!voipWebhookUrl}
                          onClick={() => copyBotValue(voipWebhookUrl, 'آدرس Webhook تماس')}
                        >
                          کپی آدرس Webhook
                        </Button>
                      </Space>
                      {voipWebhookUrl ? (
                        <Alert
                          type="info"
                          showIcon
                          className="mt-3"
                          message="آدرس Webhook تماس‌های تلفنچی"
                          description={
                            <span dir="ltr" className="block break-all text-left">
                              {voipWebhookUrl}
                            </span>
                          }
                        />
                      ) : (
                        <Alert
                          type="warning"
                          showIcon
                          className="mt-3"
                          message="برای دریافت خودکار تماس‌ها، Webhook Secret و سازمان کاربر باید مشخص باشد."
                          description="اگر فقط با تلفن VoIP تماس بگیرید و Webhook تلفنچی روی این آدرس تنظیم نشده باشد، تماس به‌صورت خودکار وارد پروژه نمی‌شود. تا زمان تنظیم webhook از دکمه همگام‌سازی تماس‌ها استفاده کنید."
                        />
                      )}
                      {voipSyncInfo ? (
                        <Alert
                          type="success"
                          showIcon
                          className="mt-3"
                          message="نتیجه همگام‌سازی"
                          description={`دریافت‌شده از تلفنچی: ${Number(voipSyncInfo.fetched || 0).toLocaleString('fa-IR')}، ذخیره/بروزرسانی‌شده: ${Number(voipSyncInfo.saved || 0).toLocaleString('fa-IR')}`}
                        />
                      ) : null}
                    </div>
                  </div>
                </>
              ),
            },
            {
              key: 'ai_provider',
              label: (
                <span className="inline-flex items-center gap-2">
                  <AiSparkleIcon className="h-4 w-4" />
                  سرویس‌دهنده AI
                </span>
              ),
              children: (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item label="سرویس‌دهنده" name={['ai_provider', 'provider']}>
                      <Select options={aiProviderOptions} />
                    </Form.Item>
                    <Form.Item label="فعال" name={['ai_provider', 'is_active']} valuePropName="checked">
                      <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.ai_provider?.has_api_key !== next.ai_provider?.has_api_key}>
                      {({ getFieldValue }) => (
                        <div className="flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-700">
                          {getFieldValue(['ai_provider', 'has_api_key'])
                            ? 'کلید API برای این سازمان ذخیره شده است.'
                            : 'هنوز کلید API ذخیره نشده است.'}
                        </div>
                      )}
                    </Form.Item>

                    <Form.Item
                      label="Base URL"
                      name={['ai_provider', 'base_url']}
                      className="md:col-span-2"
                      rules={[{ required: true, message: 'Base URL را وارد کنید.' }]}
                    >
                      <Input placeholder="https://api.avalai.ir/v1" />
                    </Form.Item>
                    <Form.Item
                      label="Model"
                      name={['ai_provider', 'model']}
                      rules={[{ required: true, message: 'مدل را وارد کنید.' }]}
                    >
                      <AutoComplete
                        showSearch
                        placeholder="gpt-4o-mini"
                        options={aiModelOptions}
                        filterOption={(inputValue, option) =>
                          String(option?.label || option?.value || '').toLowerCase().includes(inputValue.toLowerCase())
                        }
                      />
                    </Form.Item>
                    <Form.Item
                      label="API Key"
                      name={['ai_provider', 'api_key']}
                      className="md:col-span-3"
                      extra="اگر قبلا کلید ذخیره شده، این فیلد را خالی بگذارید. فقط برای تغییر کلید مقدار جدید وارد کنید."
                    >
                      <Input.Password placeholder="کلید API سرویس‌دهنده AI" autoComplete="new-password" />
                    </Form.Item>
                  </div>
                  <Space wrap>
                    <Button
                      icon={<SendOutlined />}
                      loading={aiTesting}
                      onClick={handleTestAiProvider}
                    >
                      تست اتصال
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      loading={aiModelsLoading}
                      onClick={() => void handleFetchAiModels()}
                    >
                      دریافت مدل‌ها
                    </Button>
                    <Button
                      loading={aiCreditLoading}
                      onClick={handleFetchAiCredit}
                    >
                      مشاهده اعتبار
                    </Button>
                  </Space>
                  {renderAiCreditSummary()}
                </>
              ),
            },
            {
              key: 'taxpayer_system',
              label: (
                <span className="inline-flex items-center gap-2">
                  <SafetyCertificateOutlined />
                  اتصال سامانه مودیان
                </span>
              ),
              children: (
                <>
                  <Alert
                    type="info"
                    showIcon
                    className="mb-3"
                    message="تنظیمات ارسال مستقیم صورتحساب"
                    description="اطلاعات این بخش برای هر سازمان جداگانه ذخیره می‌شود. مسیر با گواهی از SDK نسخه ۲ و endpointهای requestsmanager/api/v2 استفاده می‌کند. مسیر بدون گواهی مطابق SDK 0.0.56 و endpoint self-tsp است و همچنان به کلید خصوصی معتبر همان حافظه مالیاتی نیاز دارد."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item label="فعال" name={['taxpayer_system', 'is_active']} valuePropName="checked">
                      <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                    </Form.Item>
                    <Form.Item
                      label="مسیر اتصال"
                      name={['taxpayer_system', 'integration_mode']}
                      extra="اگر گواهی امضا دارید مسیر نسخه ۲ را انتخاب کنید؛ بدون گواهی فقط با کلید خصوصی و شناسه حافظه مالیاتی ارسال می‌کند."
                    >
                      <Select options={TAXPAYER_INTEGRATION_MODE_OPTIONS} />
                    </Form.Item>
                    <Form.Item
                      label="شناسه یکتای حافظه مالیاتی"
                      name={['taxpayer_system', 'fiscal_id']}
                      extra="این شناسه ۶ کاراکتری است و باید دقیقاً مطابق اطلاعات کارپوشه مودی وارد شود."
                    >
                      <Input placeholder="مثال: A38MRA" maxLength={6} />
                    </Form.Item>
                    <Form.Item
                      label="آخرین سریال ثبت شده در نرم افزار قبلی"
                      name={['taxpayer_system', 'legacy_last_serial']}
                      extra="اگر قبلاً با نرم افزار دیگری ارسال داشته‌اید، آخرین سریال همان نرم افزار را وارد کنید تا شماره مالیاتی از عدد بعدی ادامه پیدا کند. می‌توانید عدد ده‌دهی، بخش هگز سریال، یا کل شناسه مالیاتی را وارد کنید. در نمونه ABCDEF04D2F000000009D7 بخش سریال صورتحساب 000000009D است."
                    >
                      <Input placeholder="مثال: 157 یا 000000009D یا ABCDEF04D2F000000009D7" />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.taxpayer_system?.has_private_key !== next.taxpayer_system?.has_private_key || prev.taxpayer_system?.has_certificate !== next.taxpayer_system?.has_certificate}>
                      {({ getFieldValue }) => {
                        const hasPrivateKey = getFieldValue(['taxpayer_system', 'has_private_key']);
                        const hasCertificate = getFieldValue(['taxpayer_system', 'has_certificate']);
                        return (
                          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-700">
                              {hasPrivateKey ? 'کلید خصوصی امضا برای این سازمان قبلاً ذخیره شده است.' : 'هنوز کلید خصوصی امضا برای این سازمان ذخیره نشده است.'}
                            </div>
                            <div className="flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-700">
                              {hasCertificate ? 'گواهی امضا برای این سازمان قبلاً ذخیره شده است.' : 'هنوز گواهی امضا برای این سازمان ذخیره نشده است.'}
                            </div>
                          </div>
                        );
                      }}
                    </Form.Item>
                    <Form.Item
                      label="کلید خصوصی امضا"
                      name={['taxpayer_system', 'private_key']}
                      className="md:col-span-3"
                      extra="اگر قبلاً کلید خصوصی ذخیره شده است، این فیلد را خالی بگذارید. در بسیاری از موارد خروجی GICA بدون BEGIN/END نمایش داده می‌شود؛ همان مقدار raw/base64 هم قابل ثبت است. فقط برای جایگزینی کلید، مقدار جدید را وارد کنید."
                    >
                      <Input.TextArea rows={5} placeholder="کلید خصوصی امضا" autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item
                      label="گواهی امضا"
                      name={['taxpayer_system', 'certificate_pem']}
                      className="md:col-span-3"
                      extra="گواهی امضای مرتبط با همین کلید خصوصی را وارد کنید. اگر فایل گواهی با پسوند cer یا crt دارید، محتوای آن را عیناً در این فیلد قرار دهید. اگر قبلاً گواهی ذخیره شده است، این فیلد را خالی بگذارید."
                    >
                      <Input.TextArea rows={4} placeholder="-----BEGIN CERTIFICATE-----" />
                    </Form.Item>
                  </div>
                  <Space wrap>
                    <Button
                      icon={<SendOutlined />}
                      loading={taxpayerTesting}
                      onClick={handleTestTaxpayerSystem}
                    >
                      ذخیره و تست اتصال
                    </Button>
                  </Space>
                </>
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
                      <Input readOnly disabled placeholder={TELEGRAM_OFFICIAL_API_BASE_URL} />
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
                      <Input readOnly disabled placeholder={BALE_OFFICIAL_API_BASE_URL} />
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
                      <Input readOnly disabled placeholder={RUBIKA_OFFICIAL_API_BASE_URL} />
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
          ].filter((item) => shouldShowConnectionPanel(String(item.key)))}
        />
        {normalizedConnectionSearch && !hasVisibleConnectionPanel ? (
          <Alert
            type="info"
            showIcon
            className="mt-4"
            message="موردی با این جستجو پیدا نشد."
          />
        ) : null}

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
