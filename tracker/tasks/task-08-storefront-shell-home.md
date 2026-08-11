# Task 08 — Storefront Shell + Home

## Goal
Public site shell (nav, footer, locale switch) and home page, statically cached.

## Depends on
Task 07 (needs products + bundles to display).

## Scope
- `(store)` layout: header (store name, nav to catalog/boxes/track order, cart entry point placeholder, locale switch), footer (WhatsApp contact link, locations note). Fully RTL-correct in Arabic.
- Home: featured active products (most recent N), bundles section, category links. All data via cached tagged queries.
- SEO: root metadata (bilingual title/description), OpenGraph, `robots.txt`, `sitemap.xml` (home, catalog, categories, product + bundle pages), canonical URLs from `NEXT_PUBLIC_SITE_URL`, `lang`/`dir` correct per locale, JSON-LD `Store` on home.
- Performance: no client JS beyond the locale switch and nav toggle; images lazy below the fold with correct sizes.

## Done when
- [ ] Home renders in ar (RTL) and fr with real seeded data, served from cache (verify: DB not hit on repeat request in dev logs).
- [ ] `sitemap.xml` lists product/bundle URLs for both locales.
- [ ] Lighthouse mobile on home: Perf ≥ 90, A11y ≥ 95, SEO ≥ 95.
- [ ] Build + tests pass.
