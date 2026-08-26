import { describe, expect, it } from "vitest";
import {
  scrubAnalyticsProperties,
  scrubSentryEvent,
} from "@/src/lib/observability/scrub-sentry-event";

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

describe("scrubAnalyticsProperties", () => {
  it("strips a phone key from a PostHog property bag", () => {
    const scrubbed = scrubAnalyticsProperties({
      code: "TFT-2601-0007",
      customer_phone: "27139094",
      total: 4500,
    });

    expect(scrubbed.customer_phone).toBe("[redacted]");
    // The order code is explicitly allowed and must survive untouched.
    expect(scrubbed.code).toBe("TFT-2601-0007");
    expect(scrubbed.total).toBe(4500);
  });

  it("redacts a bare 8-digit number wherever autocapture picked it up", () => {
    const scrubbed = scrubAnalyticsProperties({
      $el_text: "Commander pour 27139094",
      $current_url: "https://tft.example/fr/checkout",
    });

    expect(scrubbed.$el_text).toBe("Commander pour [redacted]");
    expect(scrubbed.$current_url).toBe("https://tft.example/fr/checkout");
  });

  it("reaches nested autocapture element chains", () => {
    const scrubbed = scrubAnalyticsProperties({
      $elements: [{ attr__value: "27139094" }, { attr__value: "safe" }],
    });

    expect(scrubbed.$elements).toEqual([{ attr__value: "[redacted]" }, { attr__value: "safe" }]);
  });
});
