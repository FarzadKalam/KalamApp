import React from 'react';
import { Checkbox, Input, InputNumber, Select } from 'antd';
import { getAgentTitleFa } from '../../utils/aiAgentCatalog';
import { MODULES } from '../../moduleRegistry';
import PersianDatePicker from '../PersianDatePicker';
import { formatAgentTaskScheduleFa } from '../../utils/aiAgentTaskPresentation';

type Props = { change: any; onChange: (change: any) => void; disabled?: boolean };
const operations: Record<string, string> = { create: 'ساخت کار خودکار', update: 'ویرایش کار خودکار', pause: 'توقف کار خودکار', resume: 'ادامهٔ کار خودکار' };
const weekdays = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const scheduleKinds = [{ value: 'daily', label: 'روزانه' }, { value: 'weekly', label: 'هفتگی' },
  { value: 'monthly', label: 'ماهانه' }, { value: 'interval', label: 'هر چند دقیقه' }, { value: 'once', label: 'یک‌بار' }];

/** Uses the same draft for create/update; the outer approval owns the single confirm. */
const AiAgentTaskApprovalCard: React.FC<Props> = ({ change, onChange, disabled }) => {
  const config = change?.config;
  if (!config) return null;
  const editing = !disabled && ['create', 'update'].includes(change.operation);
  const patchConfig = (patch: any) => onChange({ ...change, config: { ...config, ...patch } });
  const schedule = config.schedule;
  const patchSchedule = (patch: any) => patchConfig({ schedule: { ...schedule, ...patch } });
  return <div className="ai-approval-section space-y-3" dir="rtl">
    <div className="font-semibold">{operations[change.operation] || 'بررسی کار خودکار'} · {getAgentTitleFa(config.agentKey)}</div>
    <label className="block space-y-1"><span>عنوان کار</span>
      <Input aria-label="عنوان کار خودکار" value={change.name} disabled={!editing} maxLength={160} onChange={event => onChange({ ...change, name: event.target.value })} />
    </label>
    <label className="block space-y-1"><span>دستور بررسی</span>
      <Input.TextArea aria-label="دستور بررسی" value={config.instruction} disabled={!editing} maxLength={6000} autoSize={{ minRows: 2, maxRows: 6 }} onChange={event => patchConfig({ instruction: event.target.value })} />
    </label>
    <div><span className="font-semibold">منابع بررسی: </span>{config.sourceModuleIds.map((id: string) => MODULES[id]?.titles?.fa || 'ماژول مجاز').join('، ')}</div>
    <div className="flex flex-wrap items-center gap-2"><span>فعال‌کننده</span>
      <Select aria-label="فعال‌کننده کار" value={config.trigger} disabled={!editing} style={{ minWidth: 160 }} options={[
        { value: 'interval', label: 'برنامهٔ زمانی' }, { value: 'on_create', label: 'ساخت رکورد' }, { value: 'on_upsert', label: 'ساخت یا ویرایش رکورد' },
      ]} onChange={trigger => patchConfig({ trigger, schedule: trigger === 'interval' ? { kind: 'daily', at: '09:00', timeZone: 'Asia/Tehran' } : null })} />
    </div>
    {config.trigger === 'interval' && schedule ? <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2"><Select aria-label="تکرار اجرا" value={schedule.kind} disabled={!editing} options={scheduleKinds} style={{ minWidth: 140 }}
        onChange={kind => patchConfig({ schedule: { kind, timeZone: schedule.timeZone, ...(kind === 'interval' ? { minutes: 60 } : kind === 'once' ? { at: '' } : { at: '09:00', ...(kind === 'weekly' ? { weekdays: [6] } : kind === 'monthly' ? { day: 1, calendar: 'persian' } : {}) }) } })} />
        {schedule.kind === 'interval' ? <InputNumber aria-label="فاصله اجرا به دقیقه" disabled={!editing} min={5} max={525600} value={schedule.minutes} onChange={minutes => patchSchedule({ minutes })} />
          : schedule.kind === 'once' ? <PersianDatePicker type="DATETIME" value={schedule.at || null} disabled={!editing} pickerTitle="زمان اجرای کار" onChange={at => patchSchedule({ at })} />
            : <Input aria-label="ساعت اجرا" dir="ltr" type="time" style={{ width: 130 }} disabled={!editing} value={schedule.at} onChange={event => patchSchedule({ at: event.target.value })} />}
        {schedule.kind === 'monthly' ? <InputNumber aria-label="روز ماه" min={1} max={31} disabled={!editing} value={schedule.day} onChange={day => patchSchedule({ day })} /> : null}
        {schedule.kind === 'monthly' ? <Select aria-label="تقویم ماهانه" value={schedule.calendar || 'gregory'} disabled={!editing} style={{ minWidth: 130 }} options={[{ value: 'persian', label: 'ماه شمسی' }, { value: 'gregory', label: 'ماه میلادی' }]} onChange={calendar => patchSchedule({ calendar })} /> : null}
      </div>
      {schedule.kind === 'weekly' ? <Checkbox.Group aria-label="روزهای اجرا" disabled={!editing} options={weekdays.map((label, value) => ({ label, value }))} value={schedule.weekdays} onChange={days => patchSchedule({ weekdays: days })} /> : null}
      <label className="flex flex-wrap items-center gap-2"><span>منطقهٔ زمانی</span><Input aria-label="منطقهٔ زمانی" dir="ltr" style={{ width: 180 }} disabled={!editing} value={schedule.timeZone} onChange={event => patchSchedule({ timeZone: event.target.value })} /></label>
      <div className="ai-approval-description">{formatAgentTaskScheduleFa(schedule)}</div>
    </div> : null}
    <div className="space-y-2"><div className="font-semibold">دریافت نتیجه</div>
      {config.deliveries.map((delivery: any, index: number) => {
        const patch = (value: any) => patchConfig({ deliveries: config.deliveries.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, ...value } : item) });
        return <div key={delivery.channel} className="space-y-1">
          <span>{delivery.channel === 'chat' ? 'همین گفتگوی خصوصی' : delivery.channel === 'sms' ? 'پیامک به' : 'ایمیل به'}</span>
          {delivery.channel !== 'chat' ? <Input aria-label={delivery.channel === 'sms' ? 'گیرندگان پیامک' : 'گیرندگان ایمیل'} dir="ltr" disabled={!editing} value={(delivery.numbers || delivery.addresses || []).join(', ')} onChange={event => patch({ [delivery.channel === 'sms' ? 'numbers' : 'addresses']: event.target.value.split(/[,،\n]/).map(value => value.trim()).filter(Boolean) })} /> : null}
          {delivery.channel === 'email' ? <Input aria-label="عنوان ایمیل" disabled={!editing} value={delivery.subject} onChange={event => patch({ subject: event.target.value })} /> : null}
        </div>;
      })}
      <Select aria-label="شرط ارسال نتیجه" value={config.notifyWhen} disabled={!editing} style={{ width: '100%' }} options={[{ value: 'always', label: 'پس از هر بررسی نتیجه ارسال شود' }, { value: 'findings', label: 'فقط اگر موردی مطابق درخواست پیدا شد' }]} onChange={notifyWhen => patchConfig({ notifyWhen })} />
    </div>
    <p className="ai-approval-description">{change.operation === 'pause' ? 'تأیید شما اجراهای بعدی این کار را متوقف می‌کند.' : 'با همین یک تأیید، بررسی و ارسال نتیجه در موعدهای بالا مجاز می‌شود. می‌توانید کار را از گفتگو ویرایش یا متوقف کنید.'}</p>
  </div>;
};
export default AiAgentTaskApprovalCard;
