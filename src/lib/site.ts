import { env } from "@/src/lib/env";
import { routing } from "@/src/i18n/routing";

const LOCALHOST_ORIGIN = "http://localhost:3000";

/**
 * Resolution order for the origin every canonical, OpenGraph and sitemap URL
 * is built from. Split out from `siteOrigin()` as a pure function so the order
 * itself is testable — `env` parses `process.env` once at module load, so a
 * test can't re-point it without reloading the module graph.
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — the custom domain, once one is chosen.
 * 2. `https://${VERCEL_PROJECT_PRODUCTION_URL}` — Vercel's production alias.
 * 3. `http://localhost:3000` — dev and tests.
 */
export function resolveSiteOrigin(siteUrl?: string, vercelProductionHost?: string): string {
  const origin =
    siteUrl || (vercelProductionHost ? `https://${vercelProductionHost}` : LOCALHOST_ORIGIN);
  return origin.replace(/\/$/, "");
}

/** The configured site origin with no trailing slash, for absolute canonical/OG/sitemap URLs. */
export function siteOrigin(): string {
  return resolveSiteOrigin(env.NEXT_PUBLIC_SITE_URL, env.VERCEL_PROJECT_PRODUCTION_URL);
}

/** Absolute, locale-prefixed URL for a storefront path (`path` starts with `/`, no locale prefix — e.g. `/catalog`). */
export function absoluteUrl(locale: string, path = "/"): string {
  return `${siteOrigin()}/${locale}${path === "/" ? "" : path}`;
}

/**
 * `{ ar, fr, "x-default" }` alternate-language URL map for a given path, for
 * metadata `alternates.languages` and sitemap `alternates.languages`.
 *
 * `x-default` names what a crawler should serve when it matches neither
 * language — Arabic, the default locale and the shop's own. Without it, a
 * search engine picks one of the two itself, and next-intl's always-prefixed
 * routing means there is no unprefixed URL for it to fall back to.
 */
export function localeAlternates(path = "/"): Record<string, string> {
  return {
    ...Object.fromEntries(routing.locales.map((locale) => [locale, absoluteUrl(locale, path)])),
    "x-default": absoluteUrl(routing.defaultLocale, path),
  };
}
