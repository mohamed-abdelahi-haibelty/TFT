import type { MetadataRoute } from "next";
import { siteOrigin } from "@/src/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Locale-prefixed admin routes (/ar/admin, /fr/admin, …) stay out of the index.
      disallow: "/*/admin",
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
