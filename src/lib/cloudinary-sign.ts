import { createHash } from "node:crypto";
import { env } from "@/src/lib/env";
import { CLOUDINARY_FOLDER } from "@/src/lib/cloudinary";

// Server-only: signs Cloudinary API params with CLOUDINARY_API_SECRET.
// Never imported from a client component.

function sign(params: Record<string, string | number>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1").update(`${toSign}${env.CLOUDINARY_API_SECRET}`).digest("hex");
}

export type UploadSignature = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
};

export function buildUploadSignature(): UploadSignature {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = sign({ folder: CLOUDINARY_FOLDER, timestamp });

  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY,
    cloudName: env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    folder: CLOUDINARY_FOLDER,
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
    { method: "POST", body },
  );

  if (!response.ok) {
    throw new Error(`Cloudinary delete failed with status ${response.status}`);
  }
}
