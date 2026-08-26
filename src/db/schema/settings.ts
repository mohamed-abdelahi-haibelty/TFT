import { boolean, doublePrecision, pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

/**
 * Shop profile the owner can edit from the tablet — the WhatsApp business
 * number and the physical shop address, both of which used to be either a
 * build-time env var (a change nobody but a developer could make) or absent
 * entirely.
 *
 * Single row, enforced by a `unique` boolean that is always `true`: a settings
 * table with no key can silently accumulate a second row and then it's a coin
 * flip which one the storefront reads. `onConflictDoUpdate` against this
 * constraint keeps the write a single statement, which is both atomic on its
 * own and cheaper than opening a transaction to achieve the same thing.
 */
export const shopSettings = pgTable("shop_settings", {
  id: id(),
  singleton: boolean("singleton").notNull().default(true).unique(),
  /** Digits only, full international form (222XXXXXXXX) — concatenated into a `wa.me/<number>` URL. */
  whatsappNumber: text("whatsapp_number"),
  addressAr: text("address_ar"),
  addressFr: text("address_fr"),
  /** Optional map link shown beside the address in the footer. */
  mapsUrl: text("maps_url"),

  /*
   * Everything below is structured-data only — it never renders as UI. The
   * free-text `addressAr`/`addressFr` above stay exactly as they were (the
   * footer prints them verbatim); a `schema.org/PostalAddress` needs the same
   * address broken into parts, and a `LocalBusiness` panel in Google needs
   * coordinates and opening hours on top of that. All nullable, so the shop
   * keeps working untouched until the owner fills them in.
   */
  streetAr: text("street_ar"),
  streetFr: text("street_fr"),
  city: text("city").default("Nouadhibou"),
  postalCode: text("postal_code"),
  /** ISO 3166-1 alpha-2. Mauritania. */
  country: text("country").default("MR"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  /** `HH:MM`, 24-hour. One pair of hours for the week — this is a single shop counter, not a chain. */
  opensAt: text("opens_at"),
  closesAt: text("closes_at"),
  /** English schema.org day name (e.g. `Friday`) the shop is shut, or null for open all week. */
  closedDay: text("closed_day"),
  /** `sameAs` profiles — the strongest entity signal a shop this size can give Google. */
  instagramUrl: text("instagram_url"),
  facebookUrl: text("facebook_url"),
  ...timestamps,
});
