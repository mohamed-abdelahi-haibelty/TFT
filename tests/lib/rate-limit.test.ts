import { describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@/src/lib/rate-limit";

describe("checkRateLimit", () => {
  it("allows up to the limit within the window, then blocks", () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const a = `test-a-${Math.random()}`;
    const b = `test-b-${Math.random()}`;
    expect(checkRateLimit(a, 1, 60_000)).toBe(true);
    expect(checkRateLimit(a, 1, 60_000)).toBe(false);
    expect(checkRateLimit(b, 1, 60_000)).toBe(true);
  });

  it("resets once the window elapses", () => {
    vi.useFakeTimers();
    try {
      const key = `test-reset-${Math.random()}`;
      expect(checkRateLimit(key, 1, 1000)).toBe(true);
      expect(checkRateLimit(key, 1, 1000)).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(checkRateLimit(key, 1, 1000)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
