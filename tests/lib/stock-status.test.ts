import { describe, expect, it } from "vitest";
import { deriveStockStatus } from "@/src/lib/stock-status";

describe("deriveStockStatus", () => {
  it("is in-stock for any positive quantity, regardless of backorder policy", () => {
    expect(deriveStockStatus(5, false)).toBe("in-stock");
    expect(deriveStockStatus(1, true)).toBe("in-stock");
  });

  it("is out-of-stock at zero when backorder is not allowed", () => {
    expect(deriveStockStatus(0, false)).toBe("out-of-stock");
  });

  it("is backorder at zero when backorder is allowed", () => {
    expect(deriveStockStatus(0, true)).toBe("backorder");
  });
});
