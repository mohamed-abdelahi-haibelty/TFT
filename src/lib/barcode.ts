import bwipjs from "bwip-js/node";

/**
 * Renders a Code128 PNG for the given value (a SKU, exactly as scanned).
 * `backgroundcolor` must be explicit — bwip-js defaults to a transparent
 * background (opaque bars, alpha 0 elsewhere), which every luminance-based
 * decoder that ignores alpha reads as a solid black image with zero
 * contrast. An explicit opaque white background is what makes the PNG both
 * scannable and correct to print.
 */
export function renderBarcodePng(value: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    scale: 3,
    height: 12,
    includetext: false,
    backgroundcolor: "FFFFFF",
  });
}
