"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toggleQuickPickAction } from "@/src/services/product-actions";

export function QuickPickToggle({ productId, isQuickPick }: { productId: string; isQuickPick: boolean }) {
  const t = useTranslations("admin.products");
  const [state, formAction, isPending] = useActionState(
    toggleQuickPickAction.bind(null, productId, !isQuickPick),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <Button
        type="submit"
        disabled={isPending}
        variant={isQuickPick ? "secondary" : "outline"}
        className="h-8 rounded-xs px-3.5 text-xs"
      >
        {isQuickPick ? t("unpinFromPos") : t("pinToPos")}
      </Button>
      {state && !state.ok ? (
        <p className="max-w-40 text-xs font-semibold text-plum">{state.error.message}</p>
      ) : null}
    </form>
  );
}
