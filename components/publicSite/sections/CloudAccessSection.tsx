import React from 'react';
import { CheckCircleOutlined, DesktopOutlined, MobileOutlined } from '@ant-design/icons';
import { Reveal, SectionHeading, SectionShell } from '../primitives';

export const CloudAccessSection: React.FC<{ props: any }> = ({ props }) => (
  <SectionShell tone="soft">
    <div className="grid items-center gap-10 lg:grid-cols-[.85fr_1.15fr] lg:gap-16">
      <div>
        <SectionHeading align="start" eyebrow={props.eyebrow || 'همیشه در دسترس'} title={props.title || 'کار شما در هر دستگاهی همراهتان است'} text={props.text} />
        <ul className="grid gap-4">
          {(props.highlights || ['داده‌های همگام در همه دستگاه‌ها', 'رابط لمسی و موبایل‌محور', 'دسترسی امن از هرجا']).map((text: string) => <li key={text} className="flex items-center gap-3 text-sm leading-7 text-zinc-700"><CheckCircleOutlined style={{ color: 'rgb(var(--brand-700-rgb))' }} aria-hidden="true" />{text}</li>)}
        </ul>
      </div>
      <Reveal className="relative min-w-0 pb-8 pl-8" delay={.08}>
        <div className="site-card overflow-hidden p-3">
          <div className="mb-3 flex items-center gap-2 px-2 py-2 text-xs font-bold text-zinc-600"><DesktopOutlined aria-hidden="true" />فضای کار روی رایانه</div>
          <img src="/assets/tutorials/projects-list.png" width="1536" height="1024" loading="lazy" alt="نمای نمونهٔ پروژه‌ها در نسخهٔ رایانهٔ تازه سیستم" className="aspect-[1.6] w-full rounded-xl object-cover object-top" />
        </div>
        <div className="site-card absolute bottom-0 left-0 w-[30%] min-w-[100px] max-w-[150px] overflow-hidden border-[5px] border-zinc-800 p-1.5">
          <div className="flex items-center gap-1 py-2 text-[10px] font-bold text-zinc-700"><MobileOutlined aria-hidden="true" />همراه تیم شما</div>
          <div className="space-y-2 rounded-lg bg-zinc-50 p-3">
            <p className="text-xs font-bold" style={{ color: 'rgb(var(--brand-700-rgb))' }}>کارهای امروز</p>
            {['پیگیری مشتری', 'جلسهٔ پروژه', 'تحویل گزارش'].map(text => <p key={text} className="border-t border-zinc-200 pt-2 text-[10px] leading-5 text-zinc-600">{text}</p>)}
          </div>
        </div>
      </Reveal>
    </div>
  </SectionShell>
);

export default CloudAccessSection;
