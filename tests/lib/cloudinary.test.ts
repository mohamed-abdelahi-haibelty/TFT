import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

describe("cloudinary URL builder", () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = ORIGINAL_CLOUD_NAME;
    vi.resetModules();
  });

  it("builds card and gallery URLs with f_auto,q_auto and the white-pad transform", async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
    const { buildCloudinaryUrl } = await import("@/src/lib/cloudinary");

    const card = buildCloudinaryUrl("papeterie/abc123", "card");
    const gallery = buildCloudinaryUrl("papeterie/abc123", "gallery");

    for (const url of [card, gallery]) {
      expect(url).toContain("f_auto,q_auto");
      expect(url).toContain("c_pad,b_white");
      expect(url).toMatch(/^https:\/\/res\.cloudinary\.com\/test-cloud\/image\/upload\//);
      expect(url.endsWith("/papeterie/abc123")).toBe(true);
    }

    expect(card).not.toBe(gallery);
  });

  it("builds distinct dimensioned transforms for thumbnail, zoom, and label", async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
    const { buildCloudinaryUrl } = await import("@/src/lib/cloudinary");

    expect(buildCloudinaryUrl("papeterie/x", "thumbnail")).toContain("w_120,h_120");
    expect(buildCloudinaryUrl("papeterie/x", "zoom")).toContain("w_1600,h_1600");
    expect(buildCloudinaryUrl("papeterie/x", "label")).toContain("w_200,h_200");
  });

  it("throws a clear error when the cloud name is not set", async () => {
    delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const { buildCloudinaryUrl } = await import("@/src/lib/cloudinary");

    expect(() => buildCloudinaryUrl("papeterie/x", "card")).toThrow(
      /NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME/,
    );
  });

  it("builds a width-based loader URL with f_auto and the requested quality", async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
    const { cloudinaryLoader } = await import("@/src/lib/cloudinary");

    const url = cloudinaryLoader({ src: "papeterie/abc123", width: 640, quality: 80 });

    expect(url).toBe(
      "https://res.cloudinary.com/test-cloud/image/upload/c_pad,b_white,w_640,h_640,q_80,f_auto/papeterie/abc123",
    );
  });

  it("pads the loader output onto a white square, like the fixed sizes", async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
    const { cloudinaryLoader } = await import("@/src/lib/cloudinary");

    // The tray treatment (`aspect-square` + `mix-blend-multiply`) only works
    // if every width comes back square on a white ground — a `c_limit` image
    // would letterbox and the multiply would have nothing uniform to cancel.
    const url = cloudinaryLoader({ src: "papeterie/abc123", width: 420 });

    expect(url).toContain("c_pad,b_white");
    expect(url).toContain("w_420,h_420");
  });

  it("defaults the loader quality to auto when not provided", async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
    const { cloudinaryLoader } = await import("@/src/lib/cloudinary");

    const url = cloudinaryLoader({ src: "papeterie/abc123", width: 320 });

    expect(url).toContain("q_auto");
  });
});
