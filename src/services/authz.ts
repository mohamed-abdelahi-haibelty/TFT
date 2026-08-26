import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { auth } from "@/src/lib/auth";
import type { ServiceResult } from "@/src/lib/errors";
import {
  type Permission,
  type PermissionHolder,
  expandPermissions,
  hasPermission,
  parsePermissions,
} from "@/src/lib/permissions";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  permissions: Permission[];
};

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

type GateMessages = { unauthorized: string; forbidden: string };

/**
 * Pure gate over an already-resolved session, split out from `requireUser` /
 * `requirePermission` so both can be exercised directly against a real
 * Better Auth session without needing a Next.js request scope
 * (`next/headers`).
 *
 * `role` is the coarse gate kept for the handful of places that genuinely
 * mean "any signed-in operator" (the admin shell, the login redirect);
 * `permission` is the gate every service action uses. Passing both requires
 * both.
 */
export function evaluateSession(
  session: Session,
  gate: { role?: "admin" | "staff"; permission?: Permission },
  messages: GateMessages,
): ServiceResult<AuthUser> {
  if (!session || !session.user.isActive) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: messages.unauthorized } };
  }

  const sessionUser = session.user as unknown as Omit<AuthUser, "permissions"> & {
    permissions?: unknown;
  };

  const user: AuthUser = {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
    role: sessionUser.role,
    // Parsed, then closed over its prerequisites again on the way in. The
    // writer already stores a closed set, so this normally changes nothing —
    // it is here so a row written by a migration, a fixture, or a hand-run
    // `UPDATE` still gates coherently instead of half-working.
    //
    // An admin's stored array is empty by design; `hasPermission` answers
    // true for that role without consulting it at all.
    permissions: expandPermissions(parsePermissions(sessionUser.permissions)),
  };

  if (gate.role && user.role !== gate.role) {
    return { ok: false, error: { code: "FORBIDDEN", message: messages.forbidden } };
  }

  if (gate.permission && !hasPermission(user, gate.permission)) {
    return { ok: false, error: { code: "FORBIDDEN", message: messages.forbidden } };
  }

  return { ok: true, data: user };
}

/**
 * The session read, deduped for the lifetime of one request.
 *
 * Every gate below resolves the session independently, and a single admin
 * render goes through several of them — the protected layout, the page, and
 * then one per service call. The POS page alone did it five times, which on
 * `neon-http` is five sequential session+user round trips before any real work
 * starts. React's `cache()` collapses those into one, the same way
 * `getStorefrontProductBySlug` dedupes `generateMetadata` against the page
 * body.
 *
 * This is NOT the `session.cookieCache` that `src/lib/auth.ts` deliberately
 * leaves off, and it does not weaken what that comment protects: the scope
 * here is a single request, so the user row is still re-read on the very next
 * one and revoking a permission still takes effect immediately.
 */
const getRequestSession = cache(async (): Promise<Session> => {
  const session = await auth.api.getSession({ headers: await headers() });

  // Attaching the actor here rather than at each gate costs nothing: this
  // function is already the one place the session is read, and it is already
  // deduped, so no extra database round trip is involved — which matters,
  // because on Neon's Free plan one stray query opens a five-minute compute
  // window.
  //
  // Id and role only. Name and email are exactly the personal data
  // `sendDefaultPii: false` and the event scrubber exist to keep out of Sentry,
  // and neither adds anything to a stack trace that the id does not.
  if (session?.user) {
    Sentry.setUser({ id: session.user.id, role: session.user.role });
  }

  return session;
});

async function gateMessages(): Promise<GateMessages> {
  const t = await getTranslations("authErrors");
  return { unauthorized: t("unauthorized"), forbidden: t("forbidden") };
}

/**
 * "Is anyone signed in?" — and, with an argument, "is it this role?". Reads
 * and writes gate on `requirePermission` instead; this stays for the shell,
 * the login page, and the pages that only need the signed-in identity.
 */
export async function requireUser(role?: "admin" | "staff"): Promise<ServiceResult<AuthUser>> {
  const session = await getRequestSession();
  return evaluateSession(session, { role }, await gateMessages());
}

/**
 * The gate every admin action goes through. Admin passes unconditionally;
 * staff passes only on a granted key. Enforced here, in the service layer,
 * not in the UI — the sidebar and the row buttons hide what an account
 * cannot do, but hiding is a courtesy and this is the rule.
 */
export async function requirePermission(permission: Permission): Promise<ServiceResult<AuthUser>> {
  const session = await getRequestSession();
  return evaluateSession(session, { permission }, await gateMessages());
}

/** Non-throwing check against an already-resolved actor, for the UI's own use. */
export function can(actor: PermissionHolder, permission: Permission): boolean {
  return hasPermission(actor, permission);
}
