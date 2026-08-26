import { describe, expect, it } from "vitest";
import { shopSettingsSchema } from "@/src/services/settings";

/**
 * The admin form posts every field on every save and the write is a wholesale
 * `onConflictDoUpdate`, so the schema requires all of them — a partial payload
 * is a bug, not a partial update. Tests build on this baseline and override
 * only what they are asserting about.
 */
const BLANK = {
  whatsappNumber: "",
  addressAr: "",
  addressFr: "",
  mapsUrl: "",
  streetAr: "",
  streetFr: "",
  city: "",
  postalCode: "",
  latitude: "",
  longitude: "",
  opensAt: "",
  closesAt: "",
  closedDay: "",
  instagramUrl: "",
  facebookUrl: "",
};

describe("shopSettingsSchema", () => {
  it("strips punctuation and spacing from a WhatsApp number", () => {
    const parsed = shopSettingsSchema.parse({ ...BLANK, whatsappNumber: "+222 27 13 90 94" });
    expect(parsed.whatsappNumber).toBe("22227139094");
  });

  it("treats a blank number as cleared rather than invalid", () => {
    const parsed = shopSettingsSchema.parse({ ...BLANK });
    expect(parsed.whatsappNumber).toBeNull();
  });

  it("rejects a number that is too short to be dialable", () => {
    const result = shopSettingsSchema.safeParse({ ...BLANK, whatsappNumber: "2713" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("INVALID_WHATSAPP");
  });

  it("keeps both address locales independently, trimming blanks to null", () => {
    const parsed = shopSettingsSchema.parse({
      ...BLANK,
      whatsappNumber: "22227139094",
      addressAr: "  شارع المدينة، نواذيبو  ",
      addressFr: "   ",
    });
    expect(parsed.addressAr).toBe("شارع المدينة، نواذيبو");
    expect(parsed.addressFr).toBeNull();
  });

  it("rejects a maps link that is not http(s)", () => {
    const result = shopSettingsSchema.safeParse({ ...BLANK, mapsUrl: "javascript:alert(1)" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("INVALID_URL");
  });

  it("accepts an https maps link", () => {
    const parsed = shopSettingsSchema.parse({ ...BLANK, mapsUrl: "https://maps.app.goo.gl/abc" });
    expect(parsed.mapsUrl).toBe("https://maps.app.goo.gl/abc");
  });

  it("parses coordinates as numbers and blanks as null", () => {
    const parsed = shopSettingsSchema.parse({ ...BLANK, latitude: "20.9412", longitude: "-17.0347" });
    expect(parsed.latitude).toBe(20.9412);
    expect(parsed.longitude).toBe(-17.0347);
    expect(shopSettingsSchema.parse({ ...BLANK }).latitude).toBeNull();
  });

  it("rejects a coordinate outside its axis", () => {
    // 100 is a valid longitude but not a valid latitude — the bound differs per axis.
    expect(shopSettingsSchema.safeParse({ ...BLANK, latitude: "100" }).success).toBe(false);
    expect(shopSettingsSchema.safeParse({ ...BLANK, longitude: "100" }).success).toBe(true);
  });

  it("rejects a coordinate that is not a number at all", () => {
    const result = shopSettingsSchema.safeParse({ ...BLANK, latitude: "north" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("INVALID_COORDINATE");
  });

  it("accepts 24-hour times and rejects anything else", () => {
    expect(shopSettingsSchema.parse({ ...BLANK, opensAt: "09:00" }).opensAt).toBe("09:00");
    expect(shopSettingsSchema.safeParse({ ...BLANK, opensAt: "9am" }).success).toBe(false);
    expect(shopSettingsSchema.safeParse({ ...BLANK, closesAt: "24:00" }).success).toBe(false);
  });

  it("only accepts a schema.org day name for the closing day", () => {
    expect(shopSettingsSchema.parse({ ...BLANK, closedDay: "Friday" }).closedDay).toBe("Friday");
    expect(shopSettingsSchema.parse({ ...BLANK }).closedDay).toBeNull();
    const result = shopSettingsSchema.safeParse({ ...BLANK, closedDay: "الجمعة" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("INVALID_DAY");
  });

  it("holds social links to the same http(s) rule as the maps link", () => {
    expect(shopSettingsSchema.safeParse({ ...BLANK, instagramUrl: "instagram.com/tft" }).success).toBe(false);
    expect(shopSettingsSchema.parse({ ...BLANK, facebookUrl: "https://facebook.com/tft" }).facebookUrl).toBe(
      "https://facebook.com/tft",
    );
  });
});
