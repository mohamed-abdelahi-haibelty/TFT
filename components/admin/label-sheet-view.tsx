"use client";

import { Printer, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LabelCard } from "@/components/admin/label-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/src/lib/money";
import { saveLabelSheetSelectionAction } from "@/src/services/label-actions";
import type { CategoryListItem } from "@/src/services/categories";
import type { LabelPickerItem } from "@/src/services/labels";
import type { LabelSheetItem } from "@/src/db/schema";

function itemKey(type: LabelSheetItem["type"], id: string) {
  return `${type}:${id}`;
}

export function LabelSheetView({
  items,
  categories,
  initialSelection,
  locale,
}: {
  items: LabelPickerItem[];
  categories: CategoryListItem[];
  initialSelection: LabelSheetItem[];
  locale: string;
}) {
  const t = useTranslations("admin.labels");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelection.map((item) => itemKey(item.type, item.id))),
  );
  const [copies, setCopies] = useState(1);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persist(nextSelected: Set<string>) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setSaveStatus("saving");
    saveTimeout.current = setTimeout(async () => {
      const payload: LabelSheetItem[] = items
        .filter((item) => nextSelected.has(itemKey(item.type, item.id)))
        .map((item) => ({ type: item.type, id: item.id }));
      const result = await saveLabelSheetSelectionAction(payload);
      setSaveStatus(result.ok ? "saved" : "error");
    }, 500);
  }

  function toggle(item: LabelPickerItem) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = itemKey(item.type, item.id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persist(next);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryId && item.categoryId !== categoryId) return false;
      if (!term) return true;
      return (
        item.nameFr.toLowerCase().includes(term) ||
        item.nameAr.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term)
      );
    });
  }, [items, search, categoryId]);

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(itemKey(item.type, item.id))),
    [items, selected],
  );

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of filtered) next.add(itemKey(item.type, item.id));
      persist(next);
      return next;
    });
  }

  function clearSelection() {
    // Wipes a selection that is persisted server-side, from a control sitting
    // beside "select all" in identical styling.
    if (selected.size > 0 && !window.confirm(t("clearSelectionConfirm"))) return;
    const next = new Set<string>();
    setSelected(next);
    persist(next);
  }

  const categoryName = (category: CategoryListItem) => (locale === "ar" ? category.nameAr : category.nameFr);
  const selectionLabel = categoryId
    ? (() => {
        const match = categories.find((category) => category.id === categoryId);
        return match ? categoryName(match) : t("sheetFooterFallback");
      })()
    : t("sheetFooterFallback");
  // `ar-SA` produced Arabic-Indic digits here while `formatMoney` and the
  // storefront's own date formatting force Latin ones, and it risks an
  // Umm al-Qura calendar depending on the print engine.
  const printDate = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "fr-FR", {
    dateStyle: "long",
    numberingSystem: "latn",
    calendar: "gregory",
  }).format(new Date());

  // 40×30mm labels, 4 per row, 7 rows per A4 page under the @page margins below.
  const LABELS_PER_PAGE = 28;
  const printedLabels = selectedItems.flatMap((item) =>
    Array.from({ length: copies }, (_, index) => ({ item, copyIndex: index })),
  );
  const pageCount = Math.ceil(printedLabels.length / LABELS_PER_PAGE);

  return (
    <div className="flex flex-col gap-6">
      <style>{"@page { size: A4; margin: 12mm 10mm 18mm 10mm; }"}</style>

      <div className="flex flex-col gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search
              className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-soft"
              aria-hidden="true"
            />
            {/* A placeholder is not an accessible name. */}
            <input
              id="label-search"
              type="search"
              aria-label={t("searchLabel")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-10 w-full rounded-md border border-border ps-9 pe-3.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/30"
            />
          </div>
          {/* `w-44` clipped "Toutes les catégories" to "Toutes les catégorie"
              at tablet and mobile — reads as a typo, is a width bug. */}
          <Select value={categoryId} onValueChange={(value) => setCategoryId(value ?? "")}>
            <SelectTrigger size="md" className="w-full sm:w-64">
              <SelectValue placeholder={t("categoryFilterAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("categoryFilterAll")}</SelectItem>
              {/* Was `category.nameFr` unconditionally, so the Arabic admin's
                  only French text was its category list. */}
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {categoryName(category)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
          <span>{t("selectedCount", { count: selected.size })}</span>
          <span aria-hidden="true">·</span>
          {/* The picker scrolls inside a fixed height with no cue that more
              rows exist below the fold — this at least states how many. */}
          <span>{t("pickerCount", { count: filtered.length })}</span>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={selectAllFiltered} className="font-medium text-ink hover:underline">
            {t("selectAllFiltered")}
          </button>
          <button type="button" onClick={clearSelection} className="font-medium text-ink hover:underline">
            {t("clearSelection")}
          </button>
          <span className="ms-auto text-xs" role="status">
            {saveStatus === "saving" ? t("saveStatusSaving") : null}
            {saveStatus === "saved" ? t("saveStatusSaved") : null}
            {saveStatus === "error" ? t("saveStatusError") : null}
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <div className="max-h-96 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-120 border-collapse text-start">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b-2 border-border">
                  <th className="w-10 px-4 py-2.5" />
                  <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">
                    {t("pickerName")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">
                    {t("pickerSku")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-semibold tracking-wide text-ink-soft">
                    {t("pickerPrice")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-soft">
                      {t("pickerEmpty")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const key = itemKey(item.type, item.id);
                    const checked = selected.has(key);
                    return (
                      <tr
                        key={key}
                        className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-paper"
                        onClick={() => toggle(item)}
                      >
                        {/* Was a bare 20×20 `<input>` with no id, no label and
                            no aria-label — eight of them, so a screen-reader
                            user could not tell which product each one picked.
                            The wrapping label supplies both the name and a
                            44px target. */}
                        <td className="p-0">
                          <label
                            className="flex size-11 cursor-pointer items-center justify-center"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span className="sr-only">
                              {t("selectItemAria", { name: locale === "ar" ? item.nameAr : item.nameFr })}
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(item)}
                              className="size-5 rounded border-border accent-ink"
                            />
                          </label>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-ink">
                          {locale === "ar" ? item.nameAr : item.nameFr}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{item.sku}</td>
                        <td className="px-4 py-2.5 font-mono text-sm text-ink">{formatMoney(item.price)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {/* Labelling shop stock means printing twenty of the same pen label.
              The per-product route had a copies control and this one — the
              bulk route — printed exactly one of each. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="label-copies" className="text-xs font-semibold tracking-wide text-ink-soft">
              {t("copiesLabel")}
            </label>
            <input
              id="label-copies"
              type="number"
              min={1}
              max={50}
              value={copies}
              onChange={(event) => setCopies(Math.min(50, Math.max(1, Number(event.target.value) || 1)))}
              className="h-11 w-24 rounded-md border border-border px-3 font-mono text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/30"
            />
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={selectedItems.length === 0}
            className="inline-flex h-11 w-fit items-center gap-2 rounded-xs bg-ink px-5 text-sm font-medium text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)] disabled:pointer-events-none disabled:opacity-50"
          >
            <Printer className="size-4" aria-hidden="true" />
            {t("printAction")}
          </button>

          {/* How much paper this will consume, before the print dialog opens. */}
          <p className="flex h-11 items-center text-sm text-ink-soft">
            {printedLabels.length > 0 ? t("pageCount", { pages: pageCount, labels: printedLabels.length }) : null}
          </p>
        </div>

        <p className="text-xs text-ink-soft">{t("labelStockHint")}</p>
      </div>

      {printedLabels.length === 0 ? (
        <p className="hidden text-sm text-ink-soft print:block">{t("pickerEmpty")}</p>
      ) : (
        // Fixed physical dimensions, matching the per-product route's own
        // `40mm × 30mm`. This grid used to be `repeat(4, 1fr)` — a *fraction of
        // the printable width* — so a label's size, and with it the Code128
        // module width, changed with the paper and the margins, and the two
        // routes printed different-sized labels for the same product.
        <div
          className="grid justify-start gap-x-[4mm] gap-y-[4mm] pb-16 print:pb-0"
          style={{ gridTemplateColumns: "repeat(auto-fill, 40mm)", gridAutoRows: "30mm" }}
        >
          {printedLabels.map(({ item, copyIndex }) => (
            <div key={`${itemKey(item.type, item.id)}-${copyIndex}`} className="break-inside-avoid">
              <LabelCard
                sku={item.sku}
                name={locale === "ar" ? item.nameAr : item.nameFr}
                price={item.price}
                cutGuide
              />
            </div>
          ))}
        </div>
      )}

      <div className="hidden items-center justify-between border-t border-border pt-2 text-[9px] text-ink-soft print:fixed print:inset-x-0 print:bottom-0 print:flex">
        <span>{selectionLabel}</span>
        <span>{printDate}</span>
      </div>
    </div>
  );
}
