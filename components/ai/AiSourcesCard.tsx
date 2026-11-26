import React, { useState } from 'react';
import { BookOutlined, DownOutlined, GlobalOutlined, LinkOutlined, UpOutlined } from '@ant-design/icons';

export type AiSourceItem = {
  title: string;
  url?: string;
  description?: string;
};

type Props = {
  sources?: AiSourceItem[];
};

const isSafeHttpUrl = (value?: string) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export function extractAiSourcesFromMetadata(metadata?: Record<string, any> | null, text?: string): AiSourceItem[] {
  const results: AiSourceItem[] = [];
  const seen = new Set<string>();
  const pushItem = (raw: any) => {
    if (!raw) return;
    if (typeof raw === 'string') {
      const clean = raw.trim();
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      results.push(isSafeHttpUrl(clean) ? { title: clean.replace(/^https?:\/\//, '').split('/')[0], url: clean } : { title: clean });
      return;
    }
    if (typeof raw !== 'object') return;
    const url = String(raw.url || raw.href || raw.link || '').trim() || undefined;
    const title = String(raw.title || raw.name || raw.label || raw.documentTitle || raw.source || (url ? url.replace(/^https?:\/\//, '').split('/')[0] : '')).trim();
    const description = String(raw.description || raw.snippet || raw.excerpt || '').trim() || undefined;
    const key = `${title}::${url || ''}`;
    if (!title || seen.has(key)) return;
    seen.add(key);
    results.push({ title, url: isSafeHttpUrl(url) ? url : undefined, description });
  };

  const candidates = [
    metadata?.sources,
    metadata?.citations,
    metadata?.knowledge_sources,
    metadata?.web_sources,
    metadata?.references,
  ];
  candidates.forEach((list) => {
    if (Array.isArray(list)) list.forEach(pushItem);
  });

  // Also detect markdown reference URLs if web_search was used and metadata didn't explicitly structure sources
  if (results.length === 0 && text) {
    const usedWeb = Array.isArray(metadata?.capabilities) && metadata.capabilities.includes('web_search');
    if (usedWeb) {
      const matches = text.match(/https?:\/\/[^\s<>()]+/gi) || [];
      matches.slice(0, 6).forEach((url) => pushItem(url));
    }
  }

  return results;
}

/** Ant Design X v2-inspired Sources citation card styled with AntD 5 / workspace tokens. */
export default function AiSourcesCard({ sources = [] }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!sources.length) return null;

  return (
    <div className="ai-sources-card mt-2.5 rounded-xl border border-[var(--ai-chat-line)] bg-[var(--ai-chat-surface)] px-2.5 py-2" dir="rtl">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300"
      >
        <span className="inline-flex items-center gap-1.5">
          <BookOutlined className="text-[rgb(var(--brand-600-rgb))] dark:text-[rgb(var(--brand-300-rgb))]" />
          <span>{sources.length.toLocaleString('fa-IR')} منبع و ارجاع</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-400">
          <span>{expanded ? 'بستن' : 'مشاهده'}</span>
          {expanded ? <UpOutlined className="text-[9px]" /> : <DownOutlined className="text-[9px]" />}
        </span>
      </button>

      {!expanded ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {sources.slice(0, 4).map((src, idx) => (
            src.url ? (
              <a
                key={`${src.title}-${idx}`}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-[200px] items-center gap-1 rounded-full border border-[var(--ai-chat-line)] bg-[var(--ai-chat-canvas)] px-2 py-0.5 text-[10.5px] text-slate-700 transition hover:border-[rgb(var(--brand-500-rgb))] dark:text-slate-200"
              >
                <GlobalOutlined className="shrink-0 text-[10px] text-[rgb(var(--brand-600-rgb))]" />
                <span className="truncate">{src.title}</span>
              </a>
            ) : (
              <span
                key={`${src.title}-${idx}`}
                className="inline-flex max-w-[200px] items-center gap-1 rounded-full border border-[var(--ai-chat-line)] bg-[var(--ai-chat-canvas)] px-2 py-0.5 text-[10.5px] text-slate-600 dark:text-slate-300"
              >
                <BookOutlined className="shrink-0 text-[10px]" />
                <span className="truncate">{src.title}</span>
              </span>
            )
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-1.5 border-t border-[var(--ai-chat-line)] pt-2">
          {sources.map((src, idx) => (
            <div key={`${src.title}-${idx}`} className="rounded-lg bg-[var(--ai-chat-canvas)] px-2.5 py-1.5 text-[11.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {(idx + 1).toLocaleString('fa-IR')}. {src.title}
                </span>
                {src.url ? (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-[10.5px] text-[rgb(var(--brand-700-rgb))] hover:underline dark:text-[rgb(var(--brand-300-rgb))]"
                  >
                    <LinkOutlined />
                    <span>باز کردن</span>
                  </a>
                ) : null}
              </div>
              {src.description ? (
                <div className="mt-0.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{src.description}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
