import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';

const NIGHT_START_HOUR = 19;
const NIGHT_END_HOUR = 6;

/**
 * صفحات عمومی بر اساس ساعت محلی همان دستگاه انتخاب می‌شوند، نه تنظیمات پنل
 * سازمان یا حالت سیستم‌عامل. هر بازدید تازه با زمان فعلی کاربر آغاز می‌شود.
 */
export const isPublicNightMode = (date = new Date()) => {
  const hour = date.getHours();
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
};

export const usePublicTimeTheme = () => {
  const [isDark, setIsDark] = useState(isPublicNightMode);

  useEffect(() => {
    const sync = () => setIsDark(isPublicNightMode());
    sync();
    const intervalId = window.setInterval(sync, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return isDark;
};

export const PublicThemeBoundary = ({ children }: { children: ReactNode }) => {
  const isDark = usePublicTimeTheme();
  const originalDarkMode = useRef<boolean | null>(null);

  useEffect(() => {
    if (originalDarkMode.current === null) {
      originalDarkMode.current = document.documentElement.classList.contains('dark');
    }
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => () => {
    if (originalDarkMode.current !== null) {
      document.documentElement.classList.toggle('dark', originalDarkMode.current);
    }
  }, []);

  return (
    <ConfigProvider
      direction="rtl"
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { fontFamily: 'Peyda, Tahoma, Arial, sans-serif' },
      }}
    >
      <div className={isDark ? 'dark' : ''}>{children}</div>
    </ConfigProvider>
  );
};
