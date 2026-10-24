import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BlockRenderer from './BlockRenderer';
import type { Block } from './BlockEditor';

const blocks: Block[] = [
  { id: 'paragraph', type: 'paragraph', content: '<p>متن فارسی <strong>برجسته</strong> و <a href="/learn">آموزش</a></p>' },
  { id: 'heading', type: 'heading', level: 2, content: 'عنوان مطلب' },
  { id: 'image', type: 'image', url: '/image.png', alt: 'تصویر', caption: 'توضیح تصویر' },
  { id: 'video', type: 'video_file', url: '/video.mp4', title: 'توضیح ویدیو' },
  { id: 'checklist', type: 'checklist', items: [{ text: 'انجام‌شده', checked: true }, { text: 'در انتظار', checked: false }] },
  { id: 'quote', type: 'quote', content: 'نقل‌قول', author: 'نویسنده', source: 'منبع' },
  ...(['info', 'warning', 'danger', 'success'] as const).map(variant => ({ id: variant, type: 'alert' as const, variant, title: 'نکته', content: 'متن نکته' })),
  { id: 'code', type: 'code', language: 'text', content: 'sample code' },
  { id: 'divider', type: 'divider' },
];

describe('BlockRenderer reading surface', () => {
  it('keeps every public content block light regardless of an inherited night theme', () => {
    const html = renderToStaticMarkup(<div className="dark"><BlockRenderer blocks={blocks} colorScheme="light" /></div>);
    expect(html).not.toContain('dark:');
    expect(html).toContain('text-zinc-800');
    expect(html).toContain('text-zinc-950');
    expect(html).toContain('prose-zinc');
    expect(html).toContain('bg-blue-50');
    expect(html).toContain('text-blue-800');
    expect(html).toContain('bg-zinc-950 text-zinc-100'); // Deliberately dark code surface stays readable.
    expect(html).toContain('متن فارسی');
  });

  it('preserves automatic dark mode for contextual tutorials inside the tenant panel', () => {
    const html = renderToStaticMarkup(<BlockRenderer blocks={blocks} />);
    expect(html).toContain('dark:prose-invert');
    expect(html).toContain('dark:text-zinc-200');
    expect(html).toContain('dark:bg-blue-950/40');
  });

  it('continues sanitizing published HTML when the light surface is requested', () => {
    const html = renderToStaticMarkup(<BlockRenderer colorScheme="light" blocks={[{ id: 'unsafe', type: 'paragraph', content: '<p>متن مجاز</p><script>alert(1)</script>' }]} />);
    expect(html).toContain('متن مجاز');
    expect(html).not.toContain('<script');
  });
});
