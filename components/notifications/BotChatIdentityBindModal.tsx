import React from 'react';
import { Alert, Checkbox, Empty, Input, Modal, Radio, Space, Tabs, Tag } from 'antd';
import type { BotTargetModuleId } from '../../utils/botPlatform';
import { FieldType } from '../../types';
import AdaptiveIdentityPicker from '../AdaptiveIdentityPicker';
import SmartFieldRenderer from '../SmartFieldRenderer';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import type { IdentityKind, IdentityOption } from '../../utils/identityDirectory';

type TargetOption = {
  value: string;
  label: string;
  meta?: string | null;
};

type MemberGroup = {
  id: string;
  title: string;
  channelLabel: string;
  statusLabel?: string | null;
  lastActivityAt?: string | null;
};

type BotChatIdentityBindModalProps = {
  open: boolean;
  loading?: boolean;
  saving?: boolean;
  channelLabel: string;
  chatId: string;
  displayName?: string | null;
  username?: string | null;
  phoneNumber?: string | null;
  existingBindingLabel?: string | null;
  targetModuleId: BotTargetModuleId;
  onChangeTargetModuleId: (value: BotTargetModuleId) => void;
  targetRecordId: string | null;
  onChangeTargetRecordId: (value: string | null) => void;
  targetOptions?: TargetOption[];
  searchValue?: string;
  onChangeSearchValue?: (value: string) => void;
  userOptions: Array<{ label: string; value: string }>;
  roleOptions: Array<{ label: string; value: string }>;
  allowedUserIds: string[];
  onChangeAllowedUserIds: (value: string[]) => void;
  allowedRoleIds: string[];
  onChangeAllowedRoleIds: (value: string[]) => void;
  aiAutoReplyEnabled: boolean;
  onChangeAiAutoReplyEnabled: (value: boolean) => void;
  aiCounterpartyGuide: string;
  onChangeAiCounterpartyGuide: (value: string) => void;
  memberGroups: MemberGroup[];
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

const MODULE_OPTIONS: Array<{ label: string; value: BotTargetModuleId }> = [
  { label: 'مشتری', value: 'customers' },
  { label: 'تأمین‌کننده', value: 'suppliers' },
  { label: 'کارمند', value: 'employees' },
];
const BOT_IDENTITY_MODAL_Z_INDEX = 15220;
const BOT_IDENTITY_SELECT_Z_INDEX = 15320;

const toIdentityOptions = (options: Array<{ label: string; value: string }>, kind: IdentityKind): IdentityOption[] =>
  (options || []).map((option) => ({
    kind,
    id: String(option.value || '').trim(),
    token: `${kind}:${String(option.value || '').trim()}` as IdentityOption['token'],
    label: String(option.label || '').trim() || (kind === 'role' ? 'نقش بدون عنوان' : 'کاربر بدون نام'),
    active: true,
  })).filter((option) => Boolean(option.id));

const BotChatIdentityBindModal: React.FC<BotChatIdentityBindModalProps> = ({
  open,
  loading = false,
  saving = false,
  channelLabel,
  chatId,
  displayName,
  username,
  phoneNumber,
  existingBindingLabel,
  targetModuleId,
  onChangeTargetModuleId,
  targetRecordId,
  onChangeTargetRecordId,
  userOptions,
  roleOptions,
  allowedUserIds,
  onChangeAllowedUserIds,
  allowedRoleIds,
  onChangeAllowedRoleIds,
  aiAutoReplyEnabled,
  onChangeAiAutoReplyEnabled,
  aiCounterpartyGuide,
  onChangeAiCounterpartyGuide,
  memberGroups,
  onClose,
  onSave,
}) => {
  const additionalUserOptions = React.useMemo(() => toIdentityOptions(userOptions, 'user'), [userOptions]);
  const additionalRoleOptions = React.useMemo(() => toIdentityOptions(roleOptions, 'role'), [roleOptions]);
  const resolveModalPopupContainer = React.useCallback((trigger?: HTMLElement | null) => {
    const modalBodyHost = trigger?.closest?.('.ant-modal-body, .ant-modal-content, .ant-modal') as HTMLElement | null;
    return modalBodyHost || resolveOverlayPopupContainer(trigger);
  }, []);
  const targetRelationField = React.useMemo(() => ({
    key: 'bot_identity_target_record_id',
    type: FieldType.RELATION,
    labels: { fa: 'رکورد مقصد' },
    label: 'رکورد مقصد',
    relationConfig: {
      targetModule: targetModuleId,
    },
  } as any), [targetModuleId]);

  return (
    <Modal
      open={open}
      title="تنظیمات حساب شخصی بات"
      onCancel={onClose}
      onOk={() => void onSave()}
      okText="ذخیره تنظیمات"
      cancelText="بستن"
      confirmLoading={saving}
      destroyOnHidden
      width={680}
      zIndex={BOT_IDENTITY_MODAL_Z_INDEX}
      okButtonProps={{ disabled: loading }}
    >
      <Tabs
        items={[
          {
            key: 'settings',
            label: 'تنظیمات حساب',
            children: (
              <div className="space-y-4">
                {existingBindingLabel ? (
                  <Alert
                    type="info"
                    showIcon
                    message={`این چت در حال حاضر به ${existingBindingLabel} وصل است.`}
                  />
                ) : null}

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5">
                  <div>پلتفرم: <span className="font-medium">{channelLabel}</span></div>
                  <div dir="ltr">Chat ID: <span className="font-medium">{chatId || '-'}</span></div>
                  {displayName ? <div>نام: <span className="font-medium">{displayName}</span></div> : null}
                  <Space size={[6, 6]} wrap className="mt-2">
                    {username ? <Tag color="blue" className="!m-0" dir="ltr">@{String(username).replace(/^@+/, '')}</Tag> : null}
                    {phoneNumber ? <Tag color="gold" className="!m-0" dir="ltr">{phoneNumber}</Tag> : null}
                  </Space>
                </div>

                <div>
                  <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">نوع رکورد</div>
                  <Radio.Group
                    value={targetModuleId}
                    onChange={(event) => {
                      const nextModuleId = event.target.value as BotTargetModuleId;
                      if (nextModuleId !== targetModuleId) {
                        onChangeTargetRecordId(null);
                      }
                      onChangeTargetModuleId(nextModuleId);
                    }}
                    optionType="button"
                    buttonStyle="solid"
                    options={MODULE_OPTIONS}
                  />
                </div>

                <div>
                  <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">رکورد مقصد</div>
                  <SmartFieldRenderer
                    field={targetRelationField}
                    value={targetRecordId || undefined}
                    onChange={(value: any) => onChangeTargetRecordId(String(value || '').trim() || null)}
                    forceEditMode
                    compactMode
                    overlayZIndexBase={BOT_IDENTITY_SELECT_Z_INDEX}
                    popupContainer={resolveModalPopupContainer}
                    preferLocalPopupContainer
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">کاربران مجاز برای ارسال پیام خصوصی</div>
                    <AdaptiveIdentityPicker
                      mode="multiple"
                      scopes={['user']}
                      valueMode="raw"
                      allowClear
                      value={allowedUserIds}
                      additionalOptions={additionalUserOptions}
                      onChange={(value) => onChangeAllowedUserIds((Array.isArray(value) ? value : []).map(String))}
                      placeholder="اگر خالی باشد، محدودیت اختصاصی ندارد"
                      overlayZIndexBase={BOT_IDENTITY_SELECT_Z_INDEX}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">نقش‌های مجاز برای ارسال پیام خصوصی</div>
                    <AdaptiveIdentityPicker
                      mode="multiple"
                      scopes={['role']}
                      valueMode="raw"
                      allowClear
                      value={allowedRoleIds}
                      additionalOptions={additionalRoleOptions}
                      onChange={(value) => onChangeAllowedRoleIds((Array.isArray(value) ? value : []).map(String))}
                      placeholder="اگر خالی باشد، محدودیت اختصاصی ندارد"
                      overlayZIndexBase={BOT_IDENTITY_SELECT_Z_INDEX}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-3 dark:border-violet-700/40 dark:bg-violet-900/20">
                  <Checkbox
                    checked={aiAutoReplyEnabled}
                    onChange={(event) => onChangeAiAutoReplyEnabled(Boolean(event.target.checked))}
                  >
                    پاسخگویی خودکار توسط هوش مصنوعی
                  </Checkbox>
                  {aiAutoReplyEnabled ? (
                    <div className="mt-3">
                      <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">پرامپت اولیه این کاربر</div>
                      <Input.TextArea
                        value={aiCounterpartyGuide}
                        onChange={(event) => onChangeAiCounterpartyGuide(event.target.value)}
                        autoSize={{ minRows: 4, maxRows: 8 }}
                        placeholder="نکات اختصاصی این مخاطب برای پاسخ‌دهی بهتر بات..."
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          },
          {
            key: 'groups',
            label: 'گروه‌های عضو',
            children: memberGroups.length > 0 ? (
              <div className="space-y-2">
                {memberGroups.map((group) => (
                  <div
                    key={group.id}
                    className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{group.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                          <Tag className="!m-0" color="blue">{group.channelLabel}</Tag>
                          {group.statusLabel ? <Tag className="!m-0" color="green">{group.statusLabel}</Tag> : null}
                        </div>
                      </div>
                      {group.lastActivityAt ? (
                        <div className="shrink-0 text-[11px] text-gray-400" dir="ltr">
                          {group.lastActivityAt}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="برای این چت آیدی هنوز عضویت گروهی ثبت نشده است."
              />
            ),
          },
        ]}
      />
    </Modal>
  );
};

export default BotChatIdentityBindModal;
