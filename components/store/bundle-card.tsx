import { Gift } from "lucide-react";
import { ProductImage } from "@/components/store/product-image";
import { Link } from "@/src/i18n/navigation";
import { formatMoney } from "@/src/lib/money";
import type { StorefrontBundleCard } from "@/src/services/storefront";

/** "Atelier Blanc": the same catalog-plate treatment as ProductCard — the "Boîtes prêtes" section heading already tells the visitor these are bundles, so the card itself carries no extra badge. */
export function BundleCard({ bundle, name }: { bundle: StorefrontBundleCard; name: string }) {
  return (
    <Link href={`/boxes/${bundle.slug}`} className="group flex flex-col">
      <div className="mb-4 flex aspect-square items-center justify-center border border-border p-6 transition-colors group-hover:border-ink">
        {bundle.image ? (
          <ProductImage publicId={bundle.image} sizes="(min-width: 768px) 210px, (min-width: 640px) 22vw, 31vw" />
        ) : (
          <Gift className="size-8 text-ink-soft" aria-hidden="true" />
        )}
      </div>
      <span className="text-sm font-medium text-ink">{name}</span>
      <span className="mt-1 font-mono text-sm text-ink-soft">{formatMoney(bundle.effectivePrice)}</span>
    </Link>
  );
}
