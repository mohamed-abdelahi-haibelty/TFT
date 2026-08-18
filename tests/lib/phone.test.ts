import { describe, expect, it } from "vitest";
import { isValidMauritanianPhone, normalizeMauritanianPhone } from "@/src/lib/phone";

describe("normalizeMauritanianPhone", () => {
  it("accepts an 8-digit local number starting with 2", () => {
    expect(normalizeMauritanianPhone("22345678")).toBe("22222345678");
  });

  it("accepts numbers starting with 3 or 4", () => {
    expect(normalizeMauritanianPhone("34567890")).toBe("22234567890");
    expect(normalizeMauritanianPhone("44567890")).toBe("22244567890");
  });

  it("strips spaces and punctuation before validating", () => {
    expect(normalizeMauritanianPhone("22 34 56 78")).toBe("22222345678");
    expect(normalizeMauritanianPhone("22-34-56-78")).toBe("22222345678");
  });

  it("accepts a full 222-prefixed 11-digit number", () => {
    expect(normalizeMauritanianPhone("22222345678")).toBe("22222345678");
  });

  it("accepts a +222-prefixed number", () => {
    expect(normalizeMauritanianPhone("+222 22 34 56 78")).toBe("22222345678");
  });

  it("accepts a 00222-prefixed number", () => {
    expect(normalizeMauritanianPhone("00222 22345678")).toBe("22222345678");
  });

  it("rejects a local number starting with 1", () => {
    expect(normalizeMauritanianPhone("12345678")).toBeNull();
  });

  it("rejects a number with the wrong digit count", () => {
    expect(normalizeMauritanianPhone("2234567")).toBeNull();
    expect(normalizeMauritanianPhone("223456789")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(normalizeMauritanianPhone("abcdefgh")).toBeNull();
  });
});

describe("isValidMauritanianPhone", () => {
  it("mirrors normalizeMauritanianPhone as a boolean", () => {
    expect(isValidMauritanianPhone("22345678")).toBe(true);
    expect(isValidMauritanianPhone("12345678")).toBe(false);
  });
});
