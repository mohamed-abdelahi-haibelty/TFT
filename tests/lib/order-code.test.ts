import { describe, expect, it } from "vitest";
import { formatOrderCode, orderCodeMonthPrefix } from "@/src/lib/order-code";

describe("orderCodeMonthPrefix", () => {
  it("formats a two-digit year and month from a UTC date", () => {
    expect(orderCodeMonthPrefix(new Date(Date.UTC(2026, 2, 15)))).toBe("TFT-2603");
  });

  it("pads a single-digit month", () => {
    expect(orderCodeMonthPrefix(new Date(Date.UTC(2026, 0, 1)))).toBe("TFT-2601");
  });
});

describe("formatOrderCode", () => {
  it("pads the sequence to three digits", () => {
    expect(formatOrderCode(new Date(Date.UTC(2026, 2, 15)), 1)).toBe("TFT-2603-001");
    expect(formatOrderCode(new Date(Date.UTC(2026, 2, 15)), 42)).toBe("TFT-2603-042");
  });

  it("does not truncate a sequence beyond three digits", () => {
    expect(formatOrderCode(new Date(Date.UTC(2026, 2, 15)), 1234)).toBe("TFT-2603-1234");
  });
});
