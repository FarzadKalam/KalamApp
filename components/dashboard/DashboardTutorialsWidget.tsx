import { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Spin } from 'antd';
import { BookOutlined, LeftOutlined } from '@ant-design/icons';
import { supabasePublic } from '../../supabaseClient';
import { getSiteUrl } from '../../utils/seoHelpers';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type DashboardTutorial = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
};

export default function DashboardTutorialsWidget() {
  const [items, setItems] = useState<DashboardTutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const { data, error: queryError } = await supabasePublic.rpc('get_cms_contextual_tutorial_posts', {
          p_contexts: ['page:dashboard'],
          p_limit: 6,
        });
        if (queryError) throw queryError;
        if (!cancelled) setItems((data || []) as DashboardTutorial[]);
      } catch (reason) {
        if (!cancelled) setError(toFaErrorMessage(reason as any, 'دریافت آموزش‌های داشبورد ناموفق بود.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <Card className="shadow-sm" styles={{ body: { padding: 20 } }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold">
            <BookOutlined className="text-leather-500" />
            <span>آموزش‌های پیشنهادی</span>
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">راهنماهای عمومی برای شروع سریع‌تر کار با تازه سیستم</div>
        </div>
        <Button type="link" href={`${getSiteUrl()}/learn`} target="_blank" rel="noopener noreferrer" icon={<LeftOutlined />} iconPosition="end">
          همه آموزش‌ها
        </Button>
      </div>

      {error ? (
        <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => setAttempt(value => value + 1)}>تلاش دوباره</Button>} />
      ) : loading ? (
        <div className="py-10 text-center"><Spin /></div>
      ) : items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="آموزش عمومی منتشر نشده است." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(item => (
            <a
              key={item.id}
              href={`${getSiteUrl()}/learn/${encodeURIComponent(item.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-xl border border-gray-200 bg-white text-inherit transition hover:-translate-y-0.5 hover:border-leather-300 hover:shadow-md dark:border-dark-border dark:bg-dark-surface"
            >
              {item.cover_image_url ? (
                <img src={item.cover_image_url} alt={item.title} className="aspect-[16/9] w-full bg-gray-100 object-cover object-top" loading="lazy" decoding="async" />
              ) : null}
              <div className="p-4">
                <div className="font-bold text-gray-900 transition group-hover:text-leather-600 dark:text-gray-100">{item.title}</div>
                {item.excerpt ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{item.excerpt}</p> : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
