import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Mirrors `STOREFRONT_REVALIDATE_SECONDS` in src/services/storefront.ts, which
// is the prose explanation of why this number is what it is. Kept literal here
// because next.config.ts is loaded before path aliases resolve.
const STOREFRONT_REVALIDATE_SECONDS = 900;

const nextConfig: NextConfig = {
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
  // Source maps are only uploaded from Vercel's build environment.
  sourcemaps: { disable: !process.env.VERCEL },
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
