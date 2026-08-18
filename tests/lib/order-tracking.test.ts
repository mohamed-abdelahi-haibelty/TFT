import { describe, expect, it } from "vitest";
import { buildTrackingSteps, isTerminalCancelledStatus } from "@/src/lib/order-tracking";

describe("buildTrackingSteps", () => {
  it("marks only 'received' reached for a pending bus order", () => {
    const receivedAt = new Date("2026-01-05T10:00:00Z");
    const steps = buildTrackingSteps("bus", "pending", { pending: receivedAt });

    expect(steps.map((step) => step.key)).toEqual(["received", "confirmed", "preparing", "shipped", "arrived", "delivered"]);
    expect(steps[0]).toEqual({ key: "received", reached: true, reachedAt: receivedAt });
    for (const step of steps.slice(1)) {
      expect(step.reached).toBe(false);
      expect(step.reachedAt).toBeNull();
    }
  });

  it("marks every step up to and including the current bus status reached, with its date", () => {
    const receivedAt = new Date("2026-01-05T10:00:00Z");
    const shippedAt = new Date("2026-01-06T12:00:00Z");
    const steps = buildTrackingSteps("bus", "shipped", { pending: receivedAt, confirmed: receivedAt, preparing: receivedAt, shipped: shippedAt });

    const byKey = Object.fromEntries(steps.map((step) => [step.key, step]));
    expect(byKey.received.reached).toBe(true);
    expect(byKey.confirmed.reached).toBe(true);
    expect(byKey.preparing.reached).toBe(true);
    expect(byKey.shipped.reached).toBe(true);
    expect(byKey.shipped.reachedAt).toEqual(shippedAt);
    expect(byKey.arrived.reached).toBe(false);
    expect(byKey.arrived.reachedAt).toBeNull();
    expect(byKey.delivered.reached).toBe(false);
  });

  it("uses the pickup sequence (no shipped/arrived) for NDB orders", () => {
    const steps = buildTrackingSteps("pickup", "ready", { pending: new Date(), ready: new Date() });
    expect(steps.map((step) => step.key)).toEqual(["received", "confirmed", "preparing", "ready", "delivered"]);
    expect(steps.find((step) => step.key === "ready")?.reached).toBe(true);
    expect(steps.find((step) => step.key === "delivered")?.reached).toBe(false);
  });

  it("marks the whole sequence reached once delivered", () => {
    const steps = buildTrackingSteps("bus", "delivered", {});
    expect(steps.every((step) => step.reached)).toBe(true);
  });

  it("leaves every step but 'received' unreached when the status isn't in the sequence (defensive)", () => {
    const steps = buildTrackingSteps("bus", "cancelled", {});
    expect(steps[0]).toMatchObject({ key: "received", reached: true });
    expect(steps.slice(1).every((step) => !step.reached)).toBe(true);
  });
});

describe("isTerminalCancelledStatus", () => {
  it("is true for cancelled and voided", () => {
    expect(isTerminalCancelledStatus("cancelled")).toBe(true);
    expect(isTerminalCancelledStatus("voided")).toBe(true);
  });

  it("is false for every in-progress status", () => {
    for (const status of ["pending", "confirmed", "preparing", "shipped", "arrived", "ready", "delivered"] as const) {
      expect(isTerminalCancelledStatus(status)).toBe(false);
    }
  });
});
