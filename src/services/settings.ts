import { cacheLife, cacheTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/src/db/client";
import { shopSettings } from "@/src/db/schema";
import { SCHEMA_DAYS } from "@/src/lib/days";
import { env } from "@/src/lib/env";
import type { ServiceResult } from "@/src/lib/errors";
import { requirePermission } from "@/src/services/authz";

/**
 * Shop profile — the WhatsApp business number, the physical address, and the
 * structured location/hours data that only ever leaves the site as JSON-LD.
 *
 * The read is public and unauthenticated (the storefront footer, the product
 * page's "ask" link and the checkout handoff all need it), so it follows
 * `storefront.ts`'s posture rather than the admin services': a `use cache`
 * wrapper over an exported `*Core` twin that tests call directly, since a
 * cached scope can't run outside a real Next.js render.
 *
 * Writes are admin-only. `staff` cannot change the shop's identity, for the
 * same reason PRODUCT.md keeps them away from prices and users.
 */

export type ShopSettings = {
  whatsappNumber: string | null;
  addressAr: string | null;
  addressFr: string | null;
  mapsUrl: string | null;
  streetAr: string | null;
  streetFr: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  opensAt: string | null;
  closesAt: string | null;
  closedDay: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
};

/**
 * `NEXT_PUBLIC_WHATSAPP_NUMBER` remains the bootstrap value: before anyone has
 * saved settings — and in local dev with an empty table — the number still
 * resolves, so no environment is ever left with a dead handoff. A saved value
 * always wins.
 */
function withEnvFallback(row: ShopSettings | null): ShopSettings {
  return {
    whatsappNumber: row?.whatsappNumber || env.NEXT_PUBLIC_WHATSAPP_NUMBER || null,
    addressAr: row?.addressAr || null,
    addressFr: row?.addressFr || null,
    mapsUrl: row?.mapsUrl || null,
    streetAr: row?.streetAr || null,
    streetFr: row?.streetFr || null,
    city: row?.city || null,
    postalCode: row?.postalCode || null,
    country: row?.country || null,
    // `??`, not `||` — a longitude of exactly 0 is a real coordinate.
    latitude: row?.latitude ?? null,
    longitude: row?.longitude ?? null,
    opensAt: row?.opensAt || null,
    closesAt: row?.closesAt || null,
    closedDay: row?.closedDay || null,
    instagramUrl: row?.instagramUrl || null,
    facebookUrl: row?.facebookUrl || null,
  };
}

export async function getShopSettingsCore(): Promise<ShopSettings> {
  const [row] = await db
    .select({
      whatsappNumber: shopSettings.whatsappNumber,
      addressAr: shopSettings.addressAr,
      addressFr: shopSettings.addressFr,
      mapsUrl: shopSettings.mapsUrl,
      streetAr: shopSettings.streetAr,
      streetFr: shopSettings.streetFr,
      city: shopSettings.city,
      postalCode: shopSettings.postalCode,
      country: shopSettings.country,
      latitude: shopSettings.latitude,
      longitude: shopSettings.longitude,
      opensAt: shopSettings.opensAt,
      closesAt: shopSettings.closesAt,
      closedDay: shopSettings.closedDay,
      instagramUrl: shopSettings.instagramUrl,
      facebookUrl: shopSettings.facebookUrl,
    })
    .from(shopSettings)
    .limit(1);

  return withEnvFallback(row ?? null);
}

export async function getShopSettings(): Promise<ShopSettings> {
  "use cache";
  cacheLife("max");
  cacheTag("shop-settings");
  return getShopSettingsCore();
}

/** Empty string is a real input here — it means "clear this field" — so blanks normalize to `null` rather than failing `min(1)`. */
const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null)
  .nullable()
  .catch(null);

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || /^https?:\/\//.test(value), { message: "INVALID_URL" })
  .transform((value) => value || null);

/** `HH:MM`, 24-hour — the exact shape `OpeningHoursSpecification` wants, so it needs no reformatting downstream. */
const optionalTime = z
  .string()
  .trim()
  .refine((value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), { message: "INVALID_TIME" })
  .transform((value) => value || null);

/** Decimal degrees. The bound differs per axis, hence the factory. */
const optionalCoordinate = (limit: number) =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .refine((value) => value === null || (Number.isFinite(value) && Math.abs(value) <= limit), {
      message: "INVALID_COORDINATE",
    });

const optionalDay = z
  .string()
  .trim()
  .refine((value) => value === "" || (SCHEMA_DAYS as readonly string[]).includes(value), {
    message: "INVALID_DAY",
  })
  .transform((value) => value || null);

/**
 * `country` is deliberately absent: it is not in the form, so it must not be
 * in this schema either — `onConflictDoUpdate` writes `parsed.data` wholesale,
 * and a field parsed but not submitted would be written back as `null`,
 * wiping the column's `'MR'` default on the first save.
 */
export const shopSettingsSchema = z.object({
  // Digits only: the value is concatenated straight into `wa.me/<number>`, so a
  // stored "+222 27 13 90 94" would silently produce a broken link.
  whatsappNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/[^\d]/g, ""))
    .refine((value) => value === "" || /^\d{8,15}$/.test(value), { message: "INVALID_WHATSAPP" })
    .transform((value) => value || null),
  addressAr: optionalText,
  addressFr: optionalText,
  mapsUrl: optionalUrl,
  streetAr: optionalText,
  streetFr: optionalText,
  city: optionalText,
  postalCode: optionalText,
  latitude: optionalCoordinate(90),
  longitude: optionalCoordinate(180),
  opensAt: optionalTime,
  closesAt: optionalTime,
  closedDay: optionalDay,
  instagramUrl: optionalUrl,
  facebookUrl: optionalUrl,
});

export type ShopSettingsInput = z.input<typeof shopSettingsSchema>;

/** Refine codes → `admin.settings.errors` message keys. Anything unmapped falls back to the WhatsApp message, which is what this did before there was more than one code. */
const ERROR_MESSAGE_KEYS = {
  INVALID_WHATSAPP: "invalidWhatsapp",
  INVALID_URL: "invalidUrl",
  INVALID_TIME: "invalidTime",
  INVALID_COORDINATE: "invalidCoordinate",
  INVALID_DAY: "invalidDay",
} as const;

export async function updateShopSettings(input: unknown): Promise<ServiceResult<null>> {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("admin.settings.errors");
  const parsed = shopSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = ERROR_MESSAGE_KEYS[issue?.message as keyof typeof ERROR_MESSAGE_KEYS] ?? "invalidWhatsapp";
    return { ok: false, error: { code: "VALIDATION", message: t(key) } };
  }

  // One statement, so it needs no transaction to be atomic — see the
  // `shopSettings` schema comment for why the singleton constraint is what
  // makes that work.
  await db
    .insert(shopSettings)
    .values({ singleton: true, ...parsed.data })
    .onConflictDoUpdate({ target: shopSettings.singleton, set: parsed.data });

  return { ok: true, data: null };
}
