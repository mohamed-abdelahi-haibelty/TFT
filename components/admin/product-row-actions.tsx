"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/src/i18n/navigation";
import { toggleProductActiveAction } from "@/src/services/product-actions";

export function ProductRowActions({
  productId,
  isActive,
}: {
  productId: string;
  isActive: boolean;
}) {
  const t = useTranslations("admin.products");
  const [state, formAction, isPending] = useActionState(
    toggleProductActiveAction.bind(null, productId, !isActive),
    null,
  );
  const deactivatedBundles = state?.ok ? state.data.deactivatedBundles : [];

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/products/${productId}`}
          className="inline-flex h-8 items-center rounded-full border border-border px-3.5 text-xs font-medium text-ink transition-colors hover:bg-paper"
        >
          {t("edit")}
        </Link>
        <Link
          href={`/admin/products/${productId}/label`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center rounded-full border border-border px-3.5 text-xs font-medium text-ink transition-colors hover:bg-paper"
        >
          {t("printLabel")}
        </Link>
        <form action={formAction}>
          <Button
            type="submit"
            disabled={isPending}
            variant={isActive ? "destructive" : "secondary"}
            className="h-8 rounded-full px-3.5 text-xs"
          >
            {isActive ? t("deactivate") : t("activate")}
          </Button>
        </form>
      </div>
      {deactivatedBundles.length > 0 ? (
        <p role="status" className="max-w-72 text-xs text-gold-strong">
          {t("deactivatedBundlesWarning", {
            names: deactivatedBundles.map((bundle) => bundle.nameFr).join(", "),
          })}
        </p>
      ) : null}
    </div>
  );
}
