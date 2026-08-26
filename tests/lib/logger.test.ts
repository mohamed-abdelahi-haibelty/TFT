import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureExceptionMock = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

describe("logger Sentry routing", () => {
  beforeEach(() => {
    captureExceptionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not send a Sentry event for an expected taxonomy error code", async () => {
    const { logger } = await import("@/src/lib/logger");

    logger.error("Stock decrement failed", { code: "CONFLICT" });

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("sends a Sentry event for an INTERNAL error code", async () => {
    const { logger } = await import("@/src/lib/logger");

    logger.error("Unexpected database failure", { code: "INTERNAL" });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("sends a Sentry event when no error code is given (uncaught/unexpected errors)", async () => {
    const { logger } = await import("@/src/lib/logger");

    logger.error("Unhandled route handler error");

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("sends the caught error itself, preserving its stack", async () => {
    const { logger } = await import("@/src/lib/logger");

    // The real failure, thrown somewhere far from logger.ts.
    const original = new Error("Neon connection reset");

    logger.error("Unhandled route handler error", { path: "/api/orders" }, original);

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    // Identity, not equality: fabricating `new Error(message)` here used to
    // replace the real stack with logger.ts's own frame, which collapsed
    // unrelated failures into one Sentry group.
    expect(captureExceptionMock.mock.calls[0][0]).toBe(original);
  });

  it("falls back to a synthetic error when the caller has none", async () => {
    const { logger } = await import("@/src/lib/logger");

    logger.error("Invariant violated: order total is negative");

    const captured = captureExceptionMock.mock.calls[0][0] as Error;
    expect(captured).toBeInstanceOf(Error);
    expect(captured.message).toBe("Invariant violated: order total is negative");
  });

  it("still suppresses an expected taxonomy error even when given a real error", async () => {
    const { logger } = await import("@/src/lib/logger");

    logger.error("Stock decrement failed", { code: "CONFLICT" }, new Error("boom"));

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("does not send Sentry events for non-error log levels", async () => {
    const { logger } = await import("@/src/lib/logger");

    logger.warn("Something worth noting");
    logger.info("Routine info");
    logger.debug("Debug detail");

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
