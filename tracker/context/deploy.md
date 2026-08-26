# Deploy

Everything needed to put this shop in front of customers, and the reasoning
behind the parts that are not obvious. Task 17's scope.

## Vercel project

Already linked (`.vercel/project.json`): project `papeterie`. The code lives at
`mohamed-abdelahi-haibelty/TFT`.

> **A push to `master` does not deploy.** This file previously said it did; it
> is not true and was caught by pushing and watching nothing happen. The Vercel
> project has **no Git repository connected** (`vercel project inspect papeterie`
> shows no Git section), so every deployment to date has been a CLI upload from
> a working tree. Production is released with:
>
> ```
> npx vercel --prod
> ```
>
> Two consequences worth holding on to. **What deploys is the working tree, not
> the commit** — so commit and push first, then deploy, or the live site and
> `master` silently disagree. And **CI cannot gate a release**, because there is
> no build triggered by the repository at all; `tsc`, `eslint`, `npm test` and
> `next build` passing locally is the only gate that exists. Connecting the
> repo in Vercel → Settings → Git would fix both and is worth doing.

### Region — do not change this casually

`vercel.json` pins:

```json
{ "regions": ["fra1"] }
```

This is load-bearing, not a preference. The database is a Neon instance in
`eu-central-1` (Frankfurt), and the app talks to it over `@neondatabase/serverless`'s
**HTTP** driver, where every single query is its own HTTPS round trip. On
Vercel's default `iad1` (Washington DC) that is roughly 90 ms each way, per
query — a cold page render paid ~600 ms of pure network before doing anything,
and an admin product save well over a second.

`fra1` puts the function in the same region as the database, which takes the
per-query cost to low single-digit milliseconds. It is also considerably closer
to a Mauritanian audience than the US east coast.

**If the Neon project is ever moved to another region, this must move with it.**
A mismatch here costs more than every other optimisation in the app combined.

## Environment variables

Source of truth is `.env.example` — it carries the per-variable explanations
and is kept current. Set them in **Vercel → Settings → Environment Variables**.

Required in production:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon pooled connection string. See the branch strategy below. |
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32`. Different per environment. |
| `BETTER_AUTH_URL` | The deployed origin, e.g. `https://theFirstTrade.mr`. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Public/client-safe. |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Server-only. Sign uploads and deletes. |
| `NEXT_PUBLIC_SITE_URL` | Drives canonical URLs, OpenGraph and `sitemap.xml`. **Optional now**: unset, `siteOrigin()` falls back to `https://$VERCEL_PROJECT_PRODUCTION_URL` (Vercel injects that itself), so a deploy without it emits real indexable URLs rather than `localhost`. Set it the day a custom domain exists — it wins over the fallback, and a wrong value here is still wrong absolute URLs in search results. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Digits only, no `+`. `222XXXXXXXX`. Concatenated straight into `wa.me/<number>`. |

Optional (everything degrades gracefully when unset):
`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (build-time source-map upload,
production only), `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_POSTHOG_KEY`,
`NEXT_PUBLIC_POSTHOG_HOST`.

`SENTRY_ORG` and `SENTRY_PROJECT` are only optional in the sense that the build
still succeeds without them — **source-map upload fails silently when they are
missing**, and the symptom appears much later as minified frames in every
production stack trace. Set all four together or none of them.

### Observability is gated on `VERCEL_ENV=production`

Sentry and PostHog initialize only on production deploys (`src/lib/observability/config.ts`,
inlined from `next.config.ts`). Preview deploys and local dev are fully inert
even with valid keys present. That is deliberate: the Vitest suite runs against
a real database and previews get pushed freely, and both would otherwise spend
the same free-tier budget that exists to report real customer-facing failures.

Consequence worth knowing before debugging: **you cannot verify a DSN from a
preview deploy.** Verification has to happen against production, or by
temporarily setting `NEXT_PUBLIC_OBSERVABILITY_ENV=production` in a preview.

### Release identity

Sentry associates uploaded source maps with a release name, and the SDK stamps
the same name on events at runtime. Both come from `SENTRY_RELEASE` in
`next.config.ts`, which reads `VERCEL_DEPLOYMENT_ID`.

It deliberately does **not** rely on `VERCEL_GIT_COMMIT_SHA`, which is what
Sentry would infer by default: this project has no Git repository connected to
Vercel (see the note under "Vercel project" above), so that variable is
empty on every deploy and the maps would attach to no release at all.

### Free-tier guards that live in the dashboards, not the repo

Nothing in this codebase can stop a runaway error loop from spending a month of
quota overnight. These are configured once, per provider:

- **Sentry** — set a spend cap, and a per-key rate limit on the client key.
  The free tier is ~5k errors/month; one misbehaving component in a render loop
  can exceed that in an hour.
- **PostHog** — turn on bot filtering (the storefront is crawled), and set a
  volume alert well below the 1M events/month free tier.

The two things the code already refuses to do for the same reason, and which
should stay refused: no Sentry `tunnelRoute`, and no PostHog reverse-proxy
rewrite. Both would route every event through a Vercel function, and for the
storefront through `proxy.ts` as well — paying Vercel invocations to send
telemetry that goes directly to the vendor today.

Never set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in production beyond the
first-deploy seed described below, and rotate the password immediately after.

## Neon branch strategy

Intended: **`main` = production, `dev` = local and preview.**

> **This is currently not true and it has already caused damage.** Production
> reads the `dev` branch, which is the same branch the Vitest suite writes to —
> and these are real integration tests against a live database. A failed
> cleanup once left six `isActive: true` test products on the live customer
> catalog and in `sitemap.xml`. Splitting the branches is the fix; until it is
> done, treat every local `npm test` as a write against production data.

### Running migrations against production

1. Take a Neon branch/snapshot of `main` first — this is the rollback.
2. Point `DATABASE_URL` at production and run `npm run db:migrate`.
3. Migrations here are Drizzle-generated and forward-only; there is no `down`.
   Review the generated SQL before applying, especially anything that is not a
   plain `CREATE INDEX` / `ADD COLUMN`.
4. Deploy the code **after** the migration, so the schema is never behind the
   code that expects it.

### First deploy: seeding the admin

`npm run db:seed` is idempotent (admin + 3 categories + 6 products + 1 bundle).
For a real launch, run it once with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
set to the owner's real credentials, confirm sign-in at `/ar/admin/login`, then
clear those variables.

## Cloudflare

DNS proxied (orange cloud) in front of the Vercel domain.

**Cache rules**
- `/_next/static/*` — cache everything, long TTL. Content-hashed, safe to cache
  indefinitely.
- Cloudinary is a CDN in its own right; images are served from
  `res.cloudinary.com` and do not pass through here.
- Do **not** blanket-cache HTML. The storefront is Partial Prerendering: pages
  are a static shell plus streamed content, and Vercel already handles that
  caching with the correct revalidation. An edge rule that caches HTML wholesale
  will serve stale prices past a promotion's `ends_at`.

**Rate limiting** — the in-memory limiter in `src/lib/rate-limit.ts` is
per-lambda-instance by its own admission: a courtesy floor that resets on cold
start and is not shared across concurrent instances. The real guarantee has to
live at the edge:
- `POST /api/orders` — cap per IP per minute.
- Admin sign-in — same. It previously had no limiting at all.
- Order tracking lookup — a code plus a phone number is the only credential an
  order has; rate-limit it so it cannot be enumerated.

Storefront **reads** deliberately have no rate limit and need none: since the
catalog-snapshot change no storefront URL a bot can invent reaches the database,
so the worst a crawler costs is Vercel function time. The three above are the
ones that still touch Postgres on demand.

**Bot fight mode** on.

## Caching model (what a deploy actually invalidates)

The app runs with `cacheComponents: true` and `partialPrefetching: true`. Two
consequences worth knowing before debugging a "why is this stale" report:

- Storefront reads are `use cache` with the `storefront` profile — a **15-minute**
  revalidate (`STOREFRONT_REVALIDATE_SECONDS`, mirrored in `next.config.ts`).
  That number is a Neon Free-plan budget, not a freshness preference: the plan
  meters wall-clock time the compute is *awake*, scale-to-zero is fixed at five
  minutes, so any query costs a five-minute minimum — and at the old 60s one
  visitor per minute was enough to hold the database awake around the clock.
- What that window does and does not bound:
  - Admin **saves** are not subject to it — every content mutation calls
    `revalidateTag(..., "max")` and lands immediately.
  - A promotion **ending** is handled client-side (`promo-countdown.tsx` ticks
    the clock and falls back to `postPromoPrice`), so a stale entry cannot keep
    quoting a dead discount.
  - A promotion **starting** is the one genuinely clock-driven lag: a scheduled
    promo becomes visible up to 15 minutes late.
  - **Stock is deliberately allowed to lag.** POS sales and order transitions no
    longer revalidate the storefront's `products`/`bundles` tags — doing so
    destroyed the whole public cache on every counter sale, so the storefront
    was never warm during business hours. Nothing oversells: `createOrderCore`
    re-checks availability against the live row before accepting an order, so a
    stale "in stock" costs one rejected submit and nothing worse.
- The whole browse surface (home, catalog, every category, every search, every
  sort, both locales) is served from **two** cached snapshots filtered in memory
  by `src/lib/catalog-filter.ts`, so a crafted `?q=` no longer reaches Postgres
  at all. Measured on a production build: 10 never-seen search URLs cost 30
  queries before, 0 after.
- Cache keys include the build ID, so **every deploy is a full cache flush**.
  The first request to each route after a deploy repopulates it. On the Free
  plan that is not nothing — it is one warm-up fill per route — so avoid
  redeploying repeatedly just to watch something change.

> `next dev` does **not** reuse `use cache` entries; every page load re-queries.
> Any measurement of caching behaviour has to be taken against
> `next build && next start`, never the dev server.

## Verifying a deploy

```
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' https://<domain>/ar
```

Then, in order:

1. `/ar` and `/fr` render with real products and images.
2. `/ar/catalog`, a category page, a product page, `/ar/boxes` and a box page.
3. Sort and filter on `/ar/catalog` — it is a plain GET form and must work
   before any JavaScript loads.
4. Add to cart → `/ar/checkout` → place an order → confirm the WhatsApp handoff
   opens with the right number.
5. `/ar/admin/login` with the seeded admin; confirm the dashboard reads real
   data.
6. Move that test order through confirmed → shipped → delivered, then check it
   at `/ar/track`.
7. `sitemap.xml` and `robots.txt` carry the real domain, and no test fixture
   products appear in the sitemap.

## Known gaps

Carried from `progress-tracker.md`, all still open at the time of writing:

- Lighthouse mobile scores (Perf ≥ 90 / A11y ≥ 95 / SEO ≥ 95) have never been
  measured — no usable Chromium in the development environment. Needs a real
  browser pass.
- No visual verification of layout, RTL behaviour, or the image placeholder
  shimmer, for the same reason.
- Neon branch split (above) — **re-confirmed still open and still leaking**: the
  live `sitemap.xml` currently carries 24 `dash-test-*` URLs from the Vitest
  suite. Note the one upside while it lasts: production and local share a
  branch, so `npm run db:migrate` run locally *is* the production migration.
  That stops being true the moment the branches are split, and step 2 of
  "Running migrations against production" above becomes mandatory again.
- `pencil.jpg` is Wikimedia Commons CC BY 3.0 and legally needs an attribution
  credit in the UI before a real launch.
- Admin/POS first-load JS is ~1.1 MB; a `react-day-picker` + `date-fns` chunk of
  ~100 KB is loaded on routes that mostly do not use a date filter and belongs
  behind a dynamic import.
