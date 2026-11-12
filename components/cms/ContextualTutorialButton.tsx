import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Badge, Button, Drawer, Empty, Spin, Tabs, Tooltip } from 'antd';
import { ArrowRightOutlined, ReadOutlined } from '@ant-design/icons';
import BlockRenderer from './BlockRenderer';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { getSiteUrl } from '../../utils/seoHelpers';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { useContextualTutorials, type TutorialViewer } from '../../hooks/useContextualTutorials';

type Props = { contexts: string[]; zIndex?: number; buttonClassName?: string; buttonIcon?: ReactNode; viewer?: TutorialViewer };
export default function ContextualTutorialButton({ contexts, zIndex = 1600, buttonClassName, buttonIcon, viewer }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [group, setGroup] = useState('all');
  const { items, loading, error, seen, markSeen, unreadCount, retry } = useContextualTutorials(contexts, viewer);
  const contextKey = contexts.join('|');
  useEffect(() => { setOpen(false); setSelected(undefined); setGroup('all'); }, [contextKey, viewer?.orgId, viewer?.userId]);
  const current = items.find(item => item.id === selected);
  useEffect(() => { if (open && current && !seen.has(current.id)) markSeen(current.id); }, [open, current, seen, markSeen]);
  if (!contexts.length) return null;
  const groups = [...new Set(items.map(item => item.help_group || 'راهنما'))];
  const label = !loading && !error && unreadCount ? `آموزش این بخش، ${toPersianNumber(unreadCount)} آموزش دیده‌نشده` : 'آموزش این بخش';
  return <>
    <Tooltip title={label}><Badge count={error || loading || !unreadCount ? 0 : toPersianNumber(unreadCount)} showZero={false} size="small" overflowCount={99} className="contextual-tutorial-badge">
      <Button type="text" aria-label={label} className={buttonClassName} icon={buttonIcon ?? <ReadOutlined />} onClick={() => { setSelected(undefined); setOpen(true); }} />
    </Badge></Tooltip>
    <Drawer title="آموزش این بخش" open={open} onClose={() => setOpen(false)} width="min(860px, 100vw)" zIndex={zIndex} destroyOnClose>
      <div dir="rtl">
        {error ? <Alert type="error" showIcon message={toFaErrorMessage(error as any, 'دریافت آموزش‌ها ناموفق بود.')} action={<Button onClick={retry}>تلاش دوباره</Button>} /> : null}
        {loading ? <div className="py-12 text-center"><Spin /></div> : !error && current ? <article className="text-gray-800 dark:text-gray-100">
          <Button type="text" icon={<ArrowRightOutlined />} onClick={() => setSelected(undefined)}>همهٔ آموزش‌های این بخش</Button>
          <h2 className="text-xl font-bold text-gray-950 dark:text-gray-100 my-3">{current.title}</h2>
          <p className="leading-8 text-gray-600 dark:text-gray-300">{current.excerpt}</p>
          <BlockRenderer blocks={Array.isArray(current.content_blocks) ? current.content_blocks : []} />
          <Button className="mt-5" href={`${getSiteUrl()}/learn/${encodeURIComponent(current.slug)}`} target="_blank" rel="noopener noreferrer">مشاهده در مرکز آموزش</Button>
        </article> : !error && items.length ? <>
          {groups.length > 1 && <Tabs activeKey={group} onChange={setGroup} items={[{ key: 'all', label: 'همه' }, ...groups.map(name => ({ key: name, label: name }))]} />}
          <div className="space-y-2">{items.filter(item => group === 'all' || (item.help_group || 'راهنما') === group).map(item => <Button key={item.id} block className="!h-auto !min-h-14 !whitespace-normal !py-3 !text-right" onClick={() => setSelected(item.id)}>
            <span className="flex w-full items-center gap-3"><ReadOutlined /><span className="min-w-0 flex-1">{item.title}</span><span className="text-xs text-gray-500">{seen.has(item.id) ? 'دیده‌شده' : 'جدید'}</span></span>
          </Button>)}</div>
        </> : !error ? <Empty description="آموزش این بخش هنوز منتشر نشده است." /> : null}
      </div>
    </Drawer>
  </>;
}
