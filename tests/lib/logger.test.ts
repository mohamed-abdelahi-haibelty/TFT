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

  it("does not send Sentry events for non-error log levels", async () => {
    const { logger } = await import("@/src/lib/logger");

    logger.warn("Something worth noting");
    logger.info("Routine info");
    logger.debug("Debug detail");

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
