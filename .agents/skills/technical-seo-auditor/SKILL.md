---
name: technical-seo-auditor
description: Audits web pages for Core Web Vitals, heading hierarchy, robots.txt, sitemaps, Open Graph, and search engine indexability.
---

# Technical SEO Auditor Skill

## Purpose
Perform systematic pre-release audits on public-facing routes to ensure strict compliance with search engine guidelines, performance budgets, and crawler access.

## Audit Checklist

### 1. Crawlability & Indexability
- [ ] `robots.txt` exists at `/robots.txt` and points to valid `sitemap.xml`.
- [ ] Private routes (`/app/*`, `/taze-system/*`, tenant subdomains) are strictly `noindex` or disallowed.
- [ ] Public routes return clean HTTP 200 with proper canonical link to `https://tazesystem.ir/`.
- [ ] Non-existent routes return HTTP 404 (not a soft 200 with blank content).

### 2. Semantic Heading Structure
- [ ] Exactly one `<h1>` per page reflecting the primary topic / brand name.
- [ ] Heading hierarchy follows sequential order: `<h1>` -> `<h2>` -> `<h3>` without skipping levels.

### 3. Asset & Media SEO
- [ ] Every `<img>` tag has a descriptive Persian `alt` attribute.
- [ ] Images have explicit `width` and `height` (or CSS `aspect-ratio`) to prevent Cumulative Layout Shift (CLS).
- [ ] Media assets use modern compressed formats (`.webp`, `.avif`, `.svg`).

### 4. Core Web Vitals (CWV)
- [ ] **LCP** (Largest Contentful Paint) < 2.5s: Hero image/text preloaded, critical CSS inlined.
- [ ] **INP** (Interaction to Next Paint) < 200ms: Smooth interactions without heavy main-thread blocking.
- [ ] **CLS** (Cumulative Layout Shift) < 0.1: Reserved aspect-ratios for banners and web fonts swapped cleanly.
