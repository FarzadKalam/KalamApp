import { useState } from 'react';
import { App, Button, Input, Modal, Radio, Select } from 'antd';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { normalizeOtpToken } from '../../utils/otpAuth';
import OtpCodeInput from '../common/OtpCodeInput';

export type OrganizationPasswordChoice = {
  org_id: string;
  org_name: string;
  resolved_host?: string | null;
  role_name?: string | null;
  is_owner: boolean;
  recovery_channels?: Array<'sms' | 'email'>;
};

async function callOrganizationAuth(action: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('user-admin', { body: { action, ...body } });
  if (error) {
    const explanation = error.context instanceof Response ? await error.context.clone().json().catch(() => null) : null;
    throw new Error(explanation?.message || 'درخواست ورود انجام نشد. دوباره تلاش کنید.');
  }
  if (!data?.success) throw new Error(data?.message || 'درخواست ورود انجام نشد.');
  return data;
}

export function OrganizationPasswordRecovery({ open, onClose, contact, discoveryId, organization }: {
  open: boolean; onClose: () => void; contact: string; discoveryId?: string; organization?: OrganizationPasswordChoice;
}) {
  const { message } = App.useApp();
  const channels: Array<'sms' | 'email'> = organization?.recovery_channels ?? ['sms', 'email'];
  const [channel, setChannel] = useState<'sms' | 'email'>(contact.includes('@') && channels.includes('email') ? 'email' : channels[0] || 'sms');
  const [identity, setIdentity] = useState(contact);
  const [challenge, setChallenge] = useState('');
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (!identity.trim()) { message.error('شماره موبایل یا ایمیل را وارد کنید.'); return; }
    if (challenge && !verified && normalizeOtpToken(code).length !== 6) {
      message.error('کد شش‌رقمی را وارد کنید.');
      return;
    }
    if (verified && (password.length < 6 || password !== confirmation)) {
      message.error('رمز جدید و تکرار یکسان آن را وارد کنید.');
      return;
    }
    setBusy(true);
    try {
      if (verified) {
        await callOrganizationAuth('finish_organization_password_recovery', {
          challengeId: challenge, password,
        });
        message.success('رمز عبور حساب تغییر کرد.');
        onClose();
      } else if (challenge) {
        await callOrganizationAuth('verify_organization_password_recovery', { challengeId: challenge, code: normalizeOtpToken(code) });
        setVerified(true);
      } else {
        const result = await callOrganizationAuth('start_organization_password_recovery', {
          contact: identity, channel, discoveryId, orgId: organization?.org_id,
        });
        setChallenge(result.challengeId);
        message.info('اگر این روش برای حساب فعال باشد، کد تأیید را دریافت می‌کنید.');
      }
    } catch (error) {
      message.error(toFaErrorMessage(error, 'بازیابی رمز انجام نشد.'));
    } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={organization ? `بازیابی رمز ${organization.org_name}` : 'فراموشی رمز عبور'}
      onCancel={onClose} onOk={() => void submit()} confirmLoading={busy} okButtonProps={{ disabled: !channels.length }}
      okText={verified ? 'تعیین رمز جدید' : challenge ? 'تأیید کد' : 'دریافت کد تأیید'} cancelText="انصراف">
      {!channels.length ? <p>راه بازیابی برای این حساب ثبت نشده است. با مدیر سازمان تماس بگیرید.</p>
        : challenge ? (
          <div className="flex flex-col gap-3">
            {verified ? <>
              <Input.Password aria-label="رمز جدید" placeholder="رمز جدید" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} />
              <Input.Password aria-label="تکرار رمز جدید" placeholder="تکرار رمز جدید" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
            </> : <>
              <label>کد تأیید</label>
              <OtpCodeInput value={code} onChange={setCode} autoFocus />
              <Button type="link" onClick={() => { setChallenge(''); setCode(''); }}>تغییر روش یا درخواست کد تازه</Button>
            </>}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input aria-label="شماره موبایل یا ایمیل" placeholder="شماره موبایل یا ایمیل" disabled={!!discoveryId} value={identity} onChange={event => setIdentity(event.target.value)} />
            <Radio.Group aria-label="روش دریافت کد" value={channel} onChange={event => setChannel(event.target.value)}
              options={channels.map(mode => ({ value: mode, label: mode === 'sms' ? 'پیامک' : 'ایمیل' }))} />
          </div>
        )}
    </Modal>
  );
}

export default function OrganizationPasswordForm({ shared, onLogin }: {
  shared: boolean;
  onLogin: (session: { access_token: string; refresh_token: string }, org: OrganizationPasswordChoice) => Promise<void>;
}) {
  const { message } = App.useApp();
  const [contact, setContact] = useState('');
  const [discovery, setDiscovery] = useState('');
  const [code, setCode] = useState('');
  const [choices, setChoices] = useState<OrganizationPasswordChoice[] | null>(null);
  const [orgId, setOrgId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [recover, setRecover] = useState(false);
  const organization = choices?.find(choice => choice.org_id === orgId);
  const reset = () => { setDiscovery(''); setCode(''); setChoices(null); setOrgId(''); setPassword(''); };
  const submit = async () => {
    if (busy) return;
    if (!contact.trim()) { message.error('شماره موبایل یا ایمیل را وارد کنید.'); return; }
    setBusy(true);
    try {
      if (shared && !choices) {
        if (!discovery) {
          const result = await callOrganizationAuth('start_organization_discovery', { contact });
          setDiscovery(result.challengeId);
          message.info('اگر حسابی با این شماره یا ایمیل دارید، کد تأیید را دریافت می‌کنید.');
        } else {
          const result = await callOrganizationAuth('verify_organization_discovery', { challengeId: discovery, code: normalizeOtpToken(code) });
          const rows: OrganizationPasswordChoice[] = result.organizations || [];
          setChoices(rows);
          if (rows.length === 1) setOrgId(rows[0].org_id);
        }
      } else {
        const result = await callOrganizationAuth('login_organization_password', { contact, password, discoveryId: discovery, orgId });
        await onLogin({ access_token: result.access_token, refresh_token: result.refresh_token }, result.organization);
      }
    } catch (error) {
      message.error(toFaErrorMessage(error, 'ورود انجام نشد.'));
    } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="org-account-contact">شماره موبایل یا ایمیل</label>
      <Input id="org-account-contact" autoComplete="username" value={contact} disabled={busy}
        onChange={event => { setContact(event.target.value); reset(); }} onPressEnter={() => void submit()} />
      {shared && discovery && !choices ? (
        <>
          <label>کد تأیید شماره یا ایمیل</label>
          <OtpCodeInput value={code} onChange={setCode} autoFocus />
          <Button type="link" disabled={busy} onClick={() => { setDiscovery(''); setCode(''); }}>درخواست کد تازه</Button>
        </>
      ) : null}
      {shared && choices ? (
        choices.length ? <Select aria-label="انتخاب سازمان" placeholder="سازمان را انتخاب کنید" value={orgId || undefined}
          options={choices.map(choice => ({ value: choice.org_id, label: choice.org_name }))}
          onChange={id => { setOrgId(id); setPassword(''); }} />
          : <p>حساب فعالی با این شماره یا ایمیل پیدا نشد.</p>
      ) : null}
      {!shared || organization ? (
        <>
          <label htmlFor="org-account-password">رمز عبور سازمان</label>
          <Input.Password id="org-account-password" autoComplete="current-password" value={password}
            onChange={event => setPassword(event.target.value)} onPressEnter={() => void submit()} />
        </>
      ) : null}
      {(!choices || choices.length > 0) ? (
        <Button type="primary" loading={busy} disabled={shared && (choices ? !organization : !!discovery && normalizeOtpToken(code).length !== 6)}
          onClick={() => void submit()}>
          {shared && !choices ? discovery ? 'تأیید و نمایش سازمان‌ها' : 'دریافت کد و انتخاب سازمان' : 'ورود'}
        </Button>
      ) : null}
      {!shared || organization ? <Button type="link" onClick={() => setRecover(true)}>فراموشی رمز عبور</Button> : null}
      {recover ? <OrganizationPasswordRecovery open onClose={() => setRecover(false)} contact={contact}
        discoveryId={discovery} organization={organization} /> : null}
    </div>
  );
}
