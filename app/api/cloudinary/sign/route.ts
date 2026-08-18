import { withErrorHandling } from "@/src/lib/with-error-handling";
import { buildUploadSignature } from "@/src/lib/cloudinary-sign";
import { requirePermission } from "@/src/services/authz";

export const POST = withErrorHandling(async () => {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  return { ok: true, data: buildUploadSignature() };
});
