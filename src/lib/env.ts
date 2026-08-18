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
  // URLs, OpenGraph, and sitemap.xml. Defaults to localhost so dev/tests work
  // without a real domain; the real production value is still undecided
  // (tracker/context/progress-tracker.md Open Questions).
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  // WhatsApp Business number for order handoff (222XXXXXXXX, no "+"). No real
  // number exists yet — optional so the storefront footer/hero can render a
  // graceful fallback instead of a broken link until one is set.
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().trim().min(1).optional(),
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
