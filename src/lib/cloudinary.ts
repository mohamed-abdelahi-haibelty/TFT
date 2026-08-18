/**
 * Client-safe Cloudinary URL helpers. No secrets here — only the public cloud
 * name (`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`), which must be readable from the
 * browser bundle since `cloudinaryLoader` runs as a `next/image` custom loader
 * on the client, not just the server. Signing lives in `cloudinary-sign.ts`.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

export const CLOUDINARY_FOLDER = "papeterie";

export type CloudinaryImageSize = "thumbnail" | "card" | "gallery" | "zoom" | "label";

// Every size pads onto a white square (`c_pad,b_white`) per DESIGN.md's
// product-imagery rule — a uniform look with no background-removal add-on.
const SIZE_TRANSFORMS: Record<CloudinaryImageSize, string> = {
  thumbnail: "c_pad,b_white,w_120,h_120",
  card: "c_pad,b_white,w_400,h_400",
  gallery: "c_pad,b_white,w_800,h_800",
  zoom: "c_pad,b_white,w_1600,h_1600",
  label: "c_pad,b_white,w_200,h_200",
};

function requireCloudName(): string {
  if (!CLOUD_NAME) {
    throw new Error("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is not set");
  }
  return CLOUD_NAME;
}

/** Builds a delivery URL for one of the system's fixed product-image sizes. */
export function buildCloudinaryUrl(publicId: string, size: CloudinaryImageSize): string {
  const transform = `${SIZE_TRANSFORMS[size]},f_auto,q_auto`;
  return `https://res.cloudinary.com/${requireCloudName()}/image/upload/${transform}/${publicId}`;
}

const SIZE_WIDTHS: Record<CloudinaryImageSize, number> = {
  thumbnail: 120,
  card: 400,
  gallery: 800,
  zoom: 1600,
  label: 200,
};

/** Intrinsic pixel width of one of the fixed sizes — every transform pads to a square, so this is also the height. */
export function cloudinaryImageSize(size: CloudinaryImageSize): number {
  return SIZE_WIDTHS[size];
}

/**
 * A `srcset` across the fixed sizes, so the browser can pick by viewport and
 * DPR instead of every device downloading the largest. Product and bundle
 * heroes were serving `zoom` (1600×1600) into a ~300px box on a phone — 5×
 * more pixels than the screen can show, on an audience PRODUCT.md places on
 * mobile connections.
 */
export function buildCloudinarySrcSet(publicId: string, sizes: CloudinaryImageSize[]): string {
  return sizes.map((size) => `${buildCloudinaryUrl(publicId, size)} ${SIZE_WIDTHS[size]}w`).join(", ");
}

/**
 * Custom `next/image` loader for arbitrary responsive widths. `src` is a bare
 * Cloudinary public_id (not a URL) — wire it via `images.loader: "custom"` /
 * `images.loaderFile` in `next.config.ts`, and pass the public_id as an
 * <Image src>.
 */
export function cloudinaryLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const q = quality ?? "auto";
  return `https://res.cloudinary.com/${requireCloudName()}/image/upload/c_limit,w_${width},q_${q},f_auto/${src}`;
}
