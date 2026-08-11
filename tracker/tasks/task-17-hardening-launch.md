# Task 17 — Hardening + Launch Pass

## Goal
Production-ready: performance, accessibility, SEO verified; caching and protections in place; deploy documented.

## Depends on
Task 16.

## Scope
- Caching audit: every storefront read cached + tagged; every admin mutation revalidates the right tags; verify no accidental dynamic rendering on store pages.
- Rate limiting confirmed on `/api/orders` and tracking lookup; document the Cloudflare setup (DNS proxied, cache rules for `/_next/static` + Cloudinary, rate-limit rule on `/api/orders`, bot fight mode) in `context/deploy.md` (create it).
- `context/deploy.md` also covers: Vercel project setup, env vars per environment (from `env.example`), Neon branch strategy (main = prod, `dev` branch = local/dev), running migrations against prod safely, first-deploy seed of the admin user.
- Accessibility sweep of storefront + POS + order forms per `code-standards.md` → Accessibility (keyboard, labels, aria-live on async results, contrast via tokens).
- SEO sweep: metadata + JSON-LD validity, sitemap correctness, 404s for inactive content, redirect bare `/` to default locale.
- Performance sweep: bundle check (no heavy client deps on store routes), image sizes, font loading. Fix regressions until targets met.
- Security sweep: all admin services role-checked (grep-verify none bypass `requireUser`), no secret in client bundles, tracking endpoint leak-free.

## Done when
- [ ] Lighthouse mobile home/catalog/product: Perf ≥ 90, A11y ≥ 95, SEO ≥ 95.
- [ ] Documented deploy executed: production URL serving over Cloudflare, seeded admin can log in, a real test order flows web → WhatsApp → confirmed → shipped → delivered.
- [ ] `progress-tracker.md` phase set to Complete with launch notes.
- [ ] Build + all tests pass.
