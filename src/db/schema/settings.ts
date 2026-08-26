import { boolean, pgTable, text } from "drizzle-orm/pg-core";
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
  ...timestamps,
});
