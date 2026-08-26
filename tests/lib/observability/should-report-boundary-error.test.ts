import { describe, expect, it } from "vitest";
import { shouldReportBoundaryError } from "@/src/lib/observability/should-report-boundary-error";

describe("shouldReportBoundaryError", () => {
  it("reports a client-side error, which nothing else has seen", () => {
    expect(shouldReportBoundaryError(new Error("Hydration failed"))).toBe(true);
  });

  it("does not re-report a server error onRequestError already captured", () => {
    const serverError = Object.assign(new Error("An error occurred in the Server Components render"), {
      digest: "1902731923",
    });

    expect(shouldReportBoundaryError(serverError)).toBe(false);
  });

  it("treats an empty digest as absent rather than as a server error", () => {
    expect(shouldReportBoundaryError(Object.assign(new Error("boom"), { digest: "" }))).toBe(true);
  });
});
