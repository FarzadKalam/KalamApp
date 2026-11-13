---
name: spa-react-vite-seo
description: Enforces technical SEO, pre-rendering, meta tag hydration, and PWA crawler compatibility in React + Vite applications.
---

# Single Page Application (React + Vite + PWA) SEO Skill

## Purpose
Ensure every route in a React Single Page Application (SPA) is crawlable by search engines and social scrapers, renders semantic HTML, hydrates dynamic meta tags without flickering, and delivers valid Open Graph tags without relying on client-side JavaScript execution.

## Instructions & Core Requirements

### 1. Head & Meta Tags Management
- Always use `react-helmet-async` (or `@unhead/react`) for page-level meta tags.
- Every public route MUST specify:
  - `<title>`: Descriptive, unique, max 60 characters. Format: `{Page Title} | {Brand Name}`.
  - `<meta name="description">`: 120-155 characters summarizing page content.
  - `<link rel="canonical" href="{Full Absolute URL}">`: Strictly absolute URL without trailing slash mismatches or hash routing.
  - `<meta name="robots" content="index, follow">` (or `noindex, nofollow` for private/auth/tenant routes).

### 2. Social Sharing / Open Graph (No-JS Crawlers)
- Social platforms (Telegram, Twitter/X, WhatsApp, LinkedIn) do NOT execute client-side JavaScript.
- Provide full Open Graph and Twitter Card tags in pre-rendered HTML:
  - `og:type`: 'website' or 'article'
  - `og:title`, `og:description`, `og:url`
  - `og:image`: Strictly absolute HTTPS URL (recommended 1200x630px, < 300KB)
  - `twitter:card`: 'summary_large_image'

### 3. PWA Service Worker Configuration
- In Workbox navigation route caching (`sw.js` / `vite-plugin-pwa`):
  - NEVER use `CacheFirst` for HTML navigational requests (`/`).
  - Use `NetworkFirst` or `StaleWhileRevalidate` with background update checks.
  - Always serve `index.html`, `sw.js`, and `version.json` with `Cache-Control: no-cache, no-store, must-revalidate`.

### 4. Semantic DOM & Routing
- Never use `createHashRouter` for public routes; always use `createBrowserRouter` (HTML5 History API).
- Navigation links must use `<Link to="...">` or `<a href="...">` rather than click handlers (`onClick={() => navigate(...)}`) so crawlers can discover child URLs.
