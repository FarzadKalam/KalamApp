import type { AgentTaskSchedule } from '../supabase/functions/_shared/ai-agent-task-contract';
const dayNames = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
export const formatAgentTaskScheduleFa = (schedule: AgentTaskSchedule | null): string => {
  if (!schedule) return 'هنگام رویداد رکورد';
  const at = schedule.kind === 'interval' ? '' : schedule.kind === 'once' ? '' : schedule.at;
  const zone = schedule.timeZone === 'Asia/Tehran' ? 'به وقت تهران' : `منطقهٔ زمانی ${schedule.timeZone}`;
  if (schedule.kind === 'interval') return `هر ${schedule.minutes.toLocaleString('fa-IR')} دقیقه · ${zone}`;
  if (schedule.kind === 'daily') return `هر روز ساعت ${at} · ${zone}`;
  if (schedule.kind === 'weekly') return `${schedule.weekdays.map(day => dayNames[day]).join('، ')} ساعت ${at} · ${zone}`;
  if (schedule.kind === 'monthly') return `روز ${schedule.day.toLocaleString('fa-IR')} هر ماه ${schedule.calendar === 'persian' ? 'شمسی' : 'میلادی'}، ساعت ${at} · ${zone}`;
  try { return `یک‌بار ${new Date(schedule.at).toLocaleString('fa-IR', { timeZone: schedule.timeZone })} · ${zone}`; }
  catch { return 'زمان اجرا نیازمند بررسی است'; }
};
