import { createHash } from "node:crypto";
import { env } from "@/src/lib/env";
import { CLOUDINARY_FOLDER } from "@/src/lib/cloudinary";
import { logger } from "@/src/lib/logger";

// Server-only: signs Cloudinary API params with CLOUDINARY_API_SECRET.
// Never imported from a client component.

function sign(params: Record<string, string | number>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1").update(`${toSign}${env.CLOUDINARY_API_SECRET}`).digest("hex");
}

/**
 * Signed into every upload, so Cloudinary — not the browser — enforces them.
 * The uploader's own type/size checks are a courtesy for the person at the
 * keyboard; a signature that constrained nothing but the folder let anyone
 * holding one push arbitrary files into the account for its whole validity
 * window.
 */
const ALLOWED_FORMATS = "jpg,jpeg,png,webp,avif";

export type UploadSignature = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  allowedFormats: string;
};

export function buildUploadSignature(): UploadSignature {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = sign({
    allowed_formats: ALLOWED_FORMATS,
    folder: CLOUDINARY_FOLDER,
    timestamp,
  });

  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY,
    cloudName: env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    folder: CLOUDINARY_FOLDER,
    allowedFormats: ALLOWED_FORMATS,
  };
}

export async function destroyCloudinaryAsset(publicId: string): Promise<void> {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = sign({ public_id: publicId, timestamp });

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: env.CLOUDINARY_API_KEY,
    signature,
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/destroy`,
    { method: "POST", body, signal: AbortSignal.timeout(10_000) },
  );

  if (!response.ok) {
    throw new Error(`Cloudinary delete failed with status ${response.status}`);
  }
}

/**
 * Best-effort cleanup for assets a save or delete just orphaned. Never throws:
 * a Cloudinary outage must not fail (or half-apply) a catalog write that has
 * already committed to Postgres. A leaked asset is a storage cost; a failed
 * save after the row is gone is a broken product page.
 */
export async function destroyCloudinaryAssets(publicIds: readonly string[]): Promise<void> {
  if (!publicIds.length) return;

  await Promise.all(
    publicIds.map(async (publicId) => {
      try {
        await destroyCloudinaryAsset(publicId);
      } catch (error) {
        logger.warn("Cloudinary cleanup failed for an orphaned asset", {
          publicId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}
