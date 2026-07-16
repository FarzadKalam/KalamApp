import React, { useEffect, useState } from 'react';
import { App, Result, Spin } from 'antd';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const isExpired = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const time = Date.parse(raw);
  return Number.isFinite(time) && time <= Date.now();
};

const FileShortLinkRedirectPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const code = String(params.code || '').trim();
  const isRecordLink = location.pathname.startsWith('/r/');
  const [state, setState] = useState<'loading' | 'not_found' | 'expired' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    const resolveRedirect = async () => {
      if (!code) {
        setState('not_found');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('short_links')
          .select('link_type, target_url, is_active, expires_at, metadata, file_assets(target_url), file_entries(asset_id, file_assets(target_url))')
          .eq('code', code)
          .maybeSingle();

        if (error) throw error;

        const nestedAssetUrl = String((data as any)?.file_assets?.target_url || '').trim();
        const nestedEntryAssetUrl = String((data as any)?.file_entries?.file_assets?.target_url || '').trim();
        const targetUrl = String(data?.target_url || nestedAssetUrl || nestedEntryAssetUrl || '').trim();
        const linkTypeMatches = isRecordLink
          ? data?.link_type === 'generic' && (data as any)?.metadata?.kind === 'record'
          : data?.link_type === 'file';
        const isActive = data?.is_active !== false;
        if (!targetUrl || !isActive || !linkTypeMatches) {
          if (!cancelled) setState('not_found');
          return;
        }
        if (isExpired(data?.expires_at)) {
          if (!cancelled) setState('expired');
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
        title={state === 'expired' ? 'لینک منقضی شده است' : (isRecordLink ? 'لینک رکورد پیدا نشد' : 'لینک فایل پیدا نشد')}
        subTitle={state === 'expired' ? 'اعتبار این لینک کوتاه تمام شده است.' : 'ممکن است لینک حذف شده باشد یا کد آن اشتباه باشد.'}
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
