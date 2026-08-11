import { afterEach, describe, expect, it, vi } from "vitest";

describe("env validation", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("throws a clear error when DATABASE_URL is missing", async () => {
    vi.resetModules();
    delete process.env.DATABASE_URL;

    await expect(import("@/src/lib/env")).rejects.toThrow(/DATABASE_URL/);
  });

  it("loads env when DATABASE_URL is present", async () => {
    vi.resetModules();
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

    const { env } = await import("@/src/lib/env");

    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
  });
});
