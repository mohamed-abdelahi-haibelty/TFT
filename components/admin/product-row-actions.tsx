"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/src/i18n/navigation";
import { localized } from "@/src/lib/locale-text";
import { toggleProductActiveAction } from "@/src/services/product-actions";

export type DependentBundle = { id: string; nameAr: string; nameFr: string };

export function ProductRowActions({
  productId,
  isActive,
  dependentBundles = [],
}: {
  productId: string;
  isActive: boolean;
  /** Active bundles this product is a component of — what deactivating it would take offline too. */
  dependentBundles?: DependentBundle[];
}) {
  const t = useTranslations("admin.products");
  const locale = useLocale();
  const [state, formAction, isPending] = useActionState(
    toggleProductActiveAction.bind(null, productId, !isActive),
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const deactivatedBundles = state?.ok ? state.data.deactivatedBundles : [];
  const names = dependentBundles.map((bundle) => localized(locale, bundle.nameAr, bundle.nameFr)).join(", ");

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/products/${productId}`}
          className="inline-flex h-8 items-center rounded-xs border border-border px-3.5 text-xs font-medium text-ink transition-colors hover:bg-paper"
        >
          {t("edit")}
        </Link>

        {/* Reactivating is harmless and stays one click. Deactivating is not:
            it also deactivates every box this product is part of, and
            reactivating the product never brings those back — the owner has to
            remember which ones and re-enable each by hand. Every other
            destructive action in this admin asks first; this one used to fire
            straight off a row in a long table. */}
        {!isActive ? (
          <form action={formAction}>
            <Button type="submit" disabled={isPending} variant="secondary" className="h-8 rounded-xs px-3.5 text-xs">
              {t("activate")}
            </Button>
          </form>
        ) : confirming ? (
          <div className="flex items-center gap-2">
            <form action={formAction}>
              <Button
                ref={confirmRef}
                type="submit"
                disabled={isPending}
                variant="destructive"
                className="h-8 rounded-xs px-3.5 text-xs"
              >
                {t("deactivateConfirmSubmit")}
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              className="h-8 rounded-xs px-3.5 text-xs"
              onClick={() => setConfirming(false)}
            >
              {t("deactivateConfirmDismiss")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="destructive"
            className="h-8 rounded-xs px-3.5 text-xs"
            onClick={() => setConfirming(true)}
          >
            {t("deactivate")}
          </Button>
        )}
      </div>

      {confirming ? (
        <p className="max-w-72 text-xs text-ink">
          {names ? t("deactivateConfirmWithBundles", { names }) : t("deactivateConfirm")}
        </p>
      ) : null}

      {state && !state.ok ? (
        <p role="alert" className="max-w-72 text-xs font-semibold text-plum">
          {state.error.message}
        </p>
      ) : null}

      {deactivatedBundles.length > 0 ? (
        <p role="status" className="max-w-72 text-xs font-medium text-ink">
          {t("deactivatedBundlesWarning", {
            names: deactivatedBundles.map((bundle) => localized(locale, bundle.nameAr, bundle.nameFr)).join(", "),
          })}
        </p>
      ) : null}
    </div>
  );
}
