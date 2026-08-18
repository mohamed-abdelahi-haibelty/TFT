export type StockStatus = "in-stock" | "out-of-stock" | "backorder";

/** Customer-facing stock state — a positive quantity always reads "in stock"; at zero, backorder policy decides between "out of stock" and "out of stock, still orderable". */
export function deriveStockStatus(stockQty: number, allowBackorder: boolean): StockStatus {
  if (stockQty > 0) return "in-stock";
  return allowBackorder ? "backorder" : "out-of-stock";
}
