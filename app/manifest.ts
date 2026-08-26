import type { MetadataRoute } from "next";
import { routing } from "@/src/i18n/routing";
import arMessages from "@/messages/ar.json";

/**
 * There was no web app manifest at all, which costs the "installable" signal
 * and leaves a saved shortcut with no name or icon.
 *
 * The manifest is one file for the whole site with no locale segment, so it
 * commits to the default locale: Arabic copy, `start_url` on `/ar`, `dir` rtl.
 * The copy is read straight out of `messages/ar.json` rather than duplicated
 * here, so it cannot drift from the page description it mirrors.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `TFT — ${arMessages.home.seo.title}`,
    short_name: "TFT",
    description: arMessages.home.seo.description,
    lang: routing.defaultLocale,
    dir: "rtl",
    start_url: `/${routing.defaultLocale}`,
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
