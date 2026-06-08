import { useState } from 'react';
import DOMPurify from 'dompurify';
import type { Block } from './BlockEditor';

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────
function safe(html: string) {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function getEmbedUrl(platform: string, embedId: string): string {
  if (platform === 'aparat') return `https://www.aparat.com/video/video/embed/videohash/${embedId}/vt/frame`;
  if (platform === 'youtube') return `https://www.youtube.com/embed/${embedId}`;
  if (platform === 'vimeo') return `https://player.vimeo.com/video/${embedId}`;
  return '';
}

// ──────────────────────────────────────────────────
// Block components (public-facing, read-only)
// ──────────────────────────────────────────────────
function ParagraphBlock({ content }: { content: string }) {
  return (
    <div
      className="prose prose-zinc max-w-none leading-8 text-zinc-800"
      dangerouslySetInnerHTML={{ __html: safe(content) }}
    />
  );
}

function HeadingBlock({ level, content }: { level: number; content: string }) {
  const cls = 'font-bold text-zinc-950 mt-8 mb-3';
  const sizeMap: Record<number, string> = {
    1: 'text-4xl', 2: 'text-3xl', 3: 'text-2xl',
    4: 'text-xl', 5: 'text-lg', 6: 'text-base',
  };
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  return <Tag className={`${cls} ${sizeMap[level] ?? 'text-xl'}`}>{content}</Tag>;
}

function ImageBlock({ url, alt, caption }: { url: string; alt: string; caption?: string }) {
  return (
    <figure className="my-6">
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="w-full rounded-2xl object-cover shadow-sm"
      />
      {caption && (
        <figcaption className="text-center text-sm text-zinc-400 mt-2">{caption}</figcaption>
      )}
    </figure>
  );
}

function GalleryBlock({ images }: { images: { url: string; alt: string; caption?: string }[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 my-6">
        {images.map((img, i) => (
          <button
            key={i}
            type="button"
            className="group overflow-hidden rounded-xl focus:outline-none"
            onClick={() => setLightbox(img.url)}
          >
            <img
              src={img.url}
              alt={img.alt}
              loading="lazy"
              className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </button>
        ))}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button
            type="button"
            className="absolute top-4 right-4 text-white text-3xl leading-none"
            onClick={() => setLightbox(null)}
          >×</button>
        </div>
      )}
    </>
  );
}

function VideoEmbedBlock({ platform, embedId }: { platform: string; embedId: string }) {
  const src = getEmbedUrl(platform, embedId);
  if (!src) return null;
  return (
    <div className="relative my-6 rounded-2xl overflow-hidden shadow-md" style={{ paddingTop: '56.25%' }}>
      <iframe
        src={src}
        className="absolute inset-0 w-full h-full"
        allowFullScreen
        loading="lazy"
        title="ویدیو"
      />
    </div>
  );
}

function VideoFileBlock({ url, title }: { url: string; title?: string }) {
  return (
    <figure className="my-6">
      <video
        src={url}
        controls
        className="w-full rounded-2xl shadow-md"
        preload="metadata"
      />
      {title && <figcaption className="text-center text-sm text-zinc-400 mt-2">{title}</figcaption>}
    </figure>
  );
}

function ChecklistBlock({ items }: { items: { text: string; checked: boolean }[] }) {
  return (
    <ul className="my-4 space-y-2 list-none p-0">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs
            ${item.checked ? 'bg-teal-500 border-teal-500 text-white' : 'border-zinc-300'}`}>
            {item.checked && '✓'}
          </span>
          <span className={item.checked ? 'line-through text-zinc-400' : 'text-zinc-700'}>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

function QuoteBlock({ content, author, source }: { content: string; author?: string; source?: string }) {
  return (
    <blockquote className="my-6 border-r-4 border-teal-400 pr-6 py-2">
      <div
        className="text-lg text-zinc-700 leading-8 italic"
        dangerouslySetInnerHTML={{ __html: safe(content) }}
      />
      {(author || source) && (
        <footer className="mt-3 text-sm text-zinc-400">
          {author && <span className="font-medium text-zinc-600">{author}</span>}
          {author && source && <span className="mx-1">—</span>}
          {source && <cite>{source}</cite>}
        </footer>
      )}
    </blockquote>
  );
}

const alertStyles: Record<string, { bg: string; border: string; icon: string; text: string }> = {
  info:    { bg: 'bg-blue-50',   border: 'border-blue-300',  icon: '💡', text: 'text-blue-800' },
  warning: { bg: 'bg-amber-50',  border: 'border-amber-300', icon: '⚠️', text: 'text-amber-900' },
  danger:  { bg: 'bg-red-50',    border: 'border-red-300',   icon: '🚫', text: 'text-red-800' },
  success: { bg: 'bg-emerald-50',border: 'border-emerald-300',icon: '✅', text: 'text-emerald-800' },
};

function AlertBlock({ variant, title, content }: { variant: string; title?: string; content: string }) {
  const s = alertStyles[variant] ?? alertStyles.info;
  return (
    <div className={`my-4 rounded-xl border ${s.bg} ${s.border} p-4`}>
      <div className={`flex items-start gap-2 ${s.text}`}>
        <span className="text-lg leading-tight mt-0.5">{s.icon}</span>
        <div>
          {title && <p className="font-semibold mb-1">{title}</p>}
          <p className="leading-relaxed">{content}</p>
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ language, content }: { language: string; content: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-zinc-200 shadow-sm">
      <div className="flex items-center justify-between bg-zinc-900 px-4 py-2">
        <span className="text-xs text-zinc-400 font-mono">{language}</span>
        <button
          type="button"
          onClick={copy}
          className="text-xs text-zinc-400 hover:text-white transition-colors"
        >
          {copied ? '✓ کپی شد' : 'کپی'}
        </button>
      </div>
      <pre className="bg-zinc-950 text-zinc-100 p-4 overflow-x-auto text-sm leading-6 font-mono m-0 whitespace-pre" dir="ltr">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function DividerBlock() {
  return <hr className="my-8 border-zinc-200" />;
}

// ──────────────────────────────────────────────────
// Main BlockRenderer
// ──────────────────────────────────────────────────
interface BlockRendererProps {
  blocks: Block[];
  className?: string;
}

export default function BlockRenderer({ blocks, className = '' }: BlockRendererProps) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className={`block-renderer ${className}`}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'paragraph':
            return <ParagraphBlock key={i} content={block.content} />;
          case 'heading':
            return <HeadingBlock key={i} level={block.level} content={block.content} />;
          case 'image':
            return block.url ? (
              <ImageBlock key={i} url={block.url} alt={block.alt} caption={block.caption} />
            ) : null;
          case 'gallery':
            return block.images.length > 0 ? (
              <GalleryBlock key={i} images={block.images} />
            ) : null;
          case 'video_embed':
            return block.embed_id ? (
              <VideoEmbedBlock key={i} platform={block.platform} embedId={block.embed_id} />
            ) : null;
          case 'video_file':
            return block.url ? (
              <VideoFileBlock key={i} url={block.url} title={block.title} />
            ) : null;
          case 'checklist':
            return <ChecklistBlock key={i} items={block.items} />;
          case 'quote':
            return block.content ? (
              <QuoteBlock key={i} content={block.content} author={block.author} source={block.source} />
            ) : null;
          case 'alert':
            return block.content ? (
              <AlertBlock key={i} variant={block.variant} title={block.title} content={block.content} />
            ) : null;
          case 'code':
            return block.content ? (
              <CodeBlock key={i} language={block.language} content={block.content} />
            ) : null;
          case 'divider':
            return <DividerBlock key={i} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
