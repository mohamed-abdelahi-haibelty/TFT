import { ImageResponse } from "next/og";
import { routing } from "@/src/i18n/routing";
import { OG_IMAGE_ALT, OG_IMAGE_SIZE } from "@/src/lib/seo";

/**
 * The share card for every page that does not supply its own image — the home
 * page and all three listing routes, none of which had one. It sits in the
 * `[locale]` segment because that is the only place `metadataBase` is defined;
 * at the app root, where there is no layout to declare it, Next resolves this
 * image against `http://localhost:3000` and warns on every page.
 *
 * WhatsApp is this shop's real distribution channel, so this is not a
 * nice-to-have — a pasted link with no card is a bare URL in a chat.
 *
 * The card is deliberately Latin-only. Satori, which renders this, accepts
 * ttf/otf/woff and **not woff2**, and `public/fonts/` holds woff2 exclusively
 * — so an Arabic headline here would need a converted font file committed
 * outside `public/`. The brand reads the same in both locales, so the wordmark
 * carries the card until that font exists.
 */
// Size and alt live in src/lib/seo.ts, which is what actually puts the
// `og:image` tags on the page — see the note there.
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";
export const alt = OG_IMAGE_ALT;

const PAPER = "#FAF9F7";
const INK = "#1A1613";
const INK_SOFT = "#5C5650";

/** Both locales get the same card, but the segment is dynamic, so its params have to be enumerated for the image to prerender. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: PAPER,
          padding: 64,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            border: `1px solid ${INK}`,
            padding: 72,
          }}
        >
          <div style={{ display: "flex", fontSize: 190, lineHeight: 1, color: INK, letterSpacing: -6 }}>
            TFT
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 34,
              color: INK,
              letterSpacing: 10,
            }}
          >
            THE FIRST TRADE
          </div>
          <div style={{ display: "flex", width: 120, height: 1, marginTop: 40, backgroundColor: INK }} />
          <div style={{ display: "flex", marginTop: 40, fontSize: 30, color: INK_SOFT }}>
            Papeterie &amp; fournitures scolaires
          </div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 30, color: INK_SOFT }}>
            Nouadhibou, Mauritanie
          </div>
        </div>
      </div>
    ),
    size,
  );
}
