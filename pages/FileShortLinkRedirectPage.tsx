import React, { useEffect, useState } from 'react';
import { App, Result, Spin } from 'antd';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const FileShortLinkRedirectPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const code = String(params.code || '').trim();
  const isRecordLink = location.pathname.startsWith('/r/');
  const [state, setState] = useState<'loading' | 'not_found' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    const resolveRedirect = async () => {
      if (!code) {
        setState('not_found');
        return;
      }

      try {
        const { data, error } = await supabase.rpc('resolve_shared_short_link', { p_code: code });

        if (error) throw error;

        const targetUrl = String(data?.target_url || '').trim();
        const linkTypeMatches = isRecordLink
          ? data?.link_type === 'generic' && ['record', 'online_catalog', 'scheduled_report', 'scheduled_work_schedule'].includes(String((data as any)?.metadata?.kind || ''))
          : data?.link_type === 'file';
        if (!targetUrl || !linkTypeMatches) {
          if (!cancelled) setState('not_found');
          return;
        }

        window.location.replace(targetUrl);
      } catch (error) {
        console.warn('Could not resolve short file link', error);
        if (!cancelled) {
          message.error('بازیابی لینک فایل ناموفق بود.');
          setState('error');
        }
      }
    };

    void resolveRedirect();
    return () => {
      cancelled = true;
    };
  }, [code, isRecordLink, message]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <Spin size="small" />
          <span>{isRecordLink ? 'در حال انتقال به رکورد...' : 'در حال انتقال به فایل...'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Result
        status={state === 'error' ? 'error' : '404'}
        title={isRecordLink ? 'لینک رکورد پیدا نشد' : 'لینک فایل پیدا نشد'}
        subTitle="ممکن است لینک حذف شده، منقضی شده یا کد آن اشتباه باشد."
        extra={[
          <a
            key="home"
            className="inline-flex items-center justify-center rounded-lg bg-zinc-950 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800"
            onClick={(event) => {
              event.preventDefault();
              navigate('/', { replace: true });
            }}
            href="/"
          >
            بازگشت
          </a>,
        ]}
      />
    </div>
  );
};

export default FileShortLinkRedirectPage;
