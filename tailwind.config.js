/** @type {import('tailwindcss').Config} */
const withOpacity = (cssVariable) => `rgb(var(${cssVariable}) / <alpha-value>)`;

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
          50: withOpacity('--brand-50-rgb'),
          100: withOpacity('--brand-100-rgb'),
          200: withOpacity('--brand-200-rgb'),
          300: withOpacity('--brand-300-rgb'),
          400: withOpacity('--brand-400-rgb'),
          500: withOpacity('--brand-500-rgb'),
          600: withOpacity('--brand-600-rgb'),
          700: withOpacity('--brand-700-rgb'),
          800: withOpacity('--brand-800-rgb'),
          900: withOpacity('--brand-900-rgb'),
        },
        accent: {
          pink: withOpacity('--brand-accent-pink-rgb'),
        },
        dark: {
          bg: withOpacity('--app-dark-bg-rgb'),
          surface: withOpacity('--app-dark-surface-rgb'),
          border: withOpacity('--app-dark-border-rgb'),
        }
      },
      fontFamily: {
        sans: ['Vazirmatn', 'ui-sans-serif', 'system-ui'],
      }
    },
  },
  plugins: [],
}
