import React from 'react';
import { Button, Input, Modal, Select, Skeleton } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import {
  buildStandardSelectPopupRootStyle,
  KALAM_SELECT_FIELD_CLASSNAME,
  mergeClassNames,
  resolveSelectPopupContainer,
} from '../../utils/popupContainer';

type BotChannel = 'rubika' | 'telegram' | 'bale';

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
  watching: boolean;
  countdown: number;
  channel: BotChannel;
  groupTitle: string;
  currentStatus: string;
  activationCode: string;
  lastInboundAt: string;
  lastInboundText: string;
  allowedUserIds: string[];
  allowedRoleIds: string[];
  userOptions: Array<{ label: string; value: string }>;
  roleOptions: Array<{ label: string; value: string }>;
  onClose: () => void;
  onSave: () => void;
  onStartBindWatch: () => void;
  onCopyActivationCode: () => void;
  onChangeChannel: (channel: BotChannel) => void;
  onChangeAllowedUserIds: (value: string[]) => void;
  onChangeAllowedRoleIds: (value: string[]) => void;
};

const CounterpartyBotStatusModal: React.FC<CounterpartyBotStatusModalProps> = ({
  open,
  loading,
  saving,
  watching,
  countdown,
  channel,
  groupTitle,
  currentStatus,
  activationCode,
  lastInboundAt,
  lastInboundText,
  allowedUserIds,
  allowedRoleIds,
  userOptions,
  roleOptions,
  onClose,
  onSave,
  onStartBindWatch,
  onCopyActivationCode,
  onChangeChannel,
  onChangeAllowedUserIds,
  onChangeAllowedRoleIds,
}) => {
  const normalizedUserOptions = React.useMemo(
    () => ensureSelectedOptions(userOptions, allowedUserIds, 'کاربر'),
    [allowedUserIds, userOptions]
  );
  const normalizedRoleOptions = React.useMemo(
    () => ensureSelectedOptions(roleOptions, allowedRoleIds, 'نقش'),
    [allowedRoleIds, roleOptions]
  );

  return (
    <Modal
      title="وضعیت گروه بات طرف‌حساب"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      width={680}
      footer={[
        <Button key="cancel" onClick={onClose}>
          بستن
        </Button>,
        <Button key="save" loading={saving} onClick={onSave}>
          ذخیره تنظیمات
        </Button>,
        <Button key="bind" type="primary" loading={saving} disabled={watching} onClick={onStartBindWatch}>
          {watching ? 'در حال انتظار...' : 'انتظار برای پیام در گروه'}
        </Button>,
      ]}
    >
      {loading ? (
        <div className="py-6">
          <Skeleton active paragraph={{ rows: 5 }} />
        </div>
      ) : (
        <div className="space-y-3 text-gray-700 dark:text-gray-200">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            برای اتصال اولیه، روی «انتظار برای پیام در گروه» بزنید و کد فعال‌سازی را در همان گروه ارسال کنید
            (مثل: <span className="font-mono">/KALAM-...</span>). سیستم بعد از دریافت همان پیام، گروه را به همین
            طرف‌حساب متصل می‌کند و نام گروه به‌صورت خودکار ثبت می‌شود.
          </div>
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-700/40 dark:bg-blue-900/20 dark:text-blue-300">
            وضعیت فعلی: {COUNTERPARTY_BOT_STATUS_LABELS[currentStatus] || currentStatus || 'نامشخص'}
          </div>
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-300">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono">{activationCode || '-'}</span>
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
            آخرین پیام دریافتی: {lastInboundText || '-'}
            <div className="mt-1 text-[11px]">آخرین زمان: {lastInboundAt || '-'}</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">پلتفرم بات</div>
            <Select
              value={channel}
              options={CHANNEL_OPTIONS}
              onChange={(value) => onChangeChannel(value as BotChannel)}
              className={mergeClassNames(KALAM_SELECT_FIELD_CLASSNAME, 'w-full')}
              optionLabelProp="label"
              getPopupContainer={resolveSelectPopupContainer}
              styles={{ popup: { root: buildStandardSelectPopupRootStyle() } }}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">نام گروه شناسایی‌شده</div>
            <Input
              value={groupTitle}
              placeholder="بعد از اولین پیام گروه به‌صورت خودکار ثبت می‌شود"
              readOnly
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">کاربران مجاز برای این گروه بات</div>
            <Select
              mode="multiple"
              allowClear
              showSearch
              value={allowedUserIds}
              options={normalizedUserOptions}
              onChange={(value) => onChangeAllowedUserIds((value || []).map((id) => String(id)))}
              className={mergeClassNames(KALAM_SELECT_FIELD_CLASSNAME, 'w-full')}
              optionFilterProp="label"
              optionLabelProp="label"
              placeholder="اگر خالی باشد، همه کاربران مجازند"
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
              value={allowedRoleIds}
              options={normalizedRoleOptions}
              onChange={(value) => onChangeAllowedRoleIds((value || []).map((id) => String(id)))}
              className={mergeClassNames(KALAM_SELECT_FIELD_CLASSNAME, 'w-full')}
              optionFilterProp="label"
              optionLabelProp="label"
              placeholder="اگر خالی باشد، همه نقش‌ها مجازند"
              getPopupContainer={resolveSelectPopupContainer}
              popupMatchSelectWidth={false}
              styles={{ popup: { root: buildStandardSelectPopupRootStyle({ minWidth: 260 }) } }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
};

export default CounterpartyBotStatusModal;
