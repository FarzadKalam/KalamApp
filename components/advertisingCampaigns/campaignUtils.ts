import type {
  CampaignChannelConfig,
  CampaignRecord,
  CampaignSmsConfig,
  CampaignToolRecord,
  CampaignToolType,
} from './types';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export const normalizeCampaignDigits = (value: unknown): string => String(value ?? '')
  .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));

export const normalizeCampaignSenderNumber = (value: unknown): string => normalizeCampaignDigits(value)
  .replace(/[\s\-()]/g, '')
  .replace(/[^0-9+]/g, '')
  .replace(/(?!^)\+/g, '');

export const normalizeCampaignSenderNumbers = (values: unknown): string[] => {
  const source = Array.isArray(values) ? values : values ? [values] : [];
  return Array.from(new Set(source
    .map(normalizeCampaignSenderNumber)
    .filter((value) => /^\+?\d{3,20}$/.test(value))));
};

export const containsSmsOptOutPhrase = (value: unknown): boolean => {
  const normalized = normalizeCampaignDigits(value)
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/[\s\-_.,،؛:]+/g, '')
    .toLocaleLowerCase('fa-IR');
  return normalized.includes('لغو11');
};

const GSM_BASIC = new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'));
const GSM_EXTENDED = new Set(Array.from('^{}\\[~]|€'));

export type SmsPageEstimate = {
  encoding: 'gsm' | 'unicode';
  length: number;
  pages: number;
  remainingInPage: number;
  singlePageLimit: number;
  concatenatedPageLimit: number;
};

export const estimateSmsPages = (value: unknown): SmsPageEstimate => {
  const characters = Array.from(String(value ?? ''));
  const isGsm = characters.every((character) => GSM_BASIC.has(character) || GSM_EXTENDED.has(character));
  const length = isGsm
    ? characters.reduce((total, character) => total + (GSM_EXTENDED.has(character) ? 2 : 1), 0)
    : characters.length;
  const singlePageLimit = isGsm ? 160 : 70;
  const concatenatedPageLimit = isGsm ? 153 : 67;
  const pages = length === 0 ? 0 : length <= singlePageLimit ? 1 : Math.ceil(length / concatenatedPageLimit);
  const currentLimit = pages <= 1 ? singlePageLimit : pages * concatenatedPageLimit;
  return {
    encoding: isGsm ? 'gsm' : 'unicode',
    length,
    pages,
    remainingInPage: Math.max(0, currentLimit - length),
    singlePageLimit,
    concatenatedPageLimit,
  };
};

const safePositiveNumber = (value: unknown): number => {
  const numeric = Number(normalizeCampaignDigits(value).replace(/,/g, ''));
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

export const calculateSmsEstimatedCost = (input: {
  costPerPage?: unknown;
  audienceCount?: unknown;
  pages?: unknown;
  vatPercent?: unknown;
}): number => {
  const net = safePositiveNumber(input.costPerPage)
    * safePositiveNumber(input.audienceCount)
    * safePositiveNumber(input.pages);
  const vat = Math.min(100, safePositiveNumber(input.vatPercent));
  return Math.round(net * (1 + vat / 100) * 100) / 100;
};

export const getDefaultToolConfig = (toolType: CampaignToolType): CampaignChannelConfig => {
  if (toolType === 'sms') return {
    kind: 'sms', audience_sources: ['internal'], vat_percent: 10, inbound_enabled: false,
    inbound_match_mode: 'exact', inbound_expected_values: [], reply_window_value: 72,
    reply_window_unit: 'hour', attachments: [], import_attachments: [],
  };
  if (toolType === 'email') return {
    kind: 'email', audience_sources: ['internal'], vat_percent: 10,
    unsubscribe_footer_enabled: true, attachments: [], import_attachments: [],
  };
  if (toolType === 'bot_group' || toolType === 'bot_private') return {
    kind: toolType, channel: 'telegram', group_ids: [], audience_sources: ['internal'], attachments: [],
  };
  if (toolType === 'instagram_post') return { kind: 'instagram_post', attachments: [], content_items: [] };
  return { kind: 'manual', attachments: [], content_items: [], custom_values: {} };
};

export const createCampaignToolDraft = (
  campaignId: string,
  toolType: CampaignToolType,
): CampaignToolRecord => ({
  id: `draft:${toolType}`,
  campaign_id: campaignId,
  tool_type: toolType,
  enabled: true,
  status: 'draft',
  config: getDefaultToolConfig(toolType),
  estimated_cost: 0,
  actual_cost: 0,
  expected_leads: 0,
  expected_customers: 0,
  actual_leads: 0,
  actual_customers: 0,
  collaborator_user_ids: [],
  collaborator_role_ids: [],
});

export const createEmptyCampaign = (): CampaignRecord => ({
  id: '',
  name: '',
  status: 'draft',
  image_url: null,
  description: '',
  target_audience: '',
  start_at: null,
  end_at: null,
  assignee_id: null,
  assignee_role_id: null,
  assignee_type: null,
  viewer_user_ids: [],
  viewer_role_ids: [],
  tool_types: [],
  loyalty_rule_ids: [],
  discount_code_ids: [],
  tags: [],
});

export const splitIdentityTokens = (values: unknown): { userIds: string[]; roleIds: string[] } => {
  const source = Array.isArray(values) ? values : values ? [values] : [];
  const userIds: string[] = [];
  const roleIds: string[] = [];
  source.forEach((raw) => {
    const value = String(raw || '').trim();
    if (value.startsWith('role:')) roleIds.push(value.slice(5));
    else if (value.startsWith('user:')) userIds.push(value.slice(5));
  });
  return { userIds: Array.from(new Set(userIds)), roleIds: Array.from(new Set(roleIds)) };
};

export const joinIdentityTokens = (userIds?: string[], roleIds?: string[]): string[] => [
  ...(userIds || []).map((id) => `user:${id}`),
  ...(roleIds || []).map((id) => `role:${id}`),
];

export const mergeSmsConfig = (config: CampaignChannelConfig): CampaignSmsConfig => ({
  ...getDefaultToolConfig('sms'),
  ...(config || {}),
  kind: 'sms',
}) as CampaignSmsConfig;

export const getPersistedCampaignToolId = (toolId: unknown): string | null => {
  const normalized = String(toolId || '').trim();
  if (!normalized || normalized.startsWith('draft:')) return null;
  return normalized;
};

/**
 * ذخیرهٔ خودکار نباید بازه‌ای موقتاً نامعتبر را به پایگاه‌داده بفرستد. هنگام
 * جابه‌جایی یکی از دو سر بازه، سر مقابل در صورت نیاز با آن هماهنگ می‌شود.
 */
export const keepCampaignDateRangeValid = <T extends Record<string, any>>(
  current: T,
  patch: Partial<T>,
  startKey: keyof T,
  endKey: keyof T,
): Partial<T> => {
  const next = { ...current, ...patch };
  const start = next[startKey];
  const end = next[endKey];
  const startTime = start ? Date.parse(String(start)) : Number.NaN;
  const endTime = end ? Date.parse(String(end)) : Number.NaN;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime <= endTime) return patch;

  if (Object.prototype.hasOwnProperty.call(patch, startKey)) {
    return { ...patch, [endKey]: start } as Partial<T>;
  }
  if (Object.prototype.hasOwnProperty.call(patch, endKey)) {
    return { ...patch, [startKey]: end } as Partial<T>;
  }
  return patch;
};
