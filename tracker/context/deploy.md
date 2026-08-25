# Deploy

Everything needed to put this shop in front of customers, and the reasoning
behind the parts that are not obvious. Task 17's scope.

## Vercel project

Already linked (`.vercel/project.json`): project `papeterie`, GitHub remote
`mohamed-abdelahi-haibelty/TFT`. A push to `master` deploys to production.

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
| `NEXT_PUBLIC_SITE_URL` | Drives canonical URLs, OpenGraph and `sitemap.xml`. Wrong or unset here means wrong absolute URLs in search results. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Digits only, no `+`. `222XXXXXXXX`. Concatenated straight into `wa.me/<number>`. |

Optional (everything degrades gracefully when unset):
`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (build-time source-map upload,
production only), `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.

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

**Bot fight mode** on.

## Caching model (what a deploy actually invalidates)

The app runs with `cacheComponents: true` and `partialPrefetching: true`. Two
consequences worth knowing before debugging a "why is this stale" report:

- Storefront reads are `use cache` with the `storefront` profile — a 60-second
  revalidate. That window is the only thing bounding how long a price may lag
  the promotion calendar, because `getEffectivePrices` dates the promotion
  window in SQL (`now()`) rather than reading a JS clock. Admin mutations call
  `revalidateTag(...)`, so a *save* propagates immediately; a promotion simply
  *starting* or *ending* takes up to 60 seconds.
- Cache keys include the build ID, so **every deploy is a full cache flush**.
  The first request to each route after a deploy repopulates it.

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
- Neon branch split (above).
- `pencil.jpg` is Wikimedia Commons CC BY 3.0 and legally needs an attribution
  credit in the UI before a real launch.
- Admin/POS first-load JS is ~1.1 MB; a `react-day-picker` + `date-fns` chunk of
  ~100 KB is loaded on routes that mostly do not use a date filter and belongs
  behind a dynamic import.
