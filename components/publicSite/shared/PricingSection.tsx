import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftOutlined, CheckCircleOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { supabase } from '../../../supabaseClient';
import { sitePath, DEMO_URL } from '../siteLinks';
import { SectionHeading } from '../primitives';

type PublicPlan = {
  id: string;
  code: string | null;
  title: string;
  short_description: string | null;
  price_monthly: number;
  price_yearly: number | null;
  included_users: number;
  extra_user_price: number;
  max_users: number | null;
  storage_gb: number | null;
  highlight_tag: string | null;
  custom_price_label: string | null;
  display_features: Array<string | { text: string; featured?: boolean | null }>;
  trial_days: number;
};

type PublicPlanFeature = { text: string; featured: boolean };

const parsePublicPlanFeatures = (raw: PublicPlan['display_features']): PublicPlanFeature[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (typeof item === 'string') return { text: item.trim(), featured: index < 6 };
      return { text: String(item?.text ?? '').trim(), featured: Boolean(item?.featured) };
    })
    .filter((item) => item.text);
};

const usePricingPlans = () => {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.rpc('get_public_plans');
        if (Array.isArray(data) && data.length > 0) setPlans(data as PublicPlan[]);
      } catch {
        /* fallback: بدون پلن */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);
  return { plans, loaded };
};

const formatPriceFA = (n: number) => Math.round(n).toLocaleString('fa-IR', { maximumFractionDigits: 0 });

export const PricingSection: React.FC<{
  detailed?: boolean;
  eyebrow?: string;
  title?: string;
  text?: string;
}> = ({
  detailed = false,
  eyebrow = 'تعرفه‌ها',
  title = 'پلنی انتخاب کنید که با تیم شما رشد کند',
  text = 'مدل قیمت‌گذاری تازه سیستم ترکیبی از هزینه پایه پکیج و کاربر اضافه است تا رشد تیم قابل پیش‌بینی بماند.',
}) => {
  const { plans, loaded } = usePricingPlans();
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(() => new Set());

  const togglePlanFeatures = (planId: string) => {
    setExpandedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  return (
    <section className="bg-white px-5 py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow={eyebrow} title={title} text={text} />

        {!loaded ? (
          <div className="grid gap-5 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100" />
            ))}
          </div>
        ) : (
          <div className={`grid gap-5 ${plans.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
            {plans.map((plan) => {
              const highlighted = !!plan.highlight_tag;
              const normalizedFeatures = parsePublicPlanFeatures(plan.display_features);
              const primaryFeatures = normalizedFeatures.filter((item) => item.featured);
              const extraFeatures = normalizedFeatures.filter((item) => !item.featured);
              const expanded = expandedPlanIds.has(plan.id);
              const features = expanded ? [...primaryFeatures, ...extraFeatures] : primaryFeatures;
              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border p-6 transition ${highlighted ? 'scale-[1.02] border-zinc-950 bg-zinc-950 text-white shadow-xl' : 'border-zinc-200 bg-white text-zinc-950 hover:border-zinc-400'}`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black">{plan.title}</h3>
                    {plan.highlight_tag && (
                      <span className="rounded-lg px-3 py-1 text-xs font-black text-zinc-950" style={{ background: 'rgb(var(--brand-300-rgb))' }}>
                        {plan.highlight_tag}
                      </span>
                    )}
                  </div>
                  <p className={`mt-3 text-sm leading-7 ${highlighted ? 'text-zinc-200' : 'text-zinc-600'}`}>{plan.short_description}</p>

                  <div className="mt-6">
                    {plan.custom_price_label ? (
                      <span className="text-2xl font-black">{plan.custom_price_label}</span>
                    ) : (
                      <>
                        <span className="text-4xl font-black">{formatPriceFA(plan.price_monthly)}</span>
                        <span className={`mr-2 text-sm ${highlighted ? 'text-zinc-300' : 'text-zinc-500'}`}>تومان / ماه</span>
                      </>
                    )}
                  </div>

                  <div className={`mt-3 text-sm font-bold ${highlighted ? 'text-zinc-200' : 'text-zinc-700'}`}>{plan.included_users} کاربر شامل</div>
                  {plan.extra_user_price > 0 && (
                    <div className={`mt-1 text-xs ${highlighted ? 'text-zinc-300' : 'text-zinc-500'}`}>کاربر اضافه: {formatPriceFA(plan.extra_user_price)} تومان</div>
                  )}
                  {plan.storage_gb && (
                    <div className={`mt-1 text-xs ${highlighted ? 'text-zinc-300' : 'text-zinc-500'}`}>{plan.storage_gb}GB فضای ذخیره‌سازی</div>
                  )}
                  {plan.trial_days > 0 && (
                    <div className={`mt-1 text-xs font-bold ${highlighted ? '' : ''}`} style={{ color: highlighted ? 'rgb(var(--brand-300-rgb))' : 'rgb(var(--brand-600-rgb))' }}>{plan.trial_days} روز آزمایشی رایگان</div>
                  )}

                  {features.length > 0 && (
                    <ul className="mt-6 space-y-3">
                      {features.map((item, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-sm">
                          <CheckCircleOutlined style={{ color: highlighted ? 'rgb(var(--brand-300-rgb))' : 'rgb(var(--brand-600-rgb))' }} />
                          <span>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {extraFeatures.length > 0 && (
                    <button
                      type="button"
                      onClick={() => togglePlanFeatures(plan.id)}
                      className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black transition ${highlighted ? 'border-white/20 text-white hover:bg-white/10' : 'border-zinc-200 text-zinc-800 hover:border-zinc-950 hover:bg-zinc-50'}`}
                      aria-expanded={expanded}
                    >
                      {expanded ? 'مشاهده کمتر' : `مشاهده ${extraFeatures.length.toLocaleString('fa-IR')} ویژگی دیگر`}
                      {expanded ? <UpOutlined /> : <DownOutlined />}
                    </button>
                  )}

                  <a
                    href={DEMO_URL}
                    className={`mt-7 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-black ${highlighted ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-zinc-950 text-white hover:bg-zinc-800'}`}
                  >
                    شروع رایگان
                  </a>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 lg:flex lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-black text-zinc-950">نسخه لوکال کامل</h3>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-600">
              نصب روی سرور سازمان شما، همه ماژول‌ها، کنترل کامل داده، قرارداد اختصاصی و پشتیبانی سالانه. قیمت پیشنهادی از ۲۹۰ میلیون تومان شروع می‌شود.
            </p>
          </div>
          <a href={DEMO_URL} className="mt-5 inline-flex rounded-xl border border-zinc-950 px-5 py-3 text-sm font-black text-zinc-950 hover:bg-zinc-950 hover:text-white lg:mt-0">
            مشاوره نسخه لوکال
          </a>
        </div>
        <p className="mt-5 text-center text-sm leading-7 text-zinc-500">
          هزینه پیامک، VoIP، مصرف AI مازاد، فضای اضافه، مهاجرت داده و توسعه اختصاصی جداگانه محاسبه می‌شود.
        </p>
        {!detailed && (
          <div className="mt-6 text-center">
            <Link to={sitePath('/pricing')} className="inline-flex items-center gap-2 text-sm font-black text-zinc-950">
              مقایسه کامل پلن‌ها <ArrowLeftOutlined />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default PricingSection;
