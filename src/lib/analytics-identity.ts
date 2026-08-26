import { cookies } from "next/headers";

/**
 * posthog-js persists its anonymous id in a cookie named after the project
 * key, holding a JSON blob whose `distinct_id` is the same id it stamps on
 * every client-side event.
 */
function cookieName(key: string): string {
  return `ph_${key}_posthog`;
}

/**
 * The distinct id to attribute a server-side event to.
 *
 * Server events used to default to the literal string `"server"`, which put
 * every one of them on a single phantom person. That made the funnel this
 * project actually cares about — `product_viewed` → `added_to_cart` →
 * `order_submitted` — impossible to build, because the last step belonged to
 * nobody who had taken the first two. Reading the id posthog-js already set
 * stitches the server events onto the same person.
 *
 * Reads a cookie and nothing else — **no database round trip**. That matters
 * more here than it looks: on Neon's Free plan a single query opens a
 * five-minute compute window, so an "enrich the event with the customer" step
 * would be the most expensive line in the analytics layer.
 *
 * `cookies()` is a request API, so this only ever runs from route handlers and
 * server actions, which are dynamic already. Never call it from a page body or
 * inside a `use cache` scope — that would force the route dynamic and wake the
 * database once per visitor, undoing the whole task-17 caching pass.
 */
export async function getAnalyticsDistinctId(): Promise<string> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return "server";

  try {
    const raw = (await cookies()).get(cookieName(key))?.value;
    if (!raw) return "server";

    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    const distinctId =
      parsed && typeof parsed === "object"
        ? (parsed as { distinct_id?: unknown }).distinct_id
        : undefined;

    return typeof distinctId === "string" && distinctId.length > 0 ? distinctId : "server";
  } catch {
    // A malformed or absent cookie is the ordinary case for a first-time
    // visitor with analytics blocked. Never let it reach the caller — this
    // sits on the order path.
    return "server";
  }
}
