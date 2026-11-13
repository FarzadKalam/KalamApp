import '../../initDayjs';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ConfigProvider from 'antd/es/config-provider';
import App from 'antd/es/app';
import theme from 'antd/es/theme';
import faIR from 'antd/locale/fa_IR';
import PhoneOutlined from '@ant-design/icons/PhoneOutlined';
import MessageOutlined from '@ant-design/icons/MessageOutlined';
import AppFeedbackHost from '../../components/feedback/AppFeedbackHost';
import UploadProgressOverlay from '../../components/UploadProgressOverlay';
import { appFeedback } from '../../utils/appFeedback';
import { refineFeedbackProvider } from '../../utils/refineFeedbackProvider';
import { setUiNotificationOverlayItems, setUiNotificationOverlayViewer } from '../../utils/uiNotificationOverlayStore';

setUiNotificationOverlayViewer('isolated-preview-org', 'isolated-preview-viewer');
const initial = { id: 'preview-history', kind: 'note' as const, title: 'پیگیری سفارش مشتری', body: 'این یک اعلان نمونه برای بررسی نمایش است.', createdAt: new Date(Date.now() - 60000).toISOString(), onOpen: () => undefined };
setUiNotificationOverlayItems([initial]);
const AdvancedPreview = () => {
  const { notification } = App.useApp();
  return <button type="button" onClick={() => notification.open({ key: 'advanced-preview', message: 'اعلان پیشرفتهٔ آزمایشی', description: 'این پیام برای بررسی پاک‌سازی سازمان است.', role: 'alert', duration: 0 })}>نمایش اعلان پیشرفته</button>;
};
const Preview = () => {
  const [dark, setDark] = useState(false);
  const [route, setRoute] = useState('/marketing_leads');
  return <ConfigProvider direction="rtl" locale={faIR} theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm, token: { fontFamily: 'Peyda, Tahoma, sans-serif', colorPrimary: '#db2777' } }}>
    <MemoryRouter key={route} initialEntries={[route]}><App>
      <AppFeedbackHost /><UploadProgressOverlay />
      <main dir="rtl" style={{ minHeight: '100vh', padding: '32px', background: dark ? '#101828' : '#f8fafc', color: dark ? '#f8fafc' : '#172033', fontFamily: 'Peyda, Tahoma, sans-serif' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>پیش‌نمایش پیام‌های تازه سیستم</h1>
        <p>سرنخ‌های فروش، مشتریان و اقدام بعدی</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
          <button type="button" onClick={() => setDark(value => !value)}>تغییر روز و شب</button>
          <button type="button" onClick={() => setRoute(route === '/customers' ? '/marketing_leads' : '/customers')}>جابجایی صفحه</button>
          <AdvancedPreview />
          <button type="button" onClick={() => setUiNotificationOverlayViewer('isolated-preview-other-org', 'isolated-preview-viewer')}>تعویض سازمان آزمایشی</button>
          <button type="button" onClick={() => refineFeedbackProvider.open({ key: 'preview-undo', type: 'progress', message: 'در انتظار انجام عملیات', undoableTimeout: 5, cancelMutation: () => { appFeedback.info('عملیات لغو شد'); } })}>نمایش پیام انصراف</button>
          <button type="button" onClick={() => appFeedback.success({ title: 'سرنخ فروش ثبت شد', description: 'شرکت نمونه', durationMs: 0, actions: [
            { key: 'activity', label: 'ثبت فعالیت', onClick: () => appFeedback.info('فرم فعالیت آمادهٔ تکمیل است') },
            { key: 'call', label: 'تماس', iconOnly: true, icon: <PhoneOutlined />, onClick: () => appFeedback.info('پیش‌نمایش تماس؛ تماسی برقرار نشد') },
            { key: 'message', label: 'ارسال پیام', iconOnly: true, icon: <MessageOutlined />, onClick: () => appFeedback.info('پیش‌نمایش پیام؛ پیامی ارسال نشد') },
          ] })}>نمایش پیام سرنخ</button>
          <button type="button" onClick={() => { for (let index = 0; index < 20; index++) appFeedback.info({ title: `پیام آزمایشی ${index + 1}`, durationMs: 1500 }); }}>ارسال هم‌زمان پیام‌ها</button>
          <button type="button" onClick={() => setUiNotificationOverlayItems([initial, { ...initial, id: `fresh-${Date.now()}`, title: 'اعلان تازه', createdAt: new Date().toISOString() }])}>اعلان تازه</button>
        </div>
      </main>
    </App></MemoryRouter>
  </ConfigProvider>;
};
createRoot(document.getElementById('root')!).render(<Preview />);
