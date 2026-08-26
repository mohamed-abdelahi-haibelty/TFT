import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(1, "BETTER_AUTH_SECRET is required"),
  BETTER_AUTH_URL: z.url().optional(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z
    .string()
    .min(1, "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is required"),
  CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY is required"),
  CLOUDINARY_API_SECRET: z.string().min(1, "CLOUDINARY_API_SECRET is required"),
  // Deployed storefront origin, e.g. https://tft.example — used for canonical
  // URLs, OpenGraph, and sitemap.xml. Deliberately NOT defaulted: a default
  // made "unset" indistinguishable from "deliberately localhost", so the
  // Vercel fallback below could never fire and every production canonical
  // silently said localhost. `siteOrigin()` owns the resolution order.
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  // Injected by Vercel into every build — the *production* alias host, no
  // scheme (e.g. papeterie.vercel.app). Present on preview builds too, and
  // always pointing at production, which is what a canonical URL should say.
  // Second choice for the site origin until a custom domain is decided.
  VERCEL_PROJECT_PRODUCTION_URL: z.string().trim().min(1).optional(),
  // Set by Vercel. Absent locally, which reads the same as "not production" —
  // the only distinction robots.ts needs.
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  // WhatsApp Business number for order handoff (222XXXXXXXX, no "+"). No real
  // number exists yet — optional so the storefront footer/hero can render a
  // graceful fallback instead of a broken link until one is set.
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().trim().min(1).optional(),
  // Observability. All optional: with these unset Sentry and PostHog are fully
  // inert, which is the intended state in dev and on preview deploys. They are
  // validated here anyway so a malformed DSN fails the boot rather than quietly
  // disabling error reporting on a production deploy — the failure mode of a
  // typo used to be silence.
  //
  // Note the asymmetry, which is deliberate and not an oversight: client-side
  // code reads `process.env.NEXT_PUBLIC_*` literally rather than importing from
  // here, because Next only inlines the literal form into the browser bundle
  // and this module's `safeParse(process.env)` runs against an empty object
  // there. This schema guards the server; the literals are what reach the
  // client. See src/lib/observability/config.ts.
  NEXT_PUBLIC_SENTRY_DSN: z.url().or(z.literal("")).optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.url().or(z.literal("")).optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  return parsed.data;
}

export const env = loadEnv();
