import { formatMoney } from "@/src/lib/money";

export function LabelCard({
  sku,
  name,
  price,
  cutGuide = false,
}: {
  sku: string;
  name: string;
  price: number;
  /**
   * Keep the hairline when printing. True for the A4 sheet, where labels are
   * cut out by hand and previously printed as barcodes floating on blank paper
   * with nothing to cut along. False for the per-product route, whose `@page`
   * *is* one 40×30mm label on precut stock — there a printed rectangle would
   * just be ink on the label's own edge.
   */
  cutGuide?: boolean;
}) {
  return (
    // `dir` is deliberately NOT set on the card: forcing LTR here also forced
    // it on an Arabic product name, risking bidi reordering on any name that
    // mixes Arabic with Latin or digits. Only the SKU/price row below needs it.
    <div
      className={`flex h-full w-full flex-col items-center justify-between gap-1 overflow-hidden rounded-md border border-border bg-white p-2 text-center print:rounded-none print:p-1.5 ${
        cutGuide ? "print:border-dashed" : "print:border-0"
      }`}
    >
      <p className="line-clamp-2 w-full text-[8px] leading-tight font-semibold text-ink">{name}</p>
      <div className="aspect-3/1 max-h-[60%] w-full bg-paper print:bg-transparent">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated on the fly by our own immutable-cached API route, not a static asset */}
        <img
          src={`/api/barcode/${encodeURIComponent(sku)}`}
          alt={sku}
          className="h-full w-full object-contain"
        />
      </div>
      <div dir="ltr" className="flex w-full items-baseline justify-between gap-1">
        <span className="font-mono text-[6px] text-ink-soft">{sku}</span>
        <span className="font-mono text-[9px] font-semibold text-ink">{formatMoney(price)}</span>
      </div>
    </div>
  );
}
