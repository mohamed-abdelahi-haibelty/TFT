import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { withErrorHandling } from "@/src/lib/with-error-handling";
import { CLOUDINARY_FOLDER } from "@/src/lib/cloudinary";
import { destroyCloudinaryAsset } from "@/src/lib/cloudinary-sign";
import { requirePermission } from "@/src/services/authz";

const deleteSchema = z.object({
  publicId: z.string().trim().startsWith(`${CLOUDINARY_FOLDER}/`),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  // `/api/*` sits outside the locale-prefixed route tree (see `proxy.ts`'s
  // matcher), so there is no ambient request locale for `getTranslations` to
  // pick up and it silently falls back to `defaultLocale`. Read it from the
  // caller instead, the same way `/api/orders` does.
  const locale = request.headers.get("accept-language")?.startsWith("fr") ? "fr" : "ar";
  const t = await getTranslations({ locale, namespace: "authErrors" });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: t("invalidImageInput") } } as const;
  }

  await destroyCloudinaryAsset(parsed.data.publicId);
  return { ok: true, data: { deleted: true } };
});
