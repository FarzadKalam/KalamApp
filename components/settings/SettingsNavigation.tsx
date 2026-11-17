import React, { useEffect, useState } from 'react';
import { Empty, Input, Select } from 'antd';
import { normalizePermissionSearch } from '../../utils/fieldAccess';

const SECTIONS: Record<string, { title: string; group: string }> = {
  account: { title: 'حساب و اشتراک', group: 'سازمان' }, company: { title: 'مشخصات شرکت', group: 'سازمان' },
  users: { title: 'مدیریت کاربران', group: 'کاربران و دسترسی‌ها' }, roles: { title: 'چارت سازمانی و دسترسی‌ها', group: 'کاربران و دسترسی‌ها' },
  module_settings: { title: 'تنظیمات ماژول‌ها', group: 'ابزارها و عملیات' }, reservation_settings: { title: 'رزرواسیون', group: 'ابزارها و عملیات' },
  print_templates: { title: 'قالب‌های چاپ', group: 'ابزارها و عملیات' }, workflows: { title: 'گردش‌کارها', group: 'ابزارها و عملیات' },
  connections: { title: 'اتصالات', group: 'اتصالات و هوش مصنوعی' }, ai: { title: 'هوش مصنوعی', group: 'اتصالات و هوش مصنوعی' },
};
type Item = { key: string; label: React.ReactNode; children: React.ReactNode };
const SettingsNavigation: React.FC<{ items: Item[]; activeKey?: string; onChange: (key: string) => void }> = ({ items, activeKey, onChange }) => {
  const [search, setSearch] = useState('');
  const [visited, setVisited] = useState<string[]>(activeKey ? [activeKey] : []);
  useEffect(() => { if (activeKey) setVisited((previous) => previous.includes(activeKey) ? previous : [...previous, activeKey]); }, [activeKey]);
  const visible = items.filter((item) => normalizePermissionSearch(SECTIONS[item.key]?.title || '').includes(normalizePermissionSearch(search)));
  const groups = [...new Set(visible.map((item) => SECTIONS[item.key]?.group || 'سایر'))];
  return <div className="grid min-w-0 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]" dir="rtl">
    <nav aria-label="بخش‌های تنظیمات" className="min-w-0">
      <h1 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">تنظیمات</h1>
      <Select className="w-full lg:hidden" aria-label="انتخاب بخش تنظیمات" value={activeKey} showSearch
        optionFilterProp="label" onChange={onChange}
        options={items.map((item) => ({ value: item.key, label: SECTIONS[item.key]?.title || item.key }))} />
      <div className="hidden space-y-5 lg:block">
        <Input.Search allowClear value={search} onChange={(event) => setSearch(event.target.value)} aria-label="جستجوی تنظیمات" placeholder="جستجوی تنظیمات..." />
        {groups.map((group) => <div key={group}>
          <div className="mb-2 px-3 text-xs font-bold text-gray-500 dark:text-gray-400">{group}</div>
          {visible.filter((item) => (SECTIONS[item.key]?.group || 'سایر') === group).map((item) => <button key={item.key} type="button"
            aria-current={activeKey === item.key ? 'page' : undefined} onClick={() => onChange(item.key)}
            className={`mb-1 min-h-11 w-full rounded-xl px-3 py-3 text-right transition focus-visible:outline focus-visible:outline-2 ${activeKey === item.key ? 'bg-[rgb(var(--brand-50-rgb))] text-[rgb(var(--brand-700-rgb))] dark:bg-white/10 dark:text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5'}`}>
            {item.label}
          </button>)}
        </div>)}
        {!visible.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="بخشی پیدا نشد." />}
      </div>
    </nav>
    <div className="min-w-0 lg:border-r lg:border-gray-200 lg:pr-6 dark:lg:border-gray-800">
      <h2 className="mb-5 text-lg font-bold text-gray-900 dark:text-gray-100">{activeKey && SECTIONS[activeKey]?.title}</h2>
      {items.filter((item) => item.key === activeKey || visited.includes(item.key)).map((item) =>
        <section key={item.key} hidden={item.key !== activeKey} aria-label={SECTIONS[item.key]?.title}>{item.children}</section>)}
    </div>
  </div>;
};
export default SettingsNavigation;
