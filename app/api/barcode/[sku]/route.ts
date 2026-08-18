import { NextResponse } from "next/server";
import { HTTP_STATUS_BY_ERROR_CODE } from "@/src/lib/errors";
import { renderBarcodePng } from "@/src/lib/barcode";
import { requirePermission } from "@/src/services/authz";

export async function GET(_request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const auth = await requirePermission("catalog.view");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: HTTP_STATUS_BY_ERROR_CODE[auth.error.code] },
    );
  }

  const { sku } = await params;

  let png: Buffer;
  try {
    png = await renderBarcodePng(decodeURIComponent(sku));
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid SKU." } }, { status: 400 });
  }

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // SKU -> barcode is a pure deterministic function, so this is safe to
      // cache forever, both at the CDN and in the admin browser.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
