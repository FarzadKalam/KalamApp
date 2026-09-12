import React, { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Popover, Switch, Tooltip } from 'antd';
import {
  CopyOutlined,
  ExportOutlined,
  FileTextOutlined,
  InstagramOutlined,
  MailOutlined,
  MessageOutlined,
  RobotOutlined,
  SendOutlined,
} from '@ant-design/icons';
import AdaptiveSelectField from '../AdaptiveSelectField';
import type { WorkflowAction } from '../../utils/workflowTypes';
import {
  getWorkflowMessageChannels,
  getWorkflowMessageTextField,
  getWorkflowMessageTitleField,
  WORKFLOW_MESSAGE_CHANNEL_LABELS,
  WORKFLOW_MESSAGE_CHANNELS,
  type WorkflowMessageChannel,
} from '../../shared/workflowMessageAction';

const CHANNEL_VISUALS: Record<WorkflowMessageChannel, { icon: React.ReactNode; activeClass: string }> = {
  note: { icon: <FileTextOutlined />, activeClass: 'border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-400/70 dark:bg-sky-500/15 dark:text-sky-100' },
  sms: { icon: <MessageOutlined />, activeClass: 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-400/70 dark:bg-emerald-500/15 dark:text-emerald-100' },
  bot_group: { icon: <RobotOutlined />, activeClass: 'border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-400/70 dark:bg-violet-500/15 dark:text-violet-100' },
  bot_private: { icon: <SendOutlined />, activeClass: 'border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-400/70 dark:bg-indigo-500/15 dark:text-indigo-100' },
  instagram: { icon: <InstagramOutlined />, activeClass: 'border-pink-400 bg-pink-50 text-pink-800 dark:border-pink-400/70 dark:bg-pink-500/15 dark:text-pink-100' },
  email: { icon: <MailOutlined />, activeClass: 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-400/70 dark:bg-amber-500/15 dark:text-amber-100' },
};

type Props = {
  action: WorkflowAction;
  disabled?: boolean;
  recipientFieldOptions: Array<{ label: string; value: string }>;
  /** قرارداد لایهٔ نمایشِ سازندهٔ گردش‌کار برای popup انتخاب فیلدهای گیرنده. */
  recipientFieldPickerProps?: Pick<React.ComponentProps<typeof AdaptiveSelectField>, 'getPopupContainer' | 'modalContainer' | 'overlayZIndexBase' | 'adaptiveMode' | 'preferLocalPopupContainer' | 'listHeight' | 'popupMatchSelectWidth' | 'showSearch' | 'optionFilterProp'>;
  renderIdentityRecipientPicker: (value: unknown, onChange: (nextValue: any) => void, placeholder: string) => React.ReactNode;
  onConfigPatch: (patch: Record<string, any>) => void;
  onChannelsChange: (channels: WorkflowMessageChannel[]) => void;
  renderMessageTemplateButton: (fieldKey: string, title: string) => React.ReactNode;
  renderVariableTools: (targets: Array<{ key: string; label: string }>) => React.ReactNode;
  onInsertVariable: (fieldKey: string, variableKey: string) => void;
  onMessageTextSelection: (fieldKey: string, element: HTMLTextAreaElement) => void;
  webFormOptions: Array<{ label: string; value: string }>;
  webFormRelationModuleOptions: Array<{ label: string; value: string }>;
};

const WorkflowMessageActionFields: React.FC<Props> = ({
  action,
  disabled = false,
  recipientFieldOptions,
  recipientFieldPickerProps,
  renderIdentityRecipientPicker,
  onConfigPatch,
  onChannelsChange,
  renderMessageTemplateButton,
  renderVariableTools,
  onInsertVariable,
  onMessageTextSelection,
  webFormOptions,
  webFormRelationModuleOptions,
}) => {
  const config = action.config || {};
  const selectedChannels = getWorkflowMessageChannels(action);
  const [activeChannel, setActiveChannel] = useState<WorkflowMessageChannel | null>(() => selectedChannels[0] || null);

  const selectedSet = useMemo(() => new Set(selectedChannels), [selectedChannels]);
  const active = selectedSet.has(activeChannel as WorkflowMessageChannel)
    ? activeChannel
    : selectedChannels[0] || null;

  const updateChannels = (channel: WorkflowMessageChannel) => {
    const next = selectedSet.has(channel)
      ? selectedChannels.filter((item) => item !== channel)
      : [...selectedChannels, channel];
    onChannelsChange(next);
    setActiveChannel(next[0] || null);
  };

  const copyPopover = (mode: 'from' | 'to', channel: WorkflowMessageChannel, fieldKey: string) => {
    const alternatives = selectedChannels.filter((item) => item !== channel);
    if (alternatives.length === 0) {
      return <div className="max-w-56 text-xs text-gray-500">ابتدا حداقل یک کانال دیگر را فعال کنید.</div>;
    }
    const currentText = String(config[fieldKey] || '');
    if (mode === 'from') {
      return (
        <div className="w-64 space-y-2 p-1">
          <div className="text-xs text-gray-500">متن کدام پیام جایگزین این پیام شود؟</div>
          {alternatives.map((sourceChannel) => {
            const sourceField = getWorkflowMessageTextField(action, sourceChannel);
            return (
              <Button
                key={sourceChannel}
                block
                size="small"
                disabled={disabled}
                onClick={() => onConfigPatch({ [fieldKey]: String(config[sourceField] || '') })}
              >
                {WORKFLOW_MESSAGE_CHANNEL_LABELS[sourceChannel]}
              </Button>
            );
          })}
        </div>
      );
    }
    return (
      <div className="w-64 space-y-2 p-1">
        <div className="text-xs text-gray-500">متن فعلی روی کدام پیام‌ها کپی شود؟</div>
        <Checkbox.Group
          className="flex flex-col gap-1"
          options={alternatives.map((item) => ({ label: WORKFLOW_MESSAGE_CHANNEL_LABELS[item], value: item }))}
          disabled={disabled}
          onChange={(targets) => {
            const patch = (targets as WorkflowMessageChannel[]).reduce<Record<string, any>>((next, target) => {
              next[getWorkflowMessageTextField(action, target)] = currentText;
              return next;
            }, {});
            if (Object.keys(patch).length > 0) onConfigPatch(patch);
          }}
        />
      </div>
    );
  };

  const supportsAttachments = selectedChannels.some((channel) => ['note', 'bot_group', 'bot_private'].includes(channel));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {WORKFLOW_MESSAGE_CHANNELS.map((channel) => {
          const visual = CHANNEL_VISUALS[channel];
          const isActive = selectedSet.has(channel);
          return (
            <button
              key={channel}
              type="button"
              disabled={disabled}
              onClick={() => updateChannels(channel)}
              aria-pressed={isActive}
              className={`min-h-20 rounded-xl border p-2 text-center text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[rgba(var(--brand-400-rgb),0.55)] ${isActive ? visual.activeClass : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-gray-300'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <span className="mb-1 flex justify-center text-xl" aria-hidden>{visual.icon}</span>
              <span className="leading-5">{WORKFLOW_MESSAGE_CHANNEL_LABELS[channel]}</span>
            </button>
          );
        })}
      </div>

      <Input
        value={String(config[getWorkflowMessageTitleField(action)] || '')}
        disabled={disabled}
        onChange={(event) => onConfigPatch({ [getWorkflowMessageTitleField(action)]: event.target.value })}
        placeholder="عنوان پیام (اختیاری؛ برای گزارش‌ها و تشخیص ارسال‌ها)"
      />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <AdaptiveSelectField
          {...recipientFieldPickerProps}
          mode="multiple"
          value={Array.isArray(config.recipient_fields) ? config.recipient_fields : []}
          disabled={disabled}
          options={recipientFieldOptions}
          onChange={(nextValue) => onConfigPatch({ recipient_fields: nextValue, related_recipient_fields: [] })}
          placeholder="گیرنده‌های پیام از روی فیلدهای مرتبط"
          maxTagCount="responsive"
        />
        {renderIdentityRecipientPicker(
          config.recipient_assignees,
          (nextValue) => onConfigPatch({ recipient_assignees: nextValue, recipient_targets: [] }),
          'انتخاب کاربر/نقش/گروه داخلی',
        )}
      </div>

      {selectedSet.has('sms') ? (
        <AdaptiveSelectField
          mode="tags"
          value={Array.isArray(config.manual_numbers) ? config.manual_numbers : []}
          disabled={disabled}
          onChange={(nextValue) => onConfigPatch({ manual_numbers: nextValue })}
          tokenSeparators={[',', ';', ' ']}
          placeholder="شماره‌های دستی (فقط برای پیامک)"
        />
      ) : null}

      {supportsAttachments ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10">
          <div>
            <div className="text-sm font-medium">ارسال تصاویر و فایل‌های ستاره‌دار</div>
            <div className="text-xs text-gray-500">برای پیام داخلی و بات‌ها، فایل‌های ستاره‌دار همین رکورد نیز ارسال می‌شوند.</div>
          </div>
          <Switch
            checked={config.include_starred_attachments === true}
            disabled={disabled}
            onChange={(checked) => onConfigPatch({ include_starred_attachments: checked })}
          />
        </div>
      ) : null}

      {active ? (() => {
        const fieldKey = getWorkflowMessageTextField(action, active);
        const label = WORKFLOW_MESSAGE_CHANNEL_LABELS[active];
        return (
          <div className="space-y-3 rounded-xl border border-gray-200 p-3 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {selectedChannels.map((channel) => (
                  <Button
                    key={channel}
                    size="small"
                    type={channel === active ? 'primary' : 'default'}
                    onClick={() => setActiveChannel(channel)}
                    className={channel === active ? 'bg-leather-600 hover:!bg-leather-500' : ''}
                  >
                    {WORKFLOW_MESSAGE_CHANNEL_LABELS[channel]}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Tooltip title="کپی از پیام دیگر">
                  <Popover content={copyPopover('from', active, fieldKey)} trigger="click" placement="bottomLeft">
                    <Button size="small" shape="circle" icon={<CopyOutlined />} disabled={disabled} />
                  </Popover>
                </Tooltip>
                <Tooltip title="کپی به پیام دیگر">
                  <Popover content={copyPopover('to', active, fieldKey)} trigger="click" placement="bottomLeft">
                    <Button size="small" shape="circle" icon={<ExportOutlined />} disabled={disabled} />
                  </Popover>
                </Tooltip>
              </div>
            </div>
            <div className="flex justify-end">{renderMessageTemplateButton(fieldKey, `پیام‌های آماده ${label}`)}</div>
            <Input.TextArea
              rows={4}
              value={String(config[fieldKey] || '')}
              disabled={disabled}
              onChange={(event) => onConfigPatch({ [fieldKey]: event.target.value })}
              onFocus={(event) => onMessageTextSelection(fieldKey, event.currentTarget)}
              onSelect={(event) => onMessageTextSelection(fieldKey, event.currentTarget)}
              onKeyUp={(event) => onMessageTextSelection(fieldKey, event.currentTarget)}
              onClick={(event) => onMessageTextSelection(fieldKey, event.currentTarget)}
              placeholder={`متن ${label}`}
            />
            {renderVariableTools([{ key: fieldKey, label: `متن ${label}` }])}
            <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">ارسال وب‌فرم/نظرسنجی</div>
                  <div className="text-xs text-gray-500">برای هر اجرا یک لینک امن و اختصاصی به‌عنوان متغیر ساخته می‌شود.</div>
                </div>
                <Switch
                  checked={config.include_web_form_link === true}
                  disabled={disabled}
                  onChange={(checked) => onConfigPatch({ include_web_form_link: checked })}
                />
              </div>
              {config.include_web_form_link === true ? (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <AdaptiveSelectField
                      value={config.web_form_id || undefined}
                      disabled={disabled}
                      options={webFormOptions}
                      onChange={(value) => onConfigPatch({ web_form_id: value })}
                      placeholder="انتخاب وب‌فرم یا نظرسنجی"
                      pickerTitle="انتخاب وب‌فرم یا نظرسنجی"
                    />
                    <AdaptiveSelectField
                      value={config.web_form_related_module_id || undefined}
                      disabled={disabled || webFormRelationModuleOptions.length <= 1}
                      options={webFormRelationModuleOptions}
                      onChange={(value) => onConfigPatch({ web_form_related_module_id: value })}
                      placeholder="رکورد مرتبط با وب‌فرم/نظرسنجی"
                      pickerTitle="رکورد مرتبط با وب‌فرم/نظرسنجی"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button size="small" disabled={disabled || !config.web_form_id} onClick={() => onInsertVariable(fieldKey, 'web_form_link')}>
                      درج متغیر لینک وب‌فرم/نظرسنجی
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        );
      })() : (
        <div className="rounded-lg border border-dashed border-gray-300 p-3 text-center text-sm text-gray-500 dark:border-white/15">
          حداقل یک کانال ارسال را انتخاب کنید.
        </div>
      )}
    </div>
  );
};

export default WorkflowMessageActionFields;
