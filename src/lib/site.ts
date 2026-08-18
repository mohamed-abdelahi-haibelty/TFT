import { env } from "@/src/lib/env";
import { routing } from "@/src/i18n/routing";

/** `NEXT_PUBLIC_SITE_URL` with no trailing slash, for building absolute canonical/OG/sitemap URLs. */
export function siteOrigin(): string {
  return env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
}

/** Absolute, locale-prefixed URL for a storefront path (`path` starts with `/`, no locale prefix — e.g. `/catalog`). */
export function absoluteUrl(locale: string, path = "/"): string {
  return `${siteOrigin()}/${locale}${path === "/" ? "" : path}`;
}

/** `{ ar: ..., fr: ... }` alternate-language URL map for a given path, for metadata `alternates.languages` and sitemap `alternates.languages`. */
export function localeAlternates(path = "/"): Record<string, string> {
  return Object.fromEntries(routing.locales.map((locale) => [locale, absoluteUrl(locale, path)]));
}
