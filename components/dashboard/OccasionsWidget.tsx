import React, { useEffect, useMemo, useState } from 'react';
import { DownOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import {
  getHolidaySummaryForDate,
  getOccasionCategoryLabel,
  getUpcomingHolidaySummaries,
  hasAnyOccasionCategory,
  type HolidayDaySummary,
  type OccasionCategory,
} from '../../utils/holidayCalendar';

const OCCASION_CATEGORY_ORDER: OccasionCategory[] = ['national', 'religious', 'global'];

const toggleClass = (active: boolean) =>
  active
    ? 'border-leather-500 bg-leather-50 text-leather-700 dark:border-leather-400 dark:bg-leather-500/10 dark:text-leather-100'
    : 'border-gray-200 bg-white/70 text-gray-500 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300';

const renderOccasionGroup = (summary: HolidayDaySummary) =>
  OCCASION_CATEGORY_ORDER.map((category) => {
    const items = summary.categories[category] || [];
    if (items.length === 0) return null;

    return (
      <div key={category} className="space-y-1">
        <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
          {getOccasionCategoryLabel(category)}
        </div>
        <div className="space-y-1">
          {items.map((item) => (
            <div key={`${category}-${item.title}`} className="text-xs leading-5 text-gray-700 dark:text-gray-200">
              {item.title}
            </div>
          ))}
        </div>
      </div>
    );
  });

const OccasionsWidget: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [todayOpen, setTodayOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [todaySummary, setTodaySummary] = useState<HolidayDaySummary | null>(null);
  const [upcomingSummaries, setUpcomingSummaries] = useState<HolidayDaySummary[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadOccasions = async () => {
      setLoading(true);
      try {
        const [today, upcoming] = await Promise.all([
          getHolidaySummaryForDate(new Date()),
          getUpcomingHolidaySummaries(21),
        ]);

        if (!isMounted) return;
        setTodaySummary(today);
        setUpcomingSummaries(upcoming);
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    };

    void loadOccasions();

    return () => {
      isMounted = false;
    };
  }, []);

  const hasTodayOccasions = useMemo(() => hasAnyOccasionCategory(todaySummary), [todaySummary]);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">مناسبت‌ها</span>
        <button
          type="button"
          onClick={() => setTodayOpen((current) => !current)}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition ${toggleClass(todayOpen)}`}
        >
          <span>مناسبت‌های امروز</span>
          <DownOutlined className={`text-[9px] transition-transform ${todayOpen ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => setUpcomingOpen((current) => !current)}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition ${toggleClass(upcomingOpen)}`}
        >
          <span>مناسبت‌های پیش‌رو</span>
          <DownOutlined className={`text-[9px] transition-transform ${upcomingOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Spin size="small" />
          <span>در حال بارگذاری مناسبت‌ها...</span>
        </div>
      ) : null}

      {!loading && todayOpen ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-white/5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">
              {todaySummary?.jalaliLabel || 'امروز'}
            </span>
            {todaySummary?.isOfficialHoliday ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:bg-rose-500/15 dark:text-rose-200">
                تعطیل رسمی
              </span>
            ) : null}
          </div>
          {hasTodayOccasions && todaySummary ? (
            <div className="space-y-2">{renderOccasionGroup(todaySummary)}</div>
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400">برای امروز مناسبتی ثبت نشده است.</div>
          )}
        </div>
      ) : null}

      {!loading && upcomingOpen ? (
        <div className="rounded-2xl border border-gray-200 bg-white/70 p-3 dark:border-gray-700 dark:bg-white/5">
          {upcomingSummaries.length > 0 ? (
            <div className="space-y-3">
              {upcomingSummaries.slice(0, 6).map((summary) => (
                <div key={summary.dateKey} className="border-b border-gray-100 pb-3 last:border-b-0 last:pb-0 dark:border-gray-800">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">
                      {summary.jalaliLabel}
                    </span>
                    {summary.isOfficialHoliday ? (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:bg-rose-500/15 dark:text-rose-200">
                        تعطیل
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-2">{renderOccasionGroup(summary)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400">مناسبت پیش‌رویی برای نمایش پیدا نشد.</div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default OccasionsWidget;
