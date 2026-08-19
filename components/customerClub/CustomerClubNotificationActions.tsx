import React, { useMemo, useState } from 'react';
import { Card, Collapse, Empty, Switch, Typography } from 'antd';
import WorkflowActionsBuilder from '../workflows/WorkflowActionsBuilder';
import type { ModuleField } from '../../types';
import type { WorkflowAction, WorkflowActionType } from '../../utils/workflowTypes';

const { Text } = Typography;

export type CustomerClubNotificationEvent = 'activation' | 'condition_met' | 'redemption' | 'reminder';
export type CustomerClubNotificationConfig = Partial<Record<CustomerClubNotificationEvent, {
  enabled: boolean;
  actions: WorkflowAction[];
}>>;

const eventCards: Array<{ key: CustomerClubNotificationEvent; title: string; description: string }> = [
  { key: 'activation', title: 'هنگام فعال‌سازی', description: 'پس از فعال شدن طرح یا کد' },
  { key: 'condition_met', title: 'هنگام وقوع شرط‌ها', description: 'وقتی مشتری شرایط طرح را محقق می‌کند' },
  { key: 'redemption', title: 'هنگام استفاده', description: 'هنگام مصرف اعتبار یا کد تخفیف' },
  { key: 'reminder', title: 'یادآوری‌ها', description: 'برای ارسال پیام‌های زمان‌دار' },
];

const communicationActions: Array<{ label: string; value: WorkflowActionType }> = [
  { label: 'پیامک', value: 'send_sms' },
  { label: 'پیام خصوصی بات', value: 'send_bot_message' },
  { label: 'گروه بات', value: 'send_note' },
  { label: 'ایمیل', value: 'send_email' },
  { label: 'اینستاگرام', value: 'send_instagram_message' },
];

type Props = {
  value?: CustomerClubNotificationConfig;
  onChange: (value: CustomerClubNotificationConfig) => void;
  variableFields: ModuleField[];
  disabled?: boolean;
};

/** تنظیمات پیام‌رسانی باشگاه همان سازندهٔ اقدام‌های گردش‌کار است؛ تنها موقعیت اجرا متفاوت است. */
const CustomerClubNotificationActions: React.FC<Props> = ({ value, onChange, variableFields, disabled = false }) => {
  const [openKeys, setOpenKeys] = useState<CustomerClubNotificationEvent[]>([]);
  const config = value || {};
  const moduleOptions = useMemo(() => [{ label: 'مشتریان', value: 'customers' }], []);
  const patchEvent = (event: CustomerClubNotificationEvent, patch: Partial<{ enabled: boolean; actions: WorkflowAction[] }>) => {
    onChange({
      ...config,
      [event]: { enabled: config[event]?.enabled === true, actions: config[event]?.actions || [], ...patch },
    });
  };

  return (
    <section className="mt-5 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="mb-3">
        <div className="font-semibold">اطلاع‌رسانی‌های طرح</div>
        <Text type="secondary">کانال، گیرنده، متن آماده و متغیرهای پیام دقیقاً با سازندهٔ اقدام‌های گردش‌کار تنظیم می‌شوند.</Text>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {eventCards.map((event) => (
          <Card key={event.key} size="small" className={config[event.key]?.enabled ? 'border-leather-500' : ''}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{event.title}</div>
                <Text type="secondary" className="text-xs">{event.description}</Text>
              </div>
              <Switch
                size="small"
                checked={config[event.key]?.enabled === true}
                disabled={disabled}
                onChange={(enabled) => {
                  patchEvent(event.key, { enabled });
                  if (enabled && !openKeys.includes(event.key)) setOpenKeys((keys) => [...keys, event.key]);
                }}
              />
            </div>
          </Card>
        ))}
      </div>
      <Collapse
        className="mt-3"
        activeKey={openKeys}
        onChange={(keys) => setOpenKeys(keys as CustomerClubNotificationEvent[])}
        items={eventCards.filter((event) => config[event.key]?.enabled).map((event) => ({
          key: event.key,
          label: event.title,
          children: (
            <WorkflowActionsBuilder
              value={config[event.key]?.actions || []}
              onChange={(actions) => patchEvent(event.key, { actions })}
              currentModuleId="customers"
              currentModuleFields={variableFields}
              variableFields={variableFields}
              moduleOptions={moduleOptions}
              dynamicOptions={{}}
              relationOptions={{}}
              actionOptions={communicationActions}
              customerClubReminderTiming
              disabled={disabled}
              overlayZIndexBase={31000}
            />
          ),
        }))}
      />
      {!eventCards.some((event) => config[event.key]?.enabled) ? <Empty className="mt-3" image={Empty.PRESENTED_IMAGE_SIMPLE} description="یک موقعیت اطلاع‌رسانی را فعال کنید" /> : null}
    </section>
  );
};

export default CustomerClubNotificationActions;
