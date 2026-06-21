import React, { FormEvent, useState } from 'react';
import { App } from 'antd';
import { supabase } from '../../../supabaseClient';

const DemoForm: React.FC<{ dark?: boolean }> = ({ dark = false }) => {
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', company: '', users: '', need: '' });
  const inputClass = 'rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-950';
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.fullName.trim() || !form.phone.trim()) {
      message.warning('نام و موبایل را وارد کنید.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('marketing_leads').insert({
        name: `درخواست دمو تازه سیستم - ${form.company || form.fullName}`,
        business_name: form.company || null,
        first_name: form.fullName,
        mobile: form.phone,
        status: 'new',
        lead_type: 'new_lead',
        source: 'website',
        description: [form.need, form.users ? `تعداد کاربر: ${form.users}` : ''].filter(Boolean).join('\n'),
      });
      if (error) throw error;
      message.success('درخواست شما ثبت شد. برای هماهنگی دمو با شما تماس می‌گیریم.');
      setForm({ fullName: '', phone: '', company: '', users: '', need: '' });
    } catch {
      message.info('درخواست آماده شد. اگر ثبت مستقیم فعال نبود، از تماس یا ایمیل سایت استفاده کنید.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <form onSubmit={submit} className={`rounded-2xl border p-5 shadow-sm md:p-7 ${dark ? 'border-white/10 bg-white text-zinc-950' : 'border-zinc-200 bg-white'}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold text-zinc-700">نام و نام خانوادگی<input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={inputClass} placeholder="مثلاً علی رضایی" /></label>
        <label className="grid gap-2 text-sm font-bold text-zinc-700">موبایل<input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} placeholder="۰۹۱۲..." /></label>
        <label className="grid gap-2 text-sm font-bold text-zinc-700">نام شرکت<input value={form.company} onChange={(e) => set('company', e.target.value)} className={inputClass} placeholder="نام سازمان" /></label>
        <label className="grid gap-2 text-sm font-bold text-zinc-700">تعداد کاربران<input value={form.users} onChange={(e) => set('users', e.target.value)} className={inputClass} placeholder="مثلاً ۱۰ نفر" /></label>
      </div>
      <label className="mt-4 grid gap-2 text-sm font-bold text-zinc-700">نیاز اصلی شما<textarea value={form.need} onChange={(e) => set('need', e.target.value)} className={`${inputClass} min-h-28`} placeholder="CRM، پروژه، فرآیند، حسابداری، نسخه لوکال..." /></label>
      <button disabled={submitting} className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-zinc-950 px-5 py-3 text-sm font-black text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'در حال ثبت...' : 'ثبت درخواست دمو'}</button>
    </form>
  );
};

export default DemoForm;
