import { cacheLife, cacheTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/src/db/client";
import { shopSettings } from "@/src/db/schema";
import { env } from "@/src/lib/env";
import type { ServiceResult } from "@/src/lib/errors";
import { requirePermission } from "@/src/services/authz";

/**
 * Shop profile — the WhatsApp business number and the physical address.
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
  };
}

export async function getShopSettingsCore(): Promise<ShopSettings> {
  const [row] = await db
    .select({
      whatsappNumber: shopSettings.whatsappNumber,
      addressAr: shopSettings.addressAr,
      addressFr: shopSettings.addressFr,
      mapsUrl: shopSettings.mapsUrl,
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
  mapsUrl: z
    .string()
    .trim()
    .refine((value) => value === "" || /^https?:\/\//.test(value), { message: "INVALID_URL" })
    .transform((value) => value || null),
});

export type ShopSettingsInput = z.input<typeof shopSettingsSchema>;

export async function updateShopSettings(input: unknown): Promise<ServiceResult<null>> {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("admin.settings.errors");
  const parsed = shopSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue?.message === "INVALID_URL" ? t("invalidUrl") : t("invalidWhatsapp");
    return { ok: false, error: { code: "VALIDATION", message } };
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
