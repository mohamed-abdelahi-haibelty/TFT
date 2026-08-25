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
   * cut out by hand and need something to cut along. False for the
   * per-product route, whose `@page` *is* one 40×30mm label on precut stock —
   * there a printed rectangle would just be ink on the label's own edge.
   */
  cutGuide?: boolean;
}) {
  return (
    // `dir` is deliberately NOT set on the card: forcing LTR here also forced
    // it on an Arabic product name, risking bidi reordering on any name that
    // mixes Arabic with Latin or digits. Only the SKU/price row below needs it.
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-md border border-border bg-white p-2 text-center print:rounded-none print:p-1.5 ${
        cutGuide ? "print:border-dashed" : "print:border-0"
      }`}
    >
      <p className="line-clamp-2 w-full text-[8px] leading-tight font-semibold text-ink">{name}</p>
      <span dir="ltr" className="font-mono text-[10px] font-semibold tracking-wide text-ink">
        {sku}
      </span>
      <span className="font-mono text-[9px] font-semibold text-ink">{formatMoney(price)}</span>
    </div>
  );
}
