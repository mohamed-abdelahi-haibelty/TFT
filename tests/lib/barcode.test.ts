import { BarcodeDetector } from "barcode-detector/pure";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { renderBarcodePng } from "@/src/lib/barcode";

// barcode-detector (a ponyfill of the browser Barcode Detection API, backed
// by zxing-wasm) expects a handful of DOM globals that plain Node doesn't
// provide. Minimal stand-ins are enough to drive it against raw pixel data —
// this is what makes a *real* decode possible in a unit test instead of only
// asserting bwip-js didn't throw.
class NodeImageData {
  public colorSpace: PredefinedColorSpace = "srgb";
  public data: Uint8ClampedArray<ArrayBuffer>;

  constructor(
    data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {
    this.data = new Uint8ClampedArray(data);
  }
}
class NodeDOMRectReadOnly {
  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
  ) {}
}
(globalThis as unknown as { ImageData: typeof NodeImageData }).ImageData = NodeImageData;
(globalThis as unknown as { DOMRectReadOnly: typeof NodeDOMRectReadOnly }).DOMRectReadOnly =
  NodeDOMRectReadOnly;

const detector = new BarcodeDetector({ formats: ["code_128"] });

async function decode(sku: string) {
  const png = await renderBarcodePng(sku);
  const decoded = PNG.sync.read(png);
  const imageData = new NodeImageData(new Uint8ClampedArray(decoded.data), decoded.width, decoded.height);
  return detector.detect(imageData);
}

describe("renderBarcodePng", () => {
  it("round-trips a known SKU back through a real Code128 decoder", async () => {
    const results = await decode("V-000123");
    expect(results).toHaveLength(1);
    expect(results[0].format).toBe("code_128");
    expect(results[0].rawValue).toBe("V-000123");
  });

  it("round-trips a product SKU (different prefix, all zeros)", async () => {
    const results = await decode("P-000001");
    expect(results[0]?.rawValue).toBe("P-000001");
  });

  it("round-trips a bundle SKU", async () => {
    const results = await decode("B-000007");
    expect(results[0]?.rawValue).toBe("B-000007");
  });
});
