import Image from "next/image";

/**
 * The one place a Cloudinary product photo becomes a DOM node.
 *
 * Every storefront surface draws its photo into a bordered square tray and
 * relies on `mix-blend-multiply` to cancel the white `c_pad` ground the
 * loader produces — so the tray treatment, the placeholder and the blend all
 * live here rather than being re-typed at each of a dozen call sites.
 *
 * `src` is a bare Cloudinary public_id, not a URL: `next/image` hands it to
 * `cloudinaryLoader` (wired via `images.loaderFile`), which builds a real
 * delivery URL at whatever width the browser picks from `sizes`. Before this
 * existed every call site hardcoded one fixed transform, so a phone in a
 * ~180px grid cell downloaded the same 400px — or, on the detail heroes,
 * 1600px — image as a desktop.
 */

/**
 * A paper-tinted square with a slow diagonal sweep, inlined as a data URI.
 *
 * Deliberately not a per-image blurred preview: that would cost one extra
 * Cloudinary request per photo, and PRODUCT.md puts this audience on
 * connections where the placeholder must not compete with the thing it is a
 * placeholder for. This costs nothing, renders before any network work, and
 * multiplies to roughly the tray's own ground so the swap is quiet.
 */
const SHIMMER = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJzIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI2Y4ZjdmNSIvPjxzdG9wIG9mZnNldD0iNDUlIiBzdG9wLWNvbG9yPSIjZjhmN2Y1Ii8+PHN0b3Agb2Zmc2V0PSI1NSUiIHN0b3AtY29sb3I9IiNlZWVjZTgiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNmOGY3ZjUiLz48YW5pbWF0ZVRyYW5zZm9ybSBhdHRyaWJ1dGVOYW1lPSJncmFkaWVudFRyYW5zZm9ybSIgdHlwZT0idHJhbnNsYXRlIiB2YWx1ZXM9Ii0xIC0xOzEgMTstMSAtMSIgZHVyPSIyLjRzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgZmlsbD0idXJsKCNzKSIvPjwvc3ZnPg==";

export function ProductImage({
  publicId,
  sizes,
  alt = "",
  preload = false,
}: {
  publicId: string;
  /** Required — without it the browser assumes 100vw and over-downloads on every grid. */
  sizes: string;
  /**
   * Defaults to decorative. On a card that is correct: the product name is
   * the very next line of text, so naming the photo too would just make a
   * screen reader say it twice. The galleries pass a real alt because there
   * the photo is the content being paged through.
   */
  alt?: string;
  /** For the one image that is above the fold on its page. `priority` is deprecated in Next 16. */
  preload?: boolean;
}) {
  // `fill` resolves against the nearest positioned ancestor's *padding* box,
  // so pointing it straight at a tray would push the photo out under the
  // tray's own inset and let the placeholder run to the hairline. This
  // wrapper is the box being filled instead: it sizes to the tray's content
  // box, so photo and placeholder occupy exactly the same rectangle and every
  // call site keeps its existing padding without also restating it here.
  return (
    <span className="relative block size-full">
      <Image
        src={publicId}
        alt={alt}
        fill
        sizes={sizes}
        preload={preload}
        placeholder={SHIMMER}
        className="object-contain mix-blend-multiply"
      />
    </span>
  );
}
