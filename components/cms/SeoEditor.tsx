import { useMemo } from 'react';
import { Input, Collapse, Progress, Divider } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { SITE_URL } from '../../utils/seoHelpers';

export interface SeoData {
  seo_title: string;
  seo_description: string;
  og_image_url: string;
  canonical_url: string;
  focus_keyword: string;
}

interface SeoEditorProps {
  value: SeoData;
  onChange: (data: SeoData) => void;
  postTitle?: string;
  postExcerpt?: string;
  postSlug?: string;
  postType?: 'blog' | 'tutorial';
  readingTime?: number;
  contentText?: string;
}

function CharCounter({ value, max, warn, danger }: { value: string; max: number; warn: number; danger: number }) {
  const len = value.length;
  const color = len > danger ? '#ef4444' : len > warn ? '#f59e0b' : '#10b981';
  return (
    <span style={{ fontSize: 11, color, fontVariantNumeric: 'tabular-nums' }}>
      {len} / {max}
    </span>
  );
}

function GooglePreview({
  title, description, url,
}: { title: string; description: string; url: string }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 font-sans">
      <p className="text-xs text-zinc-400 mb-1">پیش‌نمایش گوگل</p>
      <div className="text-xs text-zinc-500 mb-0.5 truncate">{url}</div>
      <div className="text-blue-700 text-base leading-snug mb-1 line-clamp-2 font-medium">
        {title || 'عنوان صفحه'}
      </div>
      <div className="text-zinc-600 text-sm leading-5 line-clamp-2">
        {description || 'توضیح متا اینجا نمایش داده می‌شود...'}
      </div>
    </div>
  );
}

function SeoAnalysis({
  title, description, keyword, readingTime, contentText,
}: { title: string; description: string; keyword: string; readingTime?: number; contentText?: string }) {
  const checks = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const results: { ok: boolean; label: string }[] = [];

    results.push({
      ok: title.length >= 30 && title.length <= 60,
      label: `طول عنوان: ${title.length} کاراکتر (ایده‌آل ۳۰–۶۰)`,
    });

    results.push({
      ok: description.length >= 100 && description.length <= 160,
      label: `طول توضیح: ${description.length} کاراکتر (ایده‌آل ۱۰۰–۱۶۰)`,
    });

    if (kw) {
      results.push({
        ok: title.toLowerCase().includes(kw),
        label: 'کلمه کلیدی در عنوان SEO',
      });
      results.push({
        ok: description.toLowerCase().includes(kw),
        label: 'کلمه کلیدی در توضیح متا',
      });
      if (contentText) {
        results.push({
          ok: contentText.toLowerCase().includes(kw),
          label: 'کلمه کلیدی در محتوا',
        });
      }
    }

    if (readingTime) {
      results.push({
        ok: readingTime >= 3,
        label: `زمان مطالعه: ${readingTime} دقیقه${readingTime < 3 ? ' (محتوا کم است)' : ''}`,
      });
    }

    return results;
  }, [title, description, keyword, readingTime, contentText]);

  const score = Math.round((checks.filter(c => c.ok).length / (checks.length || 1)) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Progress
          type="circle"
          percent={score}
          size={48}
          strokeColor={score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'}
          format={p => <span style={{ fontSize: 11 }}>{p}%</span>}
        />
        <div>
          <p className="text-sm font-medium text-zinc-700">
            {score >= 80 ? 'SEO خوب' : score >= 50 ? 'قابل بهبود' : 'نیاز به بهبود'}
          </p>
          <p className="text-xs text-zinc-400">{checks.filter(c => c.ok).length} از {checks.length} مورد</p>
        </div>
      </div>
      <ul className="space-y-1">
        {checks.map((c, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span>{c.ok ? '✅' : '⚠️'}</span>
            <span className={c.ok ? 'text-zinc-600' : 'text-amber-700'}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SeoEditor({
  value, onChange, postTitle = '', postExcerpt = '',
  postSlug = '', postType = 'blog', readingTime, contentText,
}: SeoEditorProps) {
  const update = (patch: Partial<SeoData>) => onChange({ ...value, ...patch });

  const previewTitle = value.seo_title || postTitle || 'عنوان صفحه';
  const previewDesc = value.seo_description || postExcerpt || '';
  const previewUrl = value.canonical_url || (postSlug
    ? `${SITE_URL}/${postType === 'blog' ? 'blog' : 'learn'}/${postSlug}`
    : `${SITE_URL}/...`);

  return (
    <div className="space-y-4">
      <Collapse
        defaultActiveKey={['seo']}
        items={[
          {
            key: 'seo',
            label: (
              <span className="font-medium text-zinc-700">
                🔍 تنظیمات SEO
              </span>
            ),
            children: (
              <div className="space-y-4">
                {/* SEO Title */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-zinc-600">عنوان SEO</label>
                    <CharCounter value={value.seo_title} max={60} warn={55} danger={65} />
                  </div>
                  <Input
                    value={value.seo_title}
                    onChange={e => update({ seo_title: e.target.value })}
                    placeholder={postTitle || 'عنوان برای نمایش در موتورهای جستجو...'}
                    maxLength={80}
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    اگر خالی بماند از عنوان اصلی استفاده می‌شود
                  </p>
                </div>

                {/* SEO Description */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-zinc-600">توضیح متا</label>
                    <CharCounter value={value.seo_description} max={160} warn={150} danger={165} />
                  </div>
                  <Input.TextArea
                    value={value.seo_description}
                    onChange={e => update({ seo_description: e.target.value })}
                    placeholder={postExcerpt || 'توضیح خلاصه برای نمایش در نتایج جستجو...'}
                    rows={3}
                    maxLength={200}
                  />
                </div>

                {/* Focus Keyword */}
                <div>
                  <label className="text-sm font-medium text-zinc-600 block mb-1">
                    کلمه کلیدی اصلی
                  </label>
                  <Input
                    value={value.focus_keyword}
                    onChange={e => update({ focus_keyword: e.target.value })}
                    placeholder="مثلاً: نرم‌افزار حسابداری ابری"
                    prefix={<span className="text-zinc-400">#</span>}
                  />
                </div>

                {/* OG Image */}
                <div>
                  <label className="text-sm font-medium text-zinc-600 block mb-1">
                    تصویر شبکه‌های اجتماعی (OG Image)
                  </label>
                  <Input
                    value={value.og_image_url}
                    onChange={e => update({ og_image_url: e.target.value })}
                    placeholder="URL تصویر ۱۲۰۰×۶۳۰..."
                  />
                  {value.og_image_url && (
                    <img
                      src={value.og_image_url}
                      alt="OG"
                      className="mt-2 h-24 w-auto rounded-lg border border-zinc-200 object-cover"
                      onError={e => (e.currentTarget.style.display = 'none')}
                    />
                  )}
                </div>

                {/* Canonical */}
                <div>
                  <label className="text-sm font-medium text-zinc-600 block mb-1">
                    URL کانونیکال
                  </label>
                  <Input
                    value={value.canonical_url}
                    onChange={e => update({ canonical_url: e.target.value })}
                    placeholder={previewUrl}
                    prefix={<InfoCircleOutlined className="text-zinc-400" />}
                  />
                  <p className="text-xs text-zinc-400 mt-1">معمولاً خالی بگذارید</p>
                </div>

                <Divider style={{ margin: '8px 0' }} />

                {/* Google Preview */}
                <GooglePreview
                  title={previewTitle}
                  description={previewDesc}
                  url={previewUrl}
                />

                <Divider style={{ margin: '8px 0' }} />

                {/* Analysis */}
                <SeoAnalysis
                  title={previewTitle}
                  description={previewDesc}
                  keyword={value.focus_keyword}
                  readingTime={readingTime}
                  contentText={contentText}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
