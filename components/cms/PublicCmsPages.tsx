import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { Spin, Tag, Empty } from 'antd';
import {
  ClockCircleOutlined, UserOutlined, CalendarOutlined,
  ReadOutlined, FireOutlined, LeftOutlined, RightOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { supabase } from '../../supabaseClient';
import BlockRenderer from './BlockRenderer';
import SeoHead from './SeoHead';
import {
  buildBlogPostSeo, buildTutorialPostSeo,
  buildBlogIndexSeo, buildTutorialIndexSeo,
} from '../../utils/seoHelpers';

dayjs.extend(relativeTime);

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────
interface PostCard {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  cover_image_url?: string;
  author_name?: string;
  author_avatar?: string;
  is_featured: boolean;
  published_at?: string;
  reading_time_minutes?: number;
  difficulty_level?: string;
  duration_minutes?: number;
  series_id?: string;
}

interface Category {
  id: string; name: string; slug: string;
}

// ──────────────────────────────────────────────────
// Difficulty badge
// ──────────────────────────────────────────────────
const difficultyColor: Record<string, string> = {
  beginner: 'bg-emerald-100 text-emerald-700',
  intermediate: 'bg-blue-100 text-blue-700',
  advanced: 'bg-amber-100 text-amber-700',
  expert: 'bg-red-100 text-red-700',
};
const difficultyLabel: Record<string, string> = {
  beginner: 'مبتدی', intermediate: 'متوسط',
  advanced: 'پیشرفته', expert: 'حرفه‌ای',
};

// ──────────────────────────────────────────────────
// Featured Slider
// ──────────────────────────────────────────────────
export function FeaturedSlider({ posts, basePath }: { posts: PostCard[]; basePath: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (posts.length <= 1) return;
    timerRef.current = setInterval(() => {
      if (!paused) setIndex(i => (i + 1) % posts.length);
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [posts.length, paused]);

  if (!posts.length) return null;
  const post = posts[index];

  return (
    <div
      className="relative overflow-hidden rounded-3xl aspect-[16/7] min-h-[260px] group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: post.cover_image_url ? `url(${post.cover_image_url})` : undefined, backgroundColor: '#1e293b' }}
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-medium bg-teal-500 text-white px-3 py-1 rounded-full">
            ویژه
          </span>
          {post.difficulty_level && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${difficultyColor[post.difficulty_level]}`}>
              {difficultyLabel[post.difficulty_level]}
            </span>
          )}
        </div>
        <h2 className="text-xl md:text-3xl font-black text-white leading-tight line-clamp-2 mb-3">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="text-white/70 text-sm md:text-base leading-relaxed line-clamp-2 mb-4 max-w-2xl">
            {post.excerpt}
          </p>
        )}
        <div className="flex items-center gap-4">
          <Link
            to={`${basePath}/${post.slug}`}
            className="inline-flex items-center gap-2 bg-white text-zinc-900 font-bold px-5 py-2 rounded-full text-sm hover:bg-teal-50 transition-colors"
          >
            <ReadOutlined /> بخوانید
          </Link>
          <div className="flex items-center gap-3 text-white/60 text-xs">
            {post.author_name && (
              <span className="flex items-center gap-1"><UserOutlined />{post.author_name}</span>
            )}
            {post.reading_time_minutes && (
              <span className="flex items-center gap-1"><ClockCircleOutlined />{post.reading_time_minutes} دقیقه</span>
            )}
          </div>
        </div>
      </div>

      {/* Navigation arrows */}
      {posts.length > 1 && (
        <>
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
            onClick={() => setIndex(i => (i - 1 + posts.length) % posts.length)}
          >
            <RightOutlined />
          </button>
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
            onClick={() => setIndex(i => (i + 1) % posts.length)}
          >
            <LeftOutlined />
          </button>
        </>
      )}

      {/* Dots */}
      {posts.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {posts.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`w-2 h-2 rounded-full transition-all ${i === index ? 'bg-white w-6' : 'bg-white/40'}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Post Card
// ──────────────────────────────────────────────────
function PostCard({ post, basePath }: { post: PostCard; basePath: string }) {
  return (
    <Link
      to={`${basePath}/${post.slug}`}
      className="group block bg-white rounded-2xl overflow-hidden border border-zinc-100 hover:border-teal-200 hover:shadow-md transition-all duration-300"
    >
      {post.cover_image_url && (
        <div className="overflow-hidden">
          <img
            src={post.cover_image_url}
            alt={post.title}
            loading="lazy"
            className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      )}
      <div className="p-5">
        {post.difficulty_level && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${difficultyColor[post.difficulty_level]} mb-2 inline-block`}>
            {difficultyLabel[post.difficulty_level]}
          </span>
        )}
        <h3 className="font-bold text-zinc-900 text-base leading-snug mb-2 line-clamp-2 group-hover:text-teal-700 transition-colors">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="text-zinc-500 text-sm leading-6 line-clamp-2 mb-3">{post.excerpt}</p>
        )}
        <div className="flex items-center gap-3 text-zinc-400 text-xs">
          {post.author_name && (
            <span className="flex items-center gap-1"><UserOutlined />{post.author_name}</span>
          )}
          {post.published_at && (
            <span className="flex items-center gap-1">
              <CalendarOutlined />
              {dayjs(post.published_at).format('D MMM YYYY')}
            </span>
          )}
          {post.reading_time_minutes && (
            <span className="flex items-center gap-1 mr-auto">
              <ClockCircleOutlined />{post.reading_time_minutes} دقیقه
            </span>
          )}
          {post.duration_minutes && (
            <span className="flex items-center gap-1 mr-auto">
              <ClockCircleOutlined />{post.duration_minutes} دقیقه
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ──────────────────────────────────────────────────
// Blog Index Page
// ──────────────────────────────────────────────────
export function BlogIndexPage() {
  const [featured, setFeatured] = useState<PostCard[]>([]);
  const [posts, setPosts] = useState<PostCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 12;

  useEffect(() => {
    // load featured + categories in parallel
    Promise.all([
      supabase.rpc('get_cms_blog_posts', { p_featured: true, p_limit: 5, p_offset: 0 }),
      supabase.from('cms_categories').select('id, name, slug').in('type', ['blog', 'both']).order('sort_order'),
    ]).then(([featuredRes, catRes]) => {
      setFeatured(featuredRes.data ?? []);
      setCategories(catRes.data ?? []);
    });
  }, []);

  const loadPosts = useCallback(async (reset = false) => {
    setLoading(true);
    const currentPage = reset ? 0 : page;
    const { data } = await supabase.rpc('get_cms_blog_posts', {
      p_limit: LIMIT,
      p_offset: currentPage * LIMIT,
      p_category: activeCategory === 'all' ? null : activeCategory,
    });
    const items = data ?? [];
    if (reset) {
      setPosts(items);
      setPage(1);
    } else {
      setPosts(prev => [...prev, ...items]);
      setPage(p => p + 1);
    }
    setHasMore(items.length === LIMIT);
    setLoading(false);
  }, [page, activeCategory]);

  useEffect(() => { loadPosts(true); }, [activeCategory]);

  const seo = buildBlogIndexSeo();

  return (
    <main className="px-4 py-10 max-w-7xl mx-auto" dir="rtl">
      <SeoHead {...seo} />

      {/* Header */}
      <div className="mb-8">
        <p className="text-teal-600 text-sm font-bold mb-1">بلاگ تازه سیستم</p>
        <h1 className="text-3xl md:text-4xl font-black text-zinc-950 mb-3">مقالات و راهنماها</h1>
        <p className="text-zinc-500 text-base max-w-xl">
          مطالب تخصصی درباره مدیریت کسب‌وکار، فناوری و نرم‌افزار سازمانی
        </p>
      </div>

      {/* Featured slider */}
      {featured.length > 0 && (
        <div className="mb-10">
          <FeaturedSlider posts={featured} basePath="/blog" />
        </div>
      )}

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            type="button"
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory === 'all' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
            onClick={() => setActiveCategory('all')}
          >
            همه
          </button>
          {categories.map(cat => (
            <button
              key={cat.slug}
              type="button"
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory === cat.slug ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
              onClick={() => setActiveCategory(cat.slug)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Posts grid */}
      {loading && posts.length === 0 ? (
        <div className="flex justify-center py-20"><Spin size="large" /></div>
      ) : posts.length === 0 ? (
        <Empty description="مطلبی یافت نشد" className="py-20" />
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map(post => (
              <PostCard key={post.id} post={post} basePath="/blog" />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center mt-10">
              <button
                type="button"
                className="px-8 py-3 rounded-full border border-zinc-300 text-zinc-700 hover:border-teal-500 hover:text-teal-600 transition-colors font-medium"
                onClick={() => loadPosts(false)}
                disabled={loading}
              >
                {loading ? <Spin size="small" /> : 'مطالب بیشتر'}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────
// Blog Post Page
// ──────────────────────────────────────────────────
export function BlogPostPage() {
  const { slug: paramSlug } = useParams<{ slug: string }>();
  const location = useLocation();
  const slug = paramSlug ?? location.pathname.replace(/^(?:\/tazesystem)?\/blog\//, '').split('/')[0];
  const [post, setPost] = useState<any>(null);
  const [related, setRelated] = useState<PostCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.rpc('get_cms_blog_post_by_slug', { p_slug: slug });
        if (cancelled) return;
        setPost(data);
        if (data?.categories?.[0]) {
          const { data: rel } = await supabase.rpc('get_cms_blog_posts', {
            p_limit: 3, p_offset: 0, p_category: data.categories[0].slug,
          });
          if (cancelled) return;
          setRelated((rel ?? []).filter((r: PostCard) => r.slug !== slug));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) return <div className="flex justify-center py-32"><Spin size="large" /></div>;
  if (!post) return (
    <main className="max-w-3xl mx-auto px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-zinc-900 mb-4">مطلب یافت نشد</h1>
      <Link to="/blog" className="text-teal-600 hover:underline">بازگشت به بلاگ</Link>
    </main>
  );

  const seo = buildBlogPostSeo(post);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10" dir="rtl">
      <SeoHead {...seo} />

      {/* Breadcrumb */}
      <nav className="text-sm text-zinc-400 mb-8 flex items-center gap-2">
        <Link to="/" className="hover:text-teal-600 transition-colors">خانه</Link>
        <span>/</span>
        <Link to="/blog" className="hover:text-teal-600 transition-colors">بلاگ</Link>
        {post.categories?.[0] && (
          <>
            <span>/</span>
            <Link to={`/blog/category/${post.categories[0].slug}`} className="hover:text-teal-600 transition-colors">
              {post.categories[0].name}
            </Link>
          </>
        )}
      </nav>

      {/* Cover image */}
      {post.cover_image_url && (
        <div className="rounded-3xl overflow-hidden mb-8 shadow-md">
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="w-full max-h-[420px] object-cover"
          />
        </div>
      )}

      {/* Title & meta */}
      <h1 className="text-3xl md:text-4xl font-black text-zinc-950 leading-tight mb-4">
        {post.title}
      </h1>
      <div className="flex flex-wrap items-center gap-4 text-zinc-400 text-sm mb-8 pb-8 border-b border-zinc-200">
        {post.author_name && (
          <span className="flex items-center gap-1.5 text-zinc-600">
            {post.author_avatar ? (
              <img src={post.author_avatar} alt={post.author_name} className="w-6 h-6 rounded-full" />
            ) : (
              <UserOutlined />
            )}
            {post.author_name}
          </span>
        )}
        {post.published_at && (
          <span className="flex items-center gap-1">
            <CalendarOutlined />
            {dayjs(post.published_at).format('D MMMM YYYY')}
          </span>
        )}
        {post.reading_time_minutes && (
          <span className="flex items-center gap-1">
            <ClockCircleOutlined />
            {post.reading_time_minutes} دقیقه مطالعه
          </span>
        )}
        {post.tags?.map((t: any) => (
          <Link key={t.slug} to={`/blog/tag/${t.slug}`}>
            <Tag className="cursor-pointer hover:border-teal-400 transition-colors">#{t.name}</Tag>
          </Link>
        ))}
      </div>

      {/* Content */}
      <BlockRenderer blocks={post.content_blocks ?? []} className="text-zinc-800" />

      {/* Related posts */}
      {related.length > 0 && (
        <div className="mt-16">
          <h2 className="text-xl font-bold text-zinc-900 mb-6">مطالب مرتبط</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.slice(0, 3).map(p => (
              <PostCard key={p.id} post={p} basePath="/blog" />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────
// Tutorial Index Page
// ──────────────────────────────────────────────────
export function TutorialIndexPage() {
  const [featured, setFeatured] = useState<PostCard[]>([]);
  const [posts, setPosts] = useState<PostCard[]>([]);
  const [series, setSeries] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeDifficulty, setActiveDifficulty] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.rpc('get_cms_tutorial_posts', { p_featured: true, p_limit: 5, p_offset: 0 }),
      supabase.from('cms_tutorial_series').select('id, title, slug, description, cover_image_url, is_featured').order('sort_order').limit(6),
      supabase.from('cms_categories').select('id, name, slug').in('type', ['tutorial', 'both']).order('sort_order'),
    ]).then(([featuredRes, seriesRes, catRes]) => {
      setFeatured(featuredRes.data ?? []);
      setSeries(seriesRes.data ?? []);
      setCategories(catRes.data ?? []);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    supabase.rpc('get_cms_tutorial_posts', {
      p_limit: 20, p_offset: 0,
      p_category: activeCategory === 'all' ? null : activeCategory,
      p_difficulty: activeDifficulty === 'all' ? null : activeDifficulty,
    }).then(({ data }) => {
      setPosts(data ?? []);
      setLoading(false);
    });
  }, [activeCategory, activeDifficulty]);

  const seo = buildTutorialIndexSeo();

  return (
    <main className="px-4 py-10 max-w-7xl mx-auto" dir="rtl">
      <SeoHead {...seo} />

      <div className="mb-8">
        <p className="text-teal-600 text-sm font-bold mb-1">آموزش‌های تازه سیستم</p>
        <h1 className="text-3xl md:text-4xl font-black text-zinc-950 mb-3">آموزش‌ها و راهنماها</h1>
        <p className="text-zinc-500 text-base max-w-xl">
          از صفر تا پیشرفته — هر چیزی که نیاز دارید یاد بگیرید
        </p>
      </div>

      {featured.length > 0 && (
        <div className="mb-10">
          <FeaturedSlider posts={featured} basePath="/learn" />
        </div>
      )}

      {/* Series section */}
      {series.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-bold text-zinc-900 mb-5 flex items-center gap-2">
            <FireOutlined className="text-orange-500" /> دوره‌های آموزشی
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {series.map(s => (
              <Link
                key={s.id}
                to={`/learn/series/${s.slug}`}
                className="group flex gap-4 items-center bg-white rounded-2xl border border-zinc-100 hover:border-teal-200 hover:shadow-md transition-all p-4"
              >
                {s.cover_image_url && (
                  <img src={s.cover_image_url} alt={s.title} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                )}
                <div>
                  <h3 className="font-bold text-zinc-900 text-sm group-hover:text-teal-700 transition-colors">{s.title}</h3>
                  {s.description && <p className="text-zinc-400 text-xs mt-1 line-clamp-2">{s.description}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-8">
        <div className="flex flex-wrap gap-2">
          {['all', 'beginner', 'intermediate', 'advanced', 'expert'].map(d => (
            <button
              key={d}
              type="button"
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeDifficulty === d ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
              onClick={() => setActiveDifficulty(d)}
            >
              {d === 'all' ? 'همه سطوح' : difficultyLabel[d]}
            </button>
          ))}
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeCategory === 'all' ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-700 hover:bg-teal-100'}`}
              onClick={() => setActiveCategory('all')}
            >همه</button>
            {categories.map(cat => (
              <button
                key={cat.slug}
                type="button"
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeCategory === cat.slug ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-700 hover:bg-teal-100'}`}
                onClick={() => setActiveCategory(cat.slug)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tutorials grid */}
      {loading ? (
        <div className="flex justify-center py-20"><Spin size="large" /></div>
      ) : posts.length === 0 ? (
        <Empty description="آموزشی یافت نشد" className="py-20" />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map(post => <PostCard key={post.id} post={post} basePath="/learn" />)}
        </div>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────
// Tutorial Post Page
// ──────────────────────────────────────────────────
export function TutorialPostPage() {
  const { slug: paramSlug } = useParams<{ slug: string }>();
  const location = useLocation();
  const slug = paramSlug ?? location.pathname.replace(/^(?:\/tazesystem)?\/learn\//, '').split('/')[0];
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.rpc('get_cms_tutorial_post_by_slug', { p_slug: slug });
        if (!cancelled) setPost(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) return <div className="flex justify-center py-32"><Spin size="large" /></div>;
  if (!post) return (
    <main className="max-w-3xl mx-auto px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-zinc-900 mb-4">آموزش یافت نشد</h1>
      <Link to="/learn" className="text-teal-600 hover:underline">بازگشت به آموزش‌ها</Link>
    </main>
  );

  const seo = buildTutorialPostSeo(post);
  const seriesPosts = post.series?.posts ?? [];
  const currentIndex = seriesPosts.findIndex((p: any) => p.slug === slug);
  const prevPost = currentIndex > 0 ? seriesPosts[currentIndex - 1] : null;
  const nextPost = currentIndex < seriesPosts.length - 1 ? seriesPosts[currentIndex + 1] : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10" dir="rtl">
      <SeoHead {...seo} />

      <div className="flex gap-8">
        {/* Main content */}
        <article className="flex-1 min-w-0">
          {/* Breadcrumb */}
          <nav className="text-sm text-zinc-400 mb-8 flex items-center gap-2">
            <Link to="/" className="hover:text-teal-600 transition-colors">خانه</Link>
            <span>/</span>
            <Link to="/learn" className="hover:text-teal-600 transition-colors">آموزش‌ها</Link>
            {post.series && (
              <>
                <span>/</span>
                <Link to={`/learn/series/${post.series.slug}`} className="hover:text-teal-600 transition-colors">
                  {post.series.title}
                </Link>
              </>
            )}
          </nav>

          {post.cover_image_url && (
            <div className="rounded-3xl overflow-hidden mb-8 shadow-md">
              <img src={post.cover_image_url} alt={post.title} className="w-full max-h-[360px] object-cover" />
            </div>
          )}

          {/* Title & meta */}
          <div className="mb-2 flex items-center gap-2">
            {post.difficulty_level && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${difficultyColor[post.difficulty_level]}`}>
                {difficultyLabel[post.difficulty_level]}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-black text-zinc-950 leading-tight mb-4">{post.title}</h1>

          <div className="flex flex-wrap items-center gap-4 text-zinc-400 text-sm mb-8 pb-8 border-b border-zinc-200">
            {post.author_name && (
              <span className="flex items-center gap-1.5 text-zinc-600">
                <UserOutlined />{post.author_name}
              </span>
            )}
            {post.duration_minutes && (
              <span className="flex items-center gap-1">
                <ClockCircleOutlined />{post.duration_minutes} دقیقه
              </span>
            )}
            {post.published_at && (
              <span className="flex items-center gap-1">
                <CalendarOutlined />{dayjs(post.published_at).format('D MMMM YYYY')}
              </span>
            )}
          </div>

          <BlockRenderer blocks={post.content_blocks ?? []} />

          {/* Prev/Next navigation */}
          {(prevPost || nextPost) && (
            <div className="mt-12 flex gap-4">
              {prevPost && (
                <Link
                  to={`/learn/${prevPost.slug}`}
                  className="flex-1 p-4 border border-zinc-200 rounded-2xl hover:border-teal-300 transition-colors group"
                >
                  <p className="text-xs text-zinc-400 mb-1 flex items-center gap-1"><RightOutlined />قبلی</p>
                  <p className="font-medium text-zinc-700 group-hover:text-teal-700 line-clamp-2 transition-colors">{prevPost.title}</p>
                </Link>
              )}
              {nextPost && (
                <Link
                  to={`/learn/${nextPost.slug}`}
                  className="flex-1 p-4 border border-zinc-200 rounded-2xl hover:border-teal-300 transition-colors text-left group"
                >
                  <p className="text-xs text-zinc-400 mb-1 flex items-center gap-1 justify-end"><LeftOutlined />بعدی</p>
                  <p className="font-medium text-zinc-700 group-hover:text-teal-700 line-clamp-2 transition-colors text-right">{nextPost.title}</p>
                </Link>
              )}
            </div>
          )}
        </article>

        {/* Series sidebar */}
        {post.series && seriesPosts.length > 0 && (
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-24 bg-white rounded-2xl border border-zinc-200 p-4">
              <h3 className="font-bold text-zinc-900 text-sm mb-4 pb-3 border-b border-zinc-100">
                {post.series.title}
              </h3>
              <ul className="space-y-1">
                {seriesPosts.map((p: any, i: number) => (
                  <li key={p.id}>
                    <Link
                      to={`/learn/${p.slug}`}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${p.slug === slug ? 'bg-teal-50 text-teal-700 font-medium' : 'text-zinc-600 hover:bg-zinc-50'}`}
                    >
                      <span className={`w-6 h-6 flex-shrink-0 rounded-full text-xs font-bold flex items-center justify-center ${p.slug === slug ? 'bg-teal-500 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                        {i + 1}
                      </span>
                      <span className="line-clamp-2">{p.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
