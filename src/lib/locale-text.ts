/** Picks the Arabic or French copy of a bilingual row — `ar` is the default locale, everything else falls back to `fr`. */
export function localized(locale: string, ar: string, fr: string): string {
  return locale === "ar" ? ar : fr;
}
