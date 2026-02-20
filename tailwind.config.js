/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",          // فایل‌های روت مثل App.tsx
    "./components/**/*.{js,ts,jsx,tsx}", // پوشه کامپوننت‌ها
    "./pages/**/*.{js,ts,jsx,tsx}",      // پوشه صفحات
    "./src/**/*.{js,ts,jsx,tsx}"         // محض احتیاط اگر پوشه src هم بود
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        leather: {
          500: '#c58f60',
          600: '#a67c52',
          800: '#5d4037',
        },
        dark: {
          bg: '#141414',
          surface: '#1f1f1f',
          border: '#303030',
        }
      },
      fontFamily: {
        sans: ['Vazirmatn', 'ui-sans-serif', 'system-ui'],
      }
    },
  },
  plugins: [],
}