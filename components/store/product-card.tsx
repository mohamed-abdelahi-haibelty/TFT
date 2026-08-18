import { Package } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PromoCountdown } from "@/components/store/promo-countdown";
import { StockBadge } from "@/components/store/stock-badge";
import { Link } from "@/src/i18n/navigation";
import { buildCloudinaryUrl } from "@/src/lib/cloudinary";
import { formatMoney } from "@/src/lib/money";
import { deriveStockStatus } from "@/src/lib/stock-status";
import type { StorefrontProductCard } from "@/src/services/storefront";

/**
 * "Atelier Blanc": a catalog-plate card — a bordered white image tray
 * (`mix-blend-multiply` on the photo removes its own white backdrop so it
 * sits flush in the tray instead of showing a visible square), plain type
 * below, no outer card border. Quiet by design — the promo/stock badges
 * (task 09) only render when there's something to say; a plain in-stock
 * product stays exactly as silent as before.
 */
export async function ProductCard({
  product,
  name,
  locale,
}: {
  product: StorefrontProductCard;
  name: string;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "store.badges" });
  const status = deriveStockStatus(product.stockQty, product.allowBackorder);

  return (
    <Link href={`/product/${product.slug}`} className="group flex flex-col">
      <div className="mb-4 flex aspect-square items-center justify-center border border-border p-6 transition-colors group-hover:border-ink">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary delivery URL, fixed card transform
          <img
            src={buildCloudinaryUrl(product.image, "card")}
            alt=""
            width={400}
            height={400}
            loading="lazy"
            decoding="async"
            className="size-full object-contain mix-blend-multiply"
          />
        ) : (
          <Package className="size-8 text-ink-soft" aria-hidden="true" />
        )}
      </div>
      <span className="text-sm font-medium text-ink">{name}</span>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-sm text-ink-soft">{formatMoney(product.effectivePrice)}</span>
        {product.effectivePrice < product.basePrice && (
          <span className="font-mono text-xs text-ink-soft line-through">{formatMoney(product.basePrice)}</span>
        )}
      </div>
      {(product.promo || status !== "in-stock") && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {product.promo && <PromoCountdown endsAt={new Date(product.promo.endsAt).toISOString()} />}
          <StockBadge status={status} label={t(status === "backorder" ? "backorder" : "outOfStock")} />
        </div>
      )}
    </Link>
  );
}
