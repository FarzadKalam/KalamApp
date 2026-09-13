import React from 'react';
import { CloudOutlined, MobileOutlined, TabletOutlined, DesktopOutlined, CheckCircleFilled } from '@ant-design/icons';

const Device: React.FC<{ kind: 'phone' | 'tablet' | 'desktop'; label: string }> = ({ kind, label }) => {
  const Icon = kind === 'phone' ? MobileOutlined : kind === 'tablet' ? TabletOutlined : DesktopOutlined;
  const shell = kind === 'phone' ? 'h-52 w-28 rounded-[1.7rem]' : kind === 'tablet' ? 'h-44 w-56 rounded-2xl' : 'h-40 w-64 rounded-xl';
  return <div className={`relative border-[7px] border-slate-800 bg-slate-900 p-2 shadow-2xl ${shell}`}>
    <div className="h-full rounded-lg bg-gradient-to-bl from-sky-100 via-white to-blue-50 p-2 text-slate-700">
      <div className="flex items-center justify-between text-[8px] font-black"><span>تازه سیستم</span><Icon /></div>
      <div className="mt-3 rounded bg-blue-600 p-2 text-[8px] font-bold text-white">کارهای امروز</div>
      <div className="mt-2 space-y-1">{[1, 2, 3].map((item) => <div key={item} className="h-3 rounded bg-slate-200" />)}</div>
    </div>
    {kind === 'desktop' ? <div className="absolute -bottom-7 left-1/2 h-7 w-16 -translate-x-1/2 rounded-b bg-slate-800" /> : null}
    <span className="absolute -bottom-11 right-1/2 translate-x-1/2 whitespace-nowrap text-xs font-black text-slate-600">{label}</span>
  </div>;
};

export const CloudAccessSection: React.FC<{ props: any }> = ({ props }) => (
  <section className="overflow-hidden bg-gradient-to-bl from-sky-50 via-white to-indigo-50 px-5 py-20" dir="rtl">
    <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-sm font-black text-blue-700"><CloudOutlined />{props.eyebrow || 'همیشه در دسترس'}</div>
        <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 md:text-5xl">{props.title || 'کار شما در هر دستگاهی همراهتان است'}</h2>
        <p className="mt-5 max-w-xl text-base leading-8 text-slate-600">{props.text || 'تازه سیستم ابری، سریع و بهینه برای موبایل است؛ از فروشگاه و دفتر تا خانه، اطلاعات سازمان همیشه همگام و در دسترس می‌ماند.'}</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">{(props.highlights || ['داده‌های همگام در همه دستگاه‌ها', 'رابط لمسی و موبایل‌محور', 'دسترسی امن از هرجا']).map((item: string) => <div key={item} className="flex items-center gap-2 text-sm font-bold text-slate-700"><CheckCircleFilled className="text-blue-600" />{item}</div>)}</div>
      </div>
      <div className="flex min-h-[330px] items-center justify-center gap-5 pt-6 sm:gap-8" aria-label="نمایش تازه سیستم روی گوشی، تبلت و رایانه">
        <Device kind="phone" label="گوشی" /><Device kind="tablet" label="تبلت" /><Device kind="desktop" label="رایانه" />
      </div>
    </div>
  </section>
);

export default CloudAccessSection;
