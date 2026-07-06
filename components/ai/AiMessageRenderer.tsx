import React from 'react';
import { Button, Tooltip } from 'antd';
import { CopyOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';

type AiMessageRendererProps = {
  text: string;
  streaming?: boolean;
  failed?: boolean;
  stopped?: boolean;
  onCopyText?: (text: string, label?: string) => void;
  onRetry?: () => void;
  onStop?: () => void;
};

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; text: string; language?: string }
  | { type: 'hr' };

const URL_RE = /https?:\/\/[^\s<>()]+/gi;

const isSafeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const splitInline = (text: string) => {
  const tokens: Array<{ type: 'text' | 'bold' | 'code' | 'link'; text: string }> = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|https?:\/\/[^\s<>()]+)/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) tokens.push({ type: 'text', text: text.slice(cursor, match.index) });
    const raw = match[0];
    if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push({ type: 'bold', text: raw.slice(2, -2) });
    } else if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push({ type: 'code', text: raw.slice(1, -1) });
    } else if (URL_RE.test(raw) && isSafeUrl(raw)) {
      tokens.push({ type: 'link', text: raw });
    } else {
      tokens.push({ type: 'text', text: raw });
    }
    URL_RE.lastIndex = 0;
    cursor = match.index + raw.length;
  }
  if (cursor < text.length) tokens.push({ type: 'text', text: text.slice(cursor) });
  return tokens;
};

const renderInline = (text: string) => splitInline(text).map((part, index) => {
  const key = `${part.type}-${index}-${part.text.slice(0, 8)}`;
  if (part.type === 'bold') return <strong key={key} className="font-bold text-slate-900 dark:text-white">{renderInline(part.text)}</strong>;
  if (part.type === 'code') return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-800 dark:bg-white/10 dark:text-slate-100">{part.text}</code>;
  if (part.type === 'link') return <a key={key} href={part.text} target="_blank" rel="noreferrer" className="break-all text-[rgb(var(--brand-700-rgb))] underline underline-offset-2">{part.text}</a>;
  return <React.Fragment key={key}>{part.text}</React.Fragment>;
});

const parseBlocks = (text: string): Block[] => {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  let quote: string[] = [];
  let codeLines: string[] | null = null;
  let codeLanguage = '';

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n').trim() });
    paragraph = [];
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ type: 'quote', text: quote.join('\n').trim() });
    quote = [];
  };
  const flushList = () => {
    if (listType && listItems.length) blocks.push({ type: listType, items: listItems });
    listType = null;
    listItems = [];
  };

  lines.forEach((line) => {
    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      if (codeLines) {
        blocks.push({ type: 'code', text: codeLines.join('\n'), language: codeLanguage });
        codeLines = null;
        codeLanguage = '';
      } else {
        flushParagraph();
        flushQuote();
        flushList();
        codeLines = [];
        codeLanguage = fence[1] || '';
      }
      return;
    }
    if (codeLines) {
      codeLines.push(line);
      return;
    }
    if (/^\s*$/.test(line)) {
      flushParagraph();
      flushQuote();
      flushList();
      return;
    }
    if (/^\s*---+\s*$/.test(line)) {
      flushParagraph();
      flushQuote();
      flushList();
      blocks.push({ type: 'hr' });
      return;
    }
    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
      return;
    }
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(unordered[1]);
      return;
    }
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(ordered[1]);
      return;
    }
    flushList();
    flushQuote();
    paragraph.push(line);
  });

  const remainingCodeLines = codeLines as unknown as string[] | null;
  if (remainingCodeLines) blocks.push({ type: 'code', text: remainingCodeLines.join('\n'), language: codeLanguage });
  flushParagraph();
  flushQuote();
  flushList();
  return blocks.length ? blocks : [{ type: 'paragraph', text: String(text || '').trim() }];
};

const CopyButton: React.FC<{ text: string; title: string; onCopy?: (text: string, label?: string) => void; label?: string }> = ({ text, title, onCopy, label }) => (
  <Tooltip title={title}>
    <Button
      type="text"
      size="small"
      className="!h-5 !w-5 !min-w-0 !px-0 !text-slate-400 hover:!text-[rgb(var(--brand-700-rgb))]"
      icon={<CopyOutlined />}
      onClick={() => onCopy?.(text, label)}
      aria-label={title}
    />
  </Tooltip>
);

const AiMessageRenderer: React.FC<AiMessageRendererProps> = ({
  text,
  streaming,
  failed,
  stopped,
  onCopyText,
  onRetry,
  onStop,
}) => {
  const blocks = parseBlocks(text);
  const hasText = String(text || '').trim().length > 0;
  return (
    <div className="ai-message-renderer min-w-0">
      <div className="mb-1 flex items-center justify-end gap-1">
        {streaming && onStop ? (
          <Tooltip title="توقف دریافت پاسخ">
            <Button type="text" size="small" danger className="!h-5 !w-5 !min-w-0 !px-0" icon={<StopOutlined />} onClick={onStop} aria-label="توقف دریافت پاسخ" />
          </Tooltip>
        ) : null}
        {(failed || stopped) && onRetry ? (
          <Tooltip title="تلاش دوباره">
            <Button type="text" size="small" className="!h-5 !w-5 !min-w-0 !px-0" icon={<ReloadOutlined />} onClick={onRetry} aria-label="تلاش دوباره" />
          </Tooltip>
        ) : null}
      </div>
      {!hasText && streaming ? (
        <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-300">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[rgb(var(--brand-600-rgb))]" />
          در حال آماده‌سازی پاسخ...
        </div>
      ) : (
        <div className="space-y-2">
          {blocks.map((block, index) => {
            if (block.type === 'hr') return <hr key={`hr-${index}`} className="border-slate-200 dark:border-white/10" />;
            if (block.type === 'code') {
              return (
                <div key={`code-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 text-slate-100 dark:border-white/10">
                  <div className="flex items-center justify-between border-b border-white/10 px-2 py-1 text-[10px] text-slate-300">
                    <span>{block.language || 'کد'}</span>
                    <CopyButton text={block.text} title="کپی کد" label="کد" onCopy={onCopyText} />
                  </div>
                  <pre className="m-0 overflow-x-auto p-2 text-left text-[11px] leading-5" dir="ltr"><code>{block.text}</code></pre>
                </div>
              );
            }
            if (block.type === 'quote') {
              return (
                <blockquote key={`quote-${index}`} className="m-0 rounded-md border-s-4 border-[rgb(var(--brand-500-rgb))] bg-slate-50 px-3 py-2 text-slate-800 dark:bg-white/5 dark:text-slate-100">
                  <div className="mb-1 flex justify-end">
                    <CopyButton text={block.text} title="کپی متن" label="متن" onCopy={onCopyText} />
                  </div>
                  <div className="whitespace-pre-wrap leading-7">{renderInline(block.text)}</div>
                </blockquote>
              );
            }
            if (block.type === 'ul' || block.type === 'ol') {
              const Tag = block.type;
              return (
                <Tag key={`${block.type}-${index}`} className={`m-0 ps-5 ${block.type === 'ul' ? 'list-disc' : 'list-decimal'}`}>
                  {block.items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`} className="mb-1 last:mb-0">{renderInline(item)}</li>)}
                </Tag>
              );
            }
            return (
              <p key={`p-${index}`} className="m-0 min-w-0 whitespace-pre-wrap">{renderInline(block.text)}</p>
            );
          })}
          {streaming ? <span className="inline-block h-4 w-1 animate-pulse rounded bg-[rgb(var(--brand-600-rgb))] align-middle" /> : null}
        </div>
      )}
    </div>
  );
};

export default AiMessageRenderer;
