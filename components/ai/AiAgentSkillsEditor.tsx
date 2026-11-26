import { useState } from 'react';
import { Button, Input, Select, Switch } from 'antd';
import { listAgentSkills, type AiSkill } from '../../supabase/functions/_shared/ai-skill-catalog';
import type { AgentKey } from '../../utils/aiAgentCatalog';

export default function AiAgentSkillsEditor({ agentKey, settings, onChange, editable }: {
  agentKey: AgentKey;
  settings: AiSkill[];
  onChange: (settings: AiSkill[]) => void;
  editable: boolean;
}) {
  const [selected, setSelected] = useState<string>();
  const skills = listAgentSkills(agentKey, settings);
  const current = settings.find(item => item.id === selected) || skills.find(item => item.id === selected);
  const update = (entry: AiSkill) => onChange([...settings.filter(item => item.id !== entry.id), entry]);
  const add = () => {
    const id = `custom_${crypto.randomUUID().replaceAll('-', '')}`;
    update({ id, title: '', instructions: '', triggers: [], enabled: true });
    setSelected(id);
  };
  const visibleSkills = [...skills, ...settings.filter(item => !skills.some(entry => entry.id === item.id))];
  return <section className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-white/10" aria-label="خرده‌مهارت‌های ایجنت">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="m-0 text-sm font-semibold">خرده‌مهارت‌های ایجنت</h3>
      {editable && <Button size="small" onClick={add} disabled={settings.length >= 40}>افزودن مهارت</Button>}
    </div>
    <Select<string> aria-label="انتخاب مهارت برای تنظیم" className="w-full" value={selected} placeholder="مهارت را انتخاب کنید"
      onChange={setSelected} options={visibleSkills.map(item => ({ value: item.id, label: item.title || 'مهارت جدید' }))} />
    {current && <div className="space-y-2">
      <label className="block">نام مهارت<Input className="mt-1" disabled={!editable} maxLength={80} value={current.title}
        onChange={event => update({ ...current, title: event.target.value })} /></label>
      <label className="block">نمونه‌های کاربرد، جداشده با ویرگول<Select<string[]> aria-label="نمونه‌های کاربرد" className="mt-1 w-full"
        mode="tags" tokenSeparators={[',', '،']} disabled={!editable} value={current.triggers} maxCount={12}
        onChange={triggers => update({ ...current, triggers: triggers.map(term => term.slice(0, 55)) })} /></label>
      <label className="block">دستورالعمل انجام کار<Input.TextArea className="mt-1" rows={3} maxLength={1400} disabled={!editable}
        value={current.instructions} onChange={event => update({ ...current, instructions: event.target.value })} /></label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2">
          <Switch aria-label="فعال‌بودن مهارت" disabled={!editable} checked={current.enabled}
            onChange={enabled => update({ ...current, enabled })} />فعال باشد
        </label>
        {editable && settings.some(item => item.id === current.id) && <Button size="small" onClick={() => {
          onChange(settings.filter(item => item.id !== current.id));
          if (current.id.startsWith('custom_')) setSelected(undefined);
        }}>{current.id.startsWith('custom_') ? 'حذف مهارت سفارشی' : 'بازگشت به تنظیم پیش‌فرض'}</Button>}
      </div>
    </div>}
  </section>;
}
