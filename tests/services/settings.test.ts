import { describe, expect, it } from "vitest";
import { shopSettingsSchema } from "@/src/services/settings";

describe("shopSettingsSchema", () => {
  it("strips punctuation and spacing from a WhatsApp number", () => {
    const parsed = shopSettingsSchema.parse({
      whatsappNumber: "+222 27 13 90 94",
      addressAr: "",
      addressFr: "",
      mapsUrl: "",
    });
    expect(parsed.whatsappNumber).toBe("22227139094");
  });

  it("treats a blank number as cleared rather than invalid", () => {
    const parsed = shopSettingsSchema.parse({ whatsappNumber: "", addressAr: "", addressFr: "", mapsUrl: "" });
    expect(parsed.whatsappNumber).toBeNull();
  });

  it("rejects a number that is too short to be dialable", () => {
    const result = shopSettingsSchema.safeParse({
      whatsappNumber: "2713",
      addressAr: "",
      addressFr: "",
      mapsUrl: "",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("INVALID_WHATSAPP");
  });

  it("keeps both address locales independently, trimming blanks to null", () => {
    const parsed = shopSettingsSchema.parse({
      whatsappNumber: "22227139094",
      addressAr: "  شارع المدينة، نواذيبو  ",
      addressFr: "   ",
      mapsUrl: "",
    });
    expect(parsed.addressAr).toBe("شارع المدينة، نواذيبو");
    expect(parsed.addressFr).toBeNull();
  });

  it("rejects a maps link that is not http(s)", () => {
    const result = shopSettingsSchema.safeParse({
      whatsappNumber: "",
      addressAr: "",
      addressFr: "",
      mapsUrl: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("INVALID_URL");
  });

  it("accepts an https maps link", () => {
    const parsed = shopSettingsSchema.parse({
      whatsappNumber: "",
      addressAr: "",
      addressFr: "",
      mapsUrl: "https://maps.app.goo.gl/abc",
    });
    expect(parsed.mapsUrl).toBe("https://maps.app.goo.gl/abc");
  });
});
