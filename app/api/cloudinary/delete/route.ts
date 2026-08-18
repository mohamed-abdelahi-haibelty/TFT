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

  const t = await getTranslations("authErrors");
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: t("invalidImageInput") } } as const;
  }

  await destroyCloudinaryAsset(parsed.data.publicId);
  return { ok: true, data: { deleted: true } };
});
