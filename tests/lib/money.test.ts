import { describe, expect, it } from "vitest";
import { formatMoney } from "@/src/lib/money";

describe("formatMoney", () => {
  it("groups thousands with Western digits and appends the currency code", () => {
    expect(formatMoney(1500)).toBe("1,500 MRU");
  });

  it("formats small integers without grouping", () => {
    expect(formatMoney(50)).toBe("50 MRU");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toBe("0 MRU");
  });
});
