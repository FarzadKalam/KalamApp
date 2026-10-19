import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Spin, Tabs, Tooltip } from 'antd';
import { ReadOutlined } from '@ant-design/icons';
import { supabasePublic } from '../../supabaseClient';
import BlockRenderer from './BlockRenderer';
import type { Block } from './BlockEditor';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { getSiteUrl } from '../../utils/seoHelpers';

type TutorialSummary = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  help_group: string;
  content_blocks: Block[];
};

export default function ContextualTutorialButton({ contexts, zIndex = 1600 }: { contexts: string[]; zIndex?: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TutorialSummary[]>([]);
  const [selected, setSelected] = useState<string>();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const contextKey = contexts.join('|');

  useEffect(() => { setOpen(false); setSelected(undefined); setItems([]); }, [contextKey]);
  useEffect(() => {
    if (!open || !contextKey) return;
    let cancelled = false;
    setLoading(true); setError(''); setBlocks([]);
    void (async () => {
      try {
        const { data, error: queryError } = await supabasePublic.rpc('get_cms_contextual_tutorial_posts', {
          p_contexts: contextKey.split('|'),
          p_limit: 100,
        });
        if (queryError) throw queryError;
        if (!cancelled) { setItems(data || []); setSelected(data?.[0]?.id); }
      } catch (err) {
        if (!cancelled) setError(toFaErrorMessage(err as any, 'دریافت آموزش‌ها ناموفق بود.'));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, contextKey, attempt]);

  useEffect(() => {
    setBlocks(Array.isArray(items.find(item => item.id === selected)?.content_blocks)
      ? items.find(item => item.id === selected)?.content_blocks || []
      : []);
  }, [items, selected]);

  if (!contexts.length) return null;
  const current = items.find(item => item.id === selected);
  const groups = [...new Set(items.map(item => item.help_group || 'راهنما'))];
  return <>
    <Tooltip title="آموزش این بخش"><Button type="text" aria-label="آموزش این بخش" icon={<ReadOutlined />} onClick={() => setOpen(true)} /></Tooltip>
    <Drawer title="آموزش این بخش" open={open} onClose={() => setOpen(false)} width="min(860px, 100vw)" zIndex={zIndex} destroyOnClose>
      <div dir="rtl">
        {error && <Alert type="error" showIcon message={error} action={<Button onClick={() => setAttempt(value => value + 1)}>تلاش دوباره</Button>} />}
        {groups.length > 1 && <Tabs activeKey={current?.help_group || 'راهنما'} onChange={group => setSelected(items.find(item => (item.help_group || 'راهنما') === group)?.id)} items={groups.map(group => ({ key: group, label: group }))} />}
        {items.length > 0 && <Tabs activeKey={selected} onChange={setSelected} items={items.filter(item => groups.length === 1 || (item.help_group || 'راهنما') === (current?.help_group || 'راهنما')).map(item => ({ key: item.id, label: item.title }))} />}
        {loading ? <div className="py-12 text-center"><Spin /></div> : !error && current ? <article className="text-gray-800 dark:text-gray-100">
          <h2 className="text-xl font-bold text-gray-950 dark:text-gray-100 mb-3">{current.title}</h2>
          <p className="leading-8 text-gray-600 dark:text-gray-300">{current.excerpt}</p>
          <BlockRenderer blocks={blocks} />
          <Button className="mt-5" href={`${getSiteUrl()}/learn/${encodeURIComponent(current.slug)}`} target="_blank" rel="noopener noreferrer">مشاهده در مرکز آموزش</Button>
        </article> : !error && <Empty description="آموزش این بخش هنوز منتشر نشده است." />}
      </div>
    </Drawer>
  </>;
}
