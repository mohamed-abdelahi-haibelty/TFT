import { getMessages } from "next-intl/server";

/**
 * Builds the message subset a `NextIntlClientProvider` should serialize.
 *
 * `NextIntlClientProvider` rendered without a `messages` prop defaults to
 * `await getMessages()` — the *entire* catalog. With one provider at the root
 * that meant every storefront page shipped all 621 `admin.*` keys and every
 * `*Errors` namespace in its flight payload: ~34k characters of JSON, roughly
 * 56 KB on the wire in Arabic, to render a page whose client components use
 * about a sixth of it. On the mobile connections PRODUCT.md targets that is
 * real time, spent on strings nobody in the storefront can ever see.
 *
 * So each route group declares what its own client components actually call
 * `useTranslations` on, and gets only that. Server components are unaffected
 * either way — `getTranslations` reads the full catalog on the server and
 * sends only the rendered output.
 *
 * next-intl exports no `pick` helper of its own, hence this.
 *
 * Note that nested providers *replace* rather than merge, so a group's list
 * must be complete for its whole subtree — adding a `useTranslations` call to
 * a client component means adding its namespace here, or it throws
 * `MISSING_MESSAGE` at runtime.
 */
export async function pickMessages(namespaces: readonly string[]) {
  const all = await getMessages();
  return Object.fromEntries(namespaces.filter((namespace) => namespace in all).map((namespace) => [namespace, all[namespace]]));
}

/**
 * Namespaces reachable from a client component below `app/[locale]/` but
 * outside a route group — today just `error.tsx`.
 */
export const ROOT_MESSAGE_NAMESPACES = ["common", "errors", "notFound"] as const;

/** Namespaces the storefront's client components use. See components/store/*. */
export const STORE_MESSAGE_NAMESPACES = [
  "common",
  "store",
  "product",
  "box",
  "cart",
  "checkout",
  "track",
  "errors",
] as const;

/** Admin ships one namespace, but it is by far the largest one. */
export const ADMIN_MESSAGE_NAMESPACES = ["admin", "common", "errors"] as const;
