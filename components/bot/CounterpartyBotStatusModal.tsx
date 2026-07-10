import React from 'react';
import { Button, Checkbox, Input, Modal, Select, Skeleton, Tabs } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import {
  buildStandardSelectPopupRootStyle,
  KALAM_SELECT_FIELD_CLASSNAME,
  mergeClassNames,
  resolveSelectPopupContainer,
} from '../../utils/popupContainer';
import { getBotPlatformAvatarSrc } from '../../utils/botPlatform';

export type BotChannel = 'rubika' | 'telegram' | 'bale';

export type BotPlatformState = {
  groupTitle: string;
  groupJoinLink: string;
  directChatId: string;
  currentStatus: string;
  activationCode: string;
  lastInboundAt: string;
  lastInboundText: string;
  allowedUserIds: string[];
  allowedRoleIds: string[];
  aiAutoReplyEnabled: boolean;
  aiCounterpartyGuide: string;
};

export const DEFAULT_PLATFORM_STATE: BotPlatformState = {
  groupTitle: '',
  groupJoinLink: '',
  directChatId: '',
  currentStatus: 'pending_join',
  activationCode: '',
  lastInboundAt: '',
  lastInboundText: '',
  allowedUserIds: [],
  allowedRoleIds: [],
  aiAutoReplyEnabled: false,
  aiCounterpartyGuide: '',
};

const COUNTERPARTY_BOT_STATUS_LABELS: Record<string, string> = {
  pending_join_link: 'در انتظار پیام در گروه',
  pending_join: 'انتظار برای پیام در گروه',
  active: 'فعال',
  disabled: 'غیرفعال',
  error: 'خطا',
};

const CHANNEL_OPTIONS: Array<{ label: string; value: BotChannel }> = [
  { label: 'روبیکا', value: 'rubika' },
  { label: 'تلگرام', value: 'telegram' },
  { label: 'بله', value: 'bale' },
];

const CHANNEL_LABEL_BY_VALUE: Record<BotChannel, string> = CHANNEL_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {} as Record<BotChannel, string>);

const renderChannelTabLabel = (channel: BotChannel, label: string) => {
  const iconSrc = getBotPlatformAvatarSrc(channel);
  return (
    <span className="inline-flex items-center gap-1.5">
      {iconSrc ? <img src={iconSrc} alt="" className="h-4 w-4 rounded-full" /> : null}
      <span>{label}</span>
    </span>
  );
};

const STATUS_COLOR: Record<string, string> = {
  active: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-red-500',
  disabled: 'text-gray-400',
};

const ensureSelectedOptions = (
  options: Array<{ label: string; value: string }>,
  selectedValues: string[],
  fallbackPrefix: string
) => {
  const map = new Map<string, { label: string; value: string }>();
  (options || []).forEach((option) => {
    const value = String(option?.value || '').trim();
    if (!value) return;
    map.set(value, {
      label: String(option?.label || value).trim() || value,
      value,
    });
  });
  (selectedValues || []).forEach((rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value || map.has(value)) return;
    map.set(value, { value, label: `${fallbackPrefix} ${value}` });
  });
  return Array.from(map.values());
};

export type CounterpartyBotStatusModalProps = {
  open: boolean;
  loading: boolean;
  saving: boolean;
  watchingChannel?: BotChannel | null;
  countdown: number;
  activeTab?: BotChannel;
  defaultChannel?: BotChannel;
  fallbackToActive?: boolean;
  counterpartyType?: 'customer' | 'supplier' | 'employee';
  platforms?: Record<BotChannel, BotPlatformState>;
  userOptions: Array<{ label: string; value: string }>;
  roleOptions: Array<{ label: string; value: string }>;
  onClose: () => void;
  onSave: () => void;
  onChangeTab?: (channel: BotChannel) => void;
  onChangeDefaultChannel?: (channel: BotChannel) => void;
  onChangeFallbackToActive?: (value: boolean) => void;
  onStartBindWatch: (channel: BotChannel) => void;
  onCopyActivationCode: (channel: BotChannel) => void;
  onChangePlatform?: (channel: BotChannel, key: keyof BotPlatformState, value: any) => void;
  channel?: BotChannel;
  groupTitle?: string;
  currentStatus?: string;
  activationCode?: string;
  lastInboundAt?: string;
  lastInboundText?: string;
  allowedUserIds?: string[];
  allowedRoleIds?: string[];
  aiAutoReplyEnabled?: boolean;
  aiCounterpartyGuide?: string;
  onChangeAllowedUserIds?: (value: string[]) => void;
  onChangeAllowedRoleIds?: (value: string[]) => void;
  onChangeAiAutoReplyEnabled?: (value: boolean) => void;
  onChangeAiCounterpartyGuide?: (value: string) => void;
};

const PlatformTabContent: React.FC<{
  channel: BotChannel;
  state: BotPlatformState;
  watching: boolean;
  countdown: number;
  saving: boolean;
  userOptions: Array<{ label: string; value: string }>;
  roleOptions: Array<{ label: string; value: string }>;
  onChangePlatform: (key: keyof BotPlatformState, value: any) => void;
  onStartBindWatch: () => void;
  onCopyActivationCode: () => void;
}> = ({
  channel,
  state,
  watching,
  countdown,
  saving,
  userOptions,
  roleOptions,
  onChangePlatform,
  onStartBindWatch,
  onCopyActivationCode,
}) => {
  const channelLabel = CHANNEL_LABEL_BY_VALUE[channel] || '';
  const normalizedUserOptions = React.useMemo(
    () => ensureSelectedOptions(userOptions, state.allowedUserIds, 'کاربر'),
    [state.allowedUserIds, userOptions]
  );
  const normalizedRoleOptions = React.useMemo(
    () => ensureSelectedOptions(roleOptions, state.allowedRoleIds, 'نقش'),
    [state.allowedRoleIds, roleOptions]
  );
  const statusColor = STATUS_COLOR[state.currentStatus] || 'text-gray-700 dark:text-gray-300';

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">
        برای اتصال اولیه، روی «انتظار برای پیام در گروه» بزنید و کد فعال‌سازی را در همان گروه ارسال کنید.
        سیستم بعد از دریافت همان پیام، گروه را به این طرف‌حساب متصل می‌کند.
      </div>
      <div className={`rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs dark:border-blue-700/40 dark:bg-blue-900/20 ${statusColor}`}>
        وضعیت فعلی: <span className="font-medium">{COUNTERPARTY_BOT_STATUS_LABELS[state.currentStatus] || state.currentStatus || 'نامشخص'}</span>
      </div>
      <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-300">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono">{state.activationCode || '-'}</span>
          <Button size="small" icon={<CopyOutlined />} onClick={onCopyActivationCode}>
            کپی
          </Button>
        </div>
      </div>
      {watching ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
          در حال انتظار پیام... زمان باقی‌مانده: {toPersianNumber(String(countdown))}
        </div>
      ) : null}
      <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">
        آخرین پیام دریافتی: {state.lastInboundText || '-'}
        <div className="mt-1 text-[11px]">آخرین زمان: {state.lastInboundAt || '-'}</div>
      </div>
      <div>
        <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">نام گروه</div>
        <Input
          value={state.groupTitle}
          placeholder="نام گروه را وارد کنید"
          onChange={(e) => onChangePlatform('groupTitle', e.target.value)}
        />
      </div>
      <div>
        <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">لینک جوین گروه</div>
        <Input
          value={state.groupJoinLink}
          placeholder="لینک عضویت گروه را وارد کنید"
          onChange={(e) => onChangePlatform('groupJoinLink', e.target.value)}
        />
      </div>
      <div>
        <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">چت آیدی پی‌وی</div>
        <Input
          value={state.directChatId}
          placeholder="شناسه چت شخصی این پلتفرم را وارد کنید"
          onChange={(e) => onChangePlatform('directChatId', e.target.value)}
        />
      </div>
      <div className="rounded border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-700/40 dark:bg-violet-900/20">
        <Checkbox
          checked={state.aiAutoReplyEnabled}
          onChange={(event) => onChangePlatform('aiAutoReplyEnabled', Boolean(event.target.checked))}
        >
          پاسخگویی خودکار توسط هوش مصنوعی
        </Checkbox>
        {state.aiAutoReplyEnabled ? (
          <div className="mt-2">
            <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">
              توضیحات به هوش مصنوعی راجع به این مشتری/تامین‌کننده
            </div>
            <Input.TextArea
              value={state.aiCounterpartyGuide}
              onChange={(event) => onChangePlatform('aiCounterpartyGuide', event.target.value)}
              autoSize={{ minRows: 3, maxRows: 7 }}
              placeholder="نکات اختصاصی این مشتری/تامین‌کننده برای پاسخگویی دقیق‌تر بات..."
            />
          </div>
        ) : null}
      </div>
      <div>
        <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">کاربران مجاز برای این گروه بات</div>
        <Select
          mode="multiple"
          allowClear
          showSearch
          value={state.allowedUserIds}
          options={normalizedUserOptions}
          onChange={(value) => onChangePlatform('allowedUserIds', (value || []).map((id: any) => String(id)))}
          className={mergeClassNames(KALAM_SELECT_FIELD_CLASSNAME, 'w-full')}
          optionFilterProp="label"
          optionLabelProp="label"
          placeholder="اگر خالی باشد، فقط ایجادکننده دسترسی دارد"
          getPopupContainer={resolveSelectPopupContainer}
          popupMatchSelectWidth={false}
          styles={{ popup: { root: buildStandardSelectPopupRootStyle({ minWidth: 260 }) } }}
        />
      </div>
      <div>
        <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">نقش‌های مجاز برای این گروه بات</div>
        <Select
          mode="multiple"
          allowClear
          showSearch
          value={state.allowedRoleIds}
          options={normalizedRoleOptions}
          onChange={(value) => onChangePlatform('allowedRoleIds', (value || []).map((id: any) => String(id)))}
          className={mergeClassNames(KALAM_SELECT_FIELD_CLASSNAME, 'w-full')}
          optionFilterProp="label"
          optionLabelProp="label"
          placeholder="اگر خالی باشد، فقط ایجادکننده دسترسی دارد"
          getPopupContainer={resolveSelectPopupContainer}
          popupMatchSelectWidth={false}
          styles={{ popup: { root: buildStandardSelectPopupRootStyle({ minWidth: 260 }) } }}
        />
      </div>
      <div className="flex justify-end pt-1">
        <Button type="primary" loading={saving} disabled={watching} onClick={onStartBindWatch}>
          {watching ? `در حال انتظار ${channelLabel}...` : `انتظار برای پیام در گروه ${channelLabel}`}
        </Button>
      </div>
    </div>
  );
};

const CounterpartyBotStatusModal: React.FC<CounterpartyBotStatusModalProps> = ({
  open,
  loading,
  saving,
  watchingChannel,
  countdown,
  activeTab,
  defaultChannel,
  fallbackToActive,
  counterpartyType,
  platforms,
  userOptions,
  roleOptions,
  onClose,
  onSave,
  onChangeTab,
  onChangeDefaultChannel,
  onChangeFallbackToActive,
  onStartBindWatch,
  onCopyActivationCode,
  onChangePlatform,
  channel: legacyChannel,
  groupTitle,
  currentStatus,
  activationCode,
  lastInboundAt,
  lastInboundText,
  allowedUserIds,
  allowedRoleIds,
  aiAutoReplyEnabled,
  aiCounterpartyGuide,
  onChangeAllowedUserIds,
  onChangeAllowedRoleIds,
  onChangeAiAutoReplyEnabled,
  onChangeAiCounterpartyGuide,
}) => {
  const normalizedActiveTab = activeTab || legacyChannel || 'rubika';
  const normalizedDefaultChannel = defaultChannel || normalizedActiveTab;
  const counterpartyLabel = counterpartyType === 'supplier'
    ? 'تامین‌کننده'
    : counterpartyType === 'employee'
      ? 'کارمند'
      : 'مشتری';
  const legacyPlatformState: BotPlatformState = {
    groupTitle: groupTitle || '',
    groupJoinLink: '',
    directChatId: '',
    currentStatus: currentStatus || 'pending_join',
    activationCode: activationCode || '',
    lastInboundAt: lastInboundAt || '',
    lastInboundText: lastInboundText || '',
    allowedUserIds: allowedUserIds || [],
    allowedRoleIds: allowedRoleIds || [],
    aiAutoReplyEnabled: Boolean(aiAutoReplyEnabled),
    aiCounterpartyGuide: aiCounterpartyGuide || '',
  };
  const normalizedPlatforms: Record<BotChannel, BotPlatformState> = {
    rubika: { ...DEFAULT_PLATFORM_STATE, ...(platforms?.rubika || (normalizedActiveTab === 'rubika' ? legacyPlatformState : null) || {}) },
    telegram: { ...DEFAULT_PLATFORM_STATE, ...(platforms?.telegram || (normalizedActiveTab === 'telegram' ? legacyPlatformState : null) || {}) },
    bale: { ...DEFAULT_PLATFORM_STATE, ...(platforms?.bale || (normalizedActiveTab === 'bale' ? legacyPlatformState : null) || {}) },
  };
  const handlePlatformChange = (channel: BotChannel, key: keyof BotPlatformState, value: any) => {
    if (onChangePlatform) {
      onChangePlatform(channel, key, value);
      return;
    }
    if (key === 'allowedUserIds') onChangeAllowedUserIds?.(value);
    if (key === 'allowedRoleIds') onChangeAllowedRoleIds?.(value);
    if (key === 'aiAutoReplyEnabled') onChangeAiAutoReplyEnabled?.(Boolean(value));
    if (key === 'aiCounterpartyGuide') onChangeAiCounterpartyGuide?.(String(value || ''));
  };

  const tabItems = CHANNEL_OPTIONS.map(({ label, value: channel }) => ({
    key: channel,
    label: renderChannelTabLabel(channel, label),
    children: (
      <PlatformTabContent
        channel={channel}
        state={normalizedPlatforms[channel]}
        watching={watchingChannel === channel}
        countdown={watchingChannel === channel ? countdown : 0}
        saving={saving}
        userOptions={userOptions}
        roleOptions={roleOptions}
        onChangePlatform={(key, val) => handlePlatformChange(channel, key, val)}
        onStartBindWatch={() => onStartBindWatch(channel)}
        onCopyActivationCode={() => onCopyActivationCode(channel)}
      />
    ),
  }));

  return (
    <Modal
      title={`تنظیمات بات ${counterpartyLabel}`}
      open={open}
      onCancel={onClose}
      destroyOnHidden
      width={720}
      footer={[
        <Button key="cancel" onClick={onClose}>
          بستن
        </Button>,
        <Button key="save" loading={saving} onClick={onSave}>
          ذخیره تنظیمات
        </Button>,
      ]}
    >
      {loading ? (
        <div className="py-6">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      ) : (
        <div className="space-y-4 text-gray-700 dark:text-gray-200">
          {/* بخش پلتفرم پیش‌فرض */}
          <div className="rounded-lg border border-brand-200/60 bg-brand-50/40 px-4 py-3 space-y-3 dark:border-brand-300/20 dark:bg-white/5">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
              تنظیمات پیش‌فرض {counterpartyLabel}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">پلتفرم پیش‌فرض {counterpartyLabel}</div>
                <Select
                  value={normalizedDefaultChannel}
                  options={CHANNEL_OPTIONS}
                  onChange={(value) => onChangeDefaultChannel?.(value as BotChannel)}
                  className={mergeClassNames(KALAM_SELECT_FIELD_CLASSNAME, 'w-full')}
                  optionLabelProp="label"
                  getPopupContainer={resolveSelectPopupContainer}
                  styles={{ popup: { root: buildStandardSelectPopupRootStyle() } }}
                />
              </div>
              <div className="flex items-center pt-5">
                <Checkbox
                  checked={fallbackToActive}
                  onChange={(e) => onChangeFallbackToActive?.(Boolean(e.target.checked))}
                >
                  <span className="text-xs">در صورت قطع پلتفرم اصلی، از اولین پلتفرم فعال استفاده شود</span>
                </Checkbox>
              </div>
            </div>
          </div>

          {/* تب‌های پلتفرم */}
          <Tabs
            activeKey={normalizedActiveTab}
            onChange={(key) => onChangeTab?.(key as BotChannel)}
            items={tabItems}
            size="small"
          />
        </div>
      )}
    </Modal>
  );
};

export default CounterpartyBotStatusModal;
