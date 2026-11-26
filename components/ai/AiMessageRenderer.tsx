import React, { useMemo } from 'react';
import { Button, Tooltip } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import XMarkdown, { type ComponentProps } from '@ant-design/x-markdown';
import AiActivityStatus from './AiActivityStatus';
import AiSourcesCard, { type AiSourceItem } from './AiSourcesCard';
import type { AiAgentActivity } from '../../supabase/functions/_shared/ai-agents';

type AiMessageRendererProps = {
  text: string;
  streaming?: boolean;
  failed?: boolean;
  stopped?: boolean;
  onCopyText?: (text: string, label?: string) => void;
  onRetry?: () => void;
  onStop?: () => void;
  agentId?: string;
  activities?: AiAgentActivity[];
  sources?: AiSourceItem[];
};

const extractNodeText = (node: React.ReactNode): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractNodeText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    const typeName = typeof node.type === 'string' ? node.type : '';
    const inner = extractNodeText(node.props?.children);
    if (typeName === 'p' || typeName === 'div' || typeName === 'li') {
      return `${inner}\n`;
    }
    return inner;
  }
  return '';
};

const CopyButton: React.FC<{
  text: string;
  title: string;
  onCopy?: (text: string, label?: string) => void;
  label?: string;
}> = ({ text, title, onCopy, label }) => (
  <Tooltip title={title}>
    <Button
      type="text"
      size="small"
      className="ai-chat-icon"
      icon={<CopyOutlined />}
      onClick={() => onCopy?.(text, label)}
      aria-label={title}
    />
  </Tooltip>
);

const headingClassByLevel: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'text-[16px] font-extrabold leading-8 text-slate-950 dark:text-white',
  2: 'text-[15px] font-extrabold leading-7 text-slate-950 dark:text-white',
  3: 'text-[14px] font-bold leading-7 text-slate-900 dark:text-white',
  4: 'text-[13px] font-bold leading-6 text-slate-900 dark:text-white',
  5: 'text-[12px] font-bold leading-6 text-slate-800 dark:text-slate-100',
  6: 'text-[12px] font-semibold leading-6 text-slate-700 dark:text-slate-200',
};

const AiMessageRenderer: React.FC<AiMessageRendererProps> = ({
  text,
  streaming,
  failed,
  stopped,
  onCopyText,
  onRetry,
  onStop,
  agentId = 'text_chat',
  activities,
  sources = [],
}) => {
  const normalizedText = String(text || '').trim();
  const hasText = normalizedText.length > 0;
  const hasCompletedActivities = !streaming && Array.isArray(activities) && activities.some((item) => item.phase === 'completed');

  const markdownComponents = useMemo(() => ({
    pre: ({ children }: ComponentProps) => <>{children}</>,
    code: ({ children, block, lang }: ComponentProps) => {
      const rawCode = extractNodeText(children).replace(/\n$/, '');
      if (!block) {
        return (
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-800 dark:bg-white/10 dark:text-slate-100">
            {children}
          </code>
        );
      }
      return (
        <div className="my-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 text-slate-100 dark:border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-2 py-1 text-[10px] text-slate-300">
            <span>{lang || 'کد'}</span>
            <CopyButton text={rawCode} title="کپی کد" label="کد" onCopy={onCopyText} />
          </div>
          <pre className="m-0 overflow-x-auto p-2 text-left text-[11px] leading-5" dir="ltr">
            <code>{children}</code>
          </pre>
        </div>
      );
    },
    blockquote: ({ children }: ComponentProps) => {
      const rawQuote = extractNodeText(children).replace(/^\n+|\n+$/g, '');
      return (
        <blockquote className="my-2 rounded-md border-s-4 border-[rgb(var(--brand-500-rgb))] bg-slate-50 px-3 py-2 text-slate-800 dark:bg-white/5 dark:text-slate-100">
          <div className="mb-1 flex justify-end">
            <CopyButton text={rawQuote} title="کپی متن" label="متن" onCopy={onCopyText} />
          </div>
          <div className="whitespace-pre-wrap leading-7">{children}</div>
        </blockquote>
      );
    },
    table: ({ children }: ComponentProps) => (
      <div className="my-2.5 max-w-full overflow-x-auto rounded-xl border border-slate-200/90 bg-white/95 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <table className="w-full min-w-full border-collapse text-right text-xs">{children}</table>
      </div>
    ),
    thead: ({ children }: ComponentProps) => (
      <thead className="border-b border-slate-200/90 bg-slate-100/80 font-bold text-slate-900 dark:border-white/10 dark:bg-white/[0.08] dark:text-slate-100">
        {children}
      </thead>
    ),
    tbody: ({ children }: ComponentProps) => (
      <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">{children}</tbody>
    ),
    tr: ({ children }: ComponentProps) => (
      <tr className="transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">{children}</tr>
    ),
    th: ({ children }: ComponentProps) => (
      <th className="whitespace-nowrap px-3 py-2">{children}</th>
    ),
    td: ({ children }: ComponentProps) => (
      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{children}</td>
    ),
    hr: () => <hr className="my-2 border-slate-200 dark:border-white/10" />,
    a: ({ href, children }: ComponentProps<{ href?: string }>) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="break-all text-[rgb(var(--brand-700-rgb))] underline underline-offset-2 dark:text-[rgb(var(--brand-200-rgb))]"
      >
        {children}
      </a>
    ),
    h1: ({ children }: ComponentProps) => <h1 className={`m-0 min-w-0 break-words ${headingClassByLevel[1]}`}>{children}</h1>,
    h2: ({ children }: ComponentProps) => <h2 className={`m-0 min-w-0 break-words ${headingClassByLevel[2]}`}>{children}</h2>,
    h3: ({ children }: ComponentProps) => <h3 className={`m-0 min-w-0 break-words ${headingClassByLevel[3]}`}>{children}</h3>,
    h4: ({ children }: ComponentProps) => <h4 className={`m-0 min-w-0 break-words ${headingClassByLevel[4]}`}>{children}</h4>,
    h5: ({ children }: ComponentProps) => <h5 className={`m-0 min-w-0 break-words ${headingClassByLevel[5]}`}>{children}</h5>,
    h6: ({ children }: ComponentProps) => <h6 className={`m-0 min-w-0 break-words ${headingClassByLevel[6]}`}>{children}</h6>,
  }), [onCopyText]);

  return (
    <div className="ai-message-renderer min-w-0">
      {(streaming || hasCompletedActivities) && (
        <AiActivityStatus
          agentId={agentId}
          activities={activities}
          streaming={Boolean(streaming)}
          onStop={onStop}
        />
      )}
      {(failed || stopped) && onRetry ? (
        <div className="mb-1 flex items-center justify-end gap-1">
          <Tooltip title="تلاش دوباره">
            <Button
              type="text"
              size="small"
              className="ai-chat-icon"
              icon={<ReloadOutlined />}
              onClick={onRetry}
              aria-label="تلاش دوباره"
            />
          </Tooltip>
        </div>
      ) : null}
      {!hasText && streaming ? null : (
        <>
          <div className="ai-xmarkdown-body">
            <XMarkdown
              content={String(text || '')}
              escapeRawHtml
              openLinksInNewTab
              disableDefaultStyles={['pre', 'code', 'table', 'th', 'td', 'hr']}
              streaming={streaming ? { hasNextChunk: true, incompleteMarkdown: 'complete' } : false}
              components={markdownComponents as any}
            />
            {streaming ? <span className="ai-chat-stream-cursor" aria-hidden="true" /> : null}
          </div>
          {!streaming && sources.length > 0 ? <AiSourcesCard sources={sources} /> : null}
        </>
      )}
    </div>
  );
};

export default AiMessageRenderer;
