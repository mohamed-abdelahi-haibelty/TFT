import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "@/src/lib/observability/scrub-sentry-event";

describe("scrubSentryEvent", () => {
  it("strips an 8-digit Mauritanian phone number from a message string", () => {
    const scrubbed = scrubSentryEvent({
      message: "Order failed for customer at 22345678, please retry",
    });

    expect(scrubbed.message).not.toContain("22345678");
    expect(scrubbed.message).toBe("Order failed for customer at [redacted], please retry");
  });

  it("redacts customer_phone and phone fields regardless of value", () => {
    const scrubbed = scrubSentryEvent({
      extra: { customer_phone: "22345678", phone: "36001122", order_code: "PPT-2601-001" },
    });

    expect(scrubbed.extra).toEqual({
      customer_phone: "[redacted]",
      phone: "[redacted]",
      order_code: "PPT-2601-001",
    });
  });

  it("scrubs phone numbers nested inside breadcrumbs", () => {
    const scrubbed = scrubSentryEvent({
      breadcrumbs: [
        { category: "order", message: "Contacted 44556677 via WhatsApp", data: { phone: "44556677" } },
      ],
    });

    const [breadcrumb] = scrubbed.breadcrumbs as Array<{ message: string; data: { phone: string } }>;
    expect(breadcrumb.message).toBe("Contacted [redacted] via WhatsApp");
    expect(breadcrumb.data.phone).toBe("[redacted]");
  });

  it("leaves non-phone-shaped data untouched", () => {
    const scrubbed = scrubSentryEvent({
      extra: { order_total: 4500, items_count: 3 },
    });

    expect(scrubbed.extra).toEqual({ order_total: 4500, items_count: 3 });
  });
});
