import { describe, expect, it } from "vitest";
import { buildWhatsAppOrderMessage, buildWhatsAppUrl } from "@/src/lib/whatsapp";

const baseInput = {
  orderCode: "TFT-2603-001",
  lines: [
    { name: "دفتر 100 ورقة", qty: 2 },
    { name: "قلم رصاص", qty: 3 },
  ],
  total: 1500,
  customerName: "Fatimetou",
  city: "ndb" as const,
};

describe("buildWhatsAppOrderMessage", () => {
  it("includes the order code, every line, total, name/city, and a payment sentence in Arabic", () => {
    const message = buildWhatsAppOrderMessage({ locale: "ar", ...baseInput });

    expect(message).toContain("TFT-2603-001");
    expect(message).toContain("دفتر 100 ورقة ×2");
    expect(message).toContain("قلم رصاص ×3");
    expect(message).toContain("1,500 MRU");
    expect(message).toContain("Fatimetou");
    expect(message).toContain("نواذيبو");
    expect(message).toContain("بنكيلي");
    expect(message).toContain("مصرفي");
    expect(message).toContain("سداد");
  });

  it("includes the same content in French for a non-ar locale", () => {
    const message = buildWhatsAppOrderMessage({ locale: "fr", ...baseInput, city: "nkc" });

    expect(message).toContain("TFT-2603-001");
    expect(message).toContain("دفتر 100 ورقة ×2");
    expect(message).toContain("1,500 MRU");
    expect(message).toContain("Fatimetou");
    expect(message).toContain("Nouakchott");
    expect(message).toContain("Bankily");
    expect(message).toContain("Masrvi");
    expect(message).toContain("Sedad");
  });

  it("labels the 'other' city distinctly per locale", () => {
    expect(buildWhatsAppOrderMessage({ locale: "ar", ...baseInput, city: "other" })).toContain("مدينة أخرى");
    expect(buildWhatsAppOrderMessage({ locale: "fr", ...baseInput, city: "other" })).toContain("autre ville");
  });
});

describe("buildWhatsAppUrl", () => {
  it("builds a wa.me link with the message URL-encoded", () => {
    const url = buildWhatsAppUrl("22212345678", "hello world & more");
    expect(url).toBe("https://wa.me/22212345678?text=hello%20world%20%26%20more");
  });

  it("returns null when no phone number is configured", () => {
    expect(buildWhatsAppUrl(undefined, "hello")).toBeNull();
    expect(buildWhatsAppUrl("", "hello")).toBeNull();
  });
});
