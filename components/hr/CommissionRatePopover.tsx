import { useState } from 'react';
import { Alert, Button, Form, InputNumber, Popover, Switch, Tag } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { CommissionDraftLine } from '../../utils/commissionRuntime';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

export default function CommissionRatePopover({ line, onSave }: {
  line: CommissionDraftLine;
  onSave: (percent: number, saveDefault: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState<number | null>(line.commission_percent);
  const [saveDefault, setSaveDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const valid = percent !== null && Number.isFinite(percent) && percent >= 0 && percent <= 100;
  return <Popover trigger="click" open={open} onOpenChange={value => {
    if (saving) return;
    setOpen(value); setError(''); setPercent(line.commission_percent); setSaveDefault(false);
  }} title="مشاهده و تعیین پورسانت این قلم" content={<div dir="rtl" style={{ width: 'min(300px, calc(100vw - 64px))' }}>
    <p>{line.product_label}</p>
    {error && <Alert type="error" showIcon message={error} className="mb-3" />}
    <Form layout="vertical" onFinish={async () => {
      if (!valid || saving) return;
      setSaving(true); setError('');
      try { await onSave(percent!, saveDefault); setOpen(false); }
      catch (err) { setError(toFaErrorMessage(err, 'ثبت درصد انجام نشد')); }
      finally { setSaving(false); }
    }}>
      <Form.Item label="درصد پورسانت" validateStatus={!valid ? 'error' : undefined} help={!valid ? 'درصدی بین صفر و صد وارد کنید.' : undefined}>
        <InputNumber aria-label="درصد پورسانت" min={0} max={100} value={percent} onChange={value => setPercent(value)} disabled={saving} />
      </Form.Item>
      <Form.Item label="ثبت به‌عنوان پورسانت پیش‌فرض این کالا">
        <Switch aria-label="ثبت به‌عنوان پورسانت پیش‌فرض این کالا" checked={saveDefault} onChange={setSaveDefault}
          disabled={saving || !line.product_id || !line.product_module} />
      </Form.Item>
      <p className="text-xs text-gray-500 mb-3">با کلید خاموش، درصد فقط برای این ردیف محاسبه ذخیره می‌شود. تغییر پیش‌فرض به مجوز ویرایش قلم نیاز دارد و سوابق قبلی را تغییر نمی‌دهد.</p>
      <Button type="primary" htmlType="submit" loading={saving} disabled={!valid}>اعمال درصد</Button>
    </Form>
  </div>}>
    <Button type="text" className="!h-auto !whitespace-normal !text-start" aria-label={`مشاهده پورسانت ${line.product_label}`}>
      {line.product_label}
      {line.commission_rate_missing
        ? <Tag color="warning" icon={<WarningOutlined />}>پورسانت تعریف نشده</Tag>
        : <Tag>{toPersianNumber(line.commission_percent)}٪</Tag>}
    </Button>
  </Popover>;
}
