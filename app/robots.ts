import type { MetadataRoute } from "next";
import { env } from "@/src/lib/env";
import { siteOrigin } from "@/src/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Preview deploys serve the same catalog on a different origin. Letting them
  // be crawled means competing with production for the same content, so they
  // are shut out wholesale rather than per-route.
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        // Locale-prefixed admin routes (/ar/admin, /fr/admin, …) stay out of
        // the index. The `(protected)` layout carries a `noindex` too — this
        // only saves the crawl.
        "/*/admin",
        // Order submission and image signing. Nothing to index, and a crawler
        // hitting them burns the rate limiter.
        "/api/",
      ],
      // `/checkout` and `/track` are deliberately NOT listed. Both carry
      // `robots: noindex` page metadata, and a Disallow here would stop a
      // crawler from ever fetching the page to *read* that directive — the
      // classic way a page ends up indexed with no description.
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
