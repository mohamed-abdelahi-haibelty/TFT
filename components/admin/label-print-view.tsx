"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { LabelCard } from "@/components/admin/label-card";

export type PrintLabelTarget = { sku: string; name: string; price: number };

export function LabelPrintView({ targets }: { targets: PrintLabelTarget[] }) {
  const t = useTranslations("admin.labels");
  const [copies, setCopies] = useState(1);

  const labels = targets.flatMap((target) =>
    Array.from({ length: copies }, (_, copyIndex) => ({ ...target, copyIndex })),
  );

  return (
    <div className="flex flex-col gap-6">
      <style>{"@page { size: 40mm 30mm; margin: 0; }"}</style>

      <div className="flex flex-wrap items-end gap-4 print:hidden">
        <label className="flex flex-col gap-1.5 text-sm text-ink">
          {t("copiesLabel")}
          <input
            type="number"
            min={1}
            max={50}
            value={copies}
            onChange={(event) => {
              const next = Number(event.target.value);
              setCopies(Number.isFinite(next) ? Math.min(50, Math.max(1, Math.trunc(next))) : 1);
            }}
            className="h-10 w-24 rounded-md border border-border px-3 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/30"
          />
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-xs bg-ink px-5 text-sm font-medium text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)]"
        >
          <Printer className="size-4" aria-hidden="true" />
          {t("printAction")}
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,40mm)] items-start justify-center gap-4 print:block print:gap-0">
        {labels.map((label, index) => (
          <div
            key={`${label.sku}-${label.copyIndex}`}
            style={{ width: "40mm", height: "30mm" }}
            className={index < labels.length - 1 ? "break-inside-avoid print:break-after-page" : "break-inside-avoid"}
          >
            <LabelCard sku={label.sku} name={label.name} price={label.price} />
          </div>
        ))}
      </div>
    </div>
  );
}
