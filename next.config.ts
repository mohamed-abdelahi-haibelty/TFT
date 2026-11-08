import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Mirrors `STOREFRONT_REVALIDATE_SECONDS` in src/services/storefront.ts, which
// is the prose explanation of why this number is what it is. Kept literal here
// because next.config.ts is loaded before path aliases resolve.
const STOREFRONT_REVALIDATE_SECONDS = 900;

// Sentry and PostHog are live on production deploys only. Preview deploys and
// local dev stay inert, which is what keeps the Vitest suite (it runs against a
// real database) and every preview push out of a 5,000-errors-a-month budget.
const OBSERVABILITY_ENV = process.env.VERCEL_ENV ?? "development";

// The release Sentry associates uploaded source maps with, and the one the SDK
// stamps on events at runtime. It has to be the same string in both places or
// the maps never apply, which is why it is minted here and handed to both.
//
// Sentry would normally infer this from VERCEL_GIT_COMMIT_SHA. That is empty on
// this project: the Vercel project has no Git repository connected and every
// deploy is a CLI upload from a working tree .
// VERCEL_DEPLOYMENT_ID is the identifier that does exist for those.
const SENTRY_RELEASE =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";

const nextConfig: NextConfig = {
  // Inlined at build time so both runtimes read identical values. Client code
  // cannot read VERCEL_ENV or VERCEL_DEPLOYMENT_ID directly — Next inlines
  // nothing but NEXT_PUBLIC_* into the browser bundle, so reading them there
  // yields undefined and silently disables the browser SDK in production.
  env: {
    NEXT_PUBLIC_OBSERVABILITY_ENV: OBSERVABILITY_ENV,
    NEXT_PUBLIC_SENTRY_RELEASE: SENTRY_RELEASE,
  },

  // Data is dynamic by default; `use cache` opts each read in explicitly, and
  // every route ships a prerendered static shell that streams the rest.
  cacheComponents: true,

  // The catalog grid renders up to `CATALOG_MAX_RESULTS` links into
  // /product/[slug]. Without this that is one prefetch per visible link; with
  // it, one reusable App Shell for the whole route.
  partialPrefetching: true,

  cacheLife: {
    // The storefront's promo-sensitive reads. `revalidate` is the only thing
    // bounding how long a price may lag the promotion calendar now that
    // `getEffectivePrices` dates its window in SQL — see storefront.ts.
    storefront: {
      stale: STOREFRONT_REVALIDATE_SECONDS,
      revalidate: STOREFRONT_REVALIDATE_SECONDS,
      expire: 3600,
    },
  },

  images: {
    loader: "custom",
    loaderFile: "./src/lib/cloudinary-image-loader.ts",
    // Every width here is one some real rendered box actually asks for, and
    // nothing else. Each distinct width is a separate Cloudinary derivation
    // and a separate CDN cache entry, so a loose ladder means more cold
    // first-views, not more precision. Capped at 1600 (the largest transform
    // the design defines); the framework defaults run to 3840.
    //
    // 256 is load-bearing: it is what a 2x-DPR phone picks for a catalog card,
    // which is why `CLOUDINARY_PREVIEW_WIDTH` reuses it on the detail pages.
    deviceSizes: [640, 828, 1080, 1600],
    imageSizes: [128, 192, 256, 384, 512],
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  // Upload fails silently without these — set them in the Vercel project
  // alongside SENTRY_AUTH_TOKEN.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: { name: SENTRY_RELEASE },
  // Source maps are only uploaded from Vercel's build environment.
  sourcemaps: {
    disable: !process.env.VERCEL,
    // Sentry keeps its copy; leaving them on the CDN publishes readable source
    // for the whole app and costs bandwidth against the Hobby plan to serve.
    deleteSourcemapsAfterUpload: true,
  },
  // Next emits some client chunks outside the directory Sentry scans by
  // default; without this the frames in those chunks stay minified.
  widenClientFileUpload: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
