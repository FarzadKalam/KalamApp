import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import { TeamOutlined, BankOutlined, DashboardOutlined } from '@ant-design/icons';
import MainSidebar from '../../components/layout/MainSidebar';
import { resolveSidebarLayout } from '../../utils/sidebarLayout';
import '../../components/layout/WorkspaceChrome.css';
import '../../components/dashboard/Dashboard.css';

const items = [
  { key: '/', label: 'داشبورد', icon: <DashboardOutlined /> },
  { key: 'finance', label: 'امور مالی', icon: <BankOutlined />, children: [
    { key: '/invoices', label: 'فاکتورها' },
    { key: 'reports', label: 'گزارش‌های مالی', children: [{ key: '/reports/sales', label: 'گزارش فروش' }] },
  ] },
  { key: 'people', label: 'مخاطبان', icon: <TeamOutlined />, children: [{ key: '/customers', label: 'مشتریان' }, { key: '/suppliers', label: 'تأمین‌کنندگان' }] },
];
const Preview = () => {
  const [pathname, setPathname] = useState('/');
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  const [clicks, setClicks] = useState(0);
  useEffect(() => { const resize = () => { const nextMobile = window.innerWidth < 768; setMobile(nextMobile); if (nextMobile) setCollapsed(true); }; window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  const layout = resolveSidebarLayout(pathname, mobile, collapsed);
  const navigate = (href: string) => { setPathname(href); setCollapsed(href !== '/'); };
  return <ConfigProvider direction="rtl" theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm, token: { fontFamily: 'Peyda, Tahoma, sans-serif' } }}>
    <div className="workspace-chrome" data-sidebar-mode={layout.mode} style={{ minHeight: '100vh' }}>
      <MainSidebar items={items} railItems={items} selectedKey={pathname} ancestorKeys={[]} collapsed={collapsed} onCollapsedChange={setCollapsed} isMobile={mobile} isDarkMode={dark} onNavigate={navigate} brandShortName="تازه سیستم" contexts={[]} orgId="preview-org" userId="preview-user" presentation={layout.mode} />
      <main className="app-workspace-content" style={{ paddingRight: layout.reservedWidth, minHeight: '100vh', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>
        <header className="app-main-header" style={{ padding: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/')}>صفحه داشبورد</button><button onClick={() => navigate('/customers')}>صفحه مشتریان</button>
          <button onClick={() => setDark(value => !value)}>تغییر روز و شب</button>
          {mobile && <button onClick={() => setCollapsed(false)}>باز کردن منوی گوشی</button>}
        </header>
        <section className="sidebar-preview-body dashboard-shell">
          <h1 style={{ fontSize: 24, marginBottom: 24 }}>{pathname === '/' ? 'داشبورد سازمان' : 'فهرست مشتریان'}</h1>
          <button onClick={() => setClicks(value => value + 1)}>عملیات صفحه</button><output aria-label="تعداد عملیات">{clicks}</output>
          <div className="dashboard-widget-grid" style={{ marginTop: 24 }}>{['گزارش فروش', 'فعالیت‌های امروز', 'وضعیت مشتریان', 'پیگیری سفارش‌ها'].map(title => <article key={title} className="dashboard-widget-frame" style={{ minHeight: 180, background: 'var(--workspace-surface)', border: '1px solid var(--workspace-line)', borderRadius: 18, padding: 20 }}><h2>{title}</h2><p style={{ marginTop: 24 }}>اطلاعات و نوشته‌های این بخش باید به‌طور کامل دیده شوند.</p></article>)}</div>
        </section>
      </main>
    </div>
  </ConfigProvider>;
};
createRoot(document.getElementById('root')!).render(<Preview />);
