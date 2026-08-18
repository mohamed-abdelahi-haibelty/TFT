import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    loader: "custom",
    loaderFile: "./src/lib/cloudinary-image-loader.ts",
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  // Source maps are only uploaded from Vercel's build environment.
  sourcemaps: { disable: !process.env.VERCEL },
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
