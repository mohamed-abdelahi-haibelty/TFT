import { beforeEach, describe, expect, it, vi } from "vitest";

const getCookie = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: getCookie }),
}));

const KEY = "phc_test_project_key";

describe("getAnalyticsDistinctId", () => {
  beforeEach(() => {
    vi.resetModules();
    getCookie.mockReset();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = KEY;
  });

  async function subject() {
    const mod = await import("@/src/lib/analytics-identity");
    return mod.getAnalyticsDistinctId();
  }

  it("returns the id posthog-js already stamped on this visitor's client events", async () => {
    getCookie.mockReturnValue({
      value: JSON.stringify({ distinct_id: "0198f2ab-cafe-7000-8000-abcdefabcdef" }),
    });

    await expect(subject()).resolves.toBe("0198f2ab-cafe-7000-8000-abcdefabcdef");
    // Named after the project key — this is what makes the server event land on
    // the same person as the product view that preceded it.
    expect(getCookie).toHaveBeenCalledWith(`ph_${KEY}_posthog`);
  });

  it("reads a URL-encoded cookie, which is how it arrives in practice", async () => {
    getCookie.mockReturnValue({
      value: encodeURIComponent(JSON.stringify({ distinct_id: "visitor-42" })),
    });

    await expect(subject()).resolves.toBe("visitor-42");
  });

  it("falls back for a first-time visitor with no cookie yet", async () => {
    getCookie.mockReturnValue(undefined);

    await expect(subject()).resolves.toBe("server");
  });

  it("never throws on a malformed cookie — this sits on the order path", async () => {
    getCookie.mockReturnValue({ value: "{not json" });

    await expect(subject()).resolves.toBe("server");
  });

  it("survives cookies() itself throwing outside a request scope", async () => {
    getCookie.mockImplementation(() => {
      throw new Error("`cookies` was called outside a request scope");
    });

    await expect(subject()).resolves.toBe("server");
  });

  it("does not read cookies at all when PostHog is not configured", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;

    await expect(subject()).resolves.toBe("server");
    expect(getCookie).not.toHaveBeenCalled();
  });
});
