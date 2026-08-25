"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { localized } from "@/src/lib/locale-text";
import { useRouter } from "@/src/i18n/navigation";
import { reorderQuickPicksAction } from "@/src/services/product-actions";

export type QuickPickManagerItem = { id: string; nameAr: string; nameFr: string };

export function QuickPickManager({ items }: { items: QuickPickManagerItem[] }) {
  const t = useTranslations("admin.products");
  const locale = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const ids = items.map((item) => item.id);

  async function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= ids.length || movingId) return;
    setMoveError(null);
    setMovingId(items[index].id);
    const next = [...ids];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved);
    const result = await reorderQuickPicksAction(next);
    if (result.ok) {
      router.refresh();
      toast(t("quickPickReorderSuccess"));
    } else {
      setMoveError(result.error.message);
    }
    setMovingId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-heading text-lg font-semibold text-ink">{t("quickPickSectionTitle")}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t("quickPickSectionSubtitle")}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">{t("quickPickEmpty")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border" aria-busy={!!movingId}>
          {items.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2 px-3 py-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label={t("quickPickMoveUp")}
                  disabled={!!movingId || index === 0}
                  onClick={() => move(index, -1)}
                  className="flex size-8 items-center justify-center rounded-xs text-ink-soft transition-colors hover:bg-paper hover:text-ink disabled:opacity-30"
                >
                  <ChevronUp className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={t("quickPickMoveDown")}
                  disabled={!!movingId || index === items.length - 1}
                  onClick={() => move(index, 1)}
                  className="flex size-8 items-center justify-center rounded-xs text-ink-soft transition-colors hover:bg-paper hover:text-ink disabled:opacity-30"
                >
                  <ChevronDown className="size-4" aria-hidden="true" />
                </button>
              </div>
              <span className="text-sm text-ink">{localized(locale, item.nameAr, item.nameFr)}</span>
            </li>
          ))}
        </ol>
      )}

      {moveError ? (
        <p className="text-xs font-semibold text-plum" aria-live="polite">
          {moveError}
        </p>
      ) : null}
    </div>
  );
}
