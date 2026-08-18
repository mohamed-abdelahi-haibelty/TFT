import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
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
  const session = await auth.api.getSession({ headers: await headers() });
  return evaluateSession(session, { role }, await gateMessages());
}

/**
 * The gate every admin action goes through. Admin passes unconditionally;
 * staff passes only on a granted key. Enforced here, in the service layer,
 * not in the UI — the sidebar and the row buttons hide what an account
 * cannot do, but hiding is a courtesy and this is the rule.
 */
export async function requirePermission(permission: Permission): Promise<ServiceResult<AuthUser>> {
  const session = await auth.api.getSession({ headers: await headers() });
  return evaluateSession(session, { permission }, await gateMessages());
}

/** Non-throwing check against an already-resolved actor, for the UI's own use. */
export function can(actor: PermissionHolder, permission: Permission): boolean {
  return hasPermission(actor, permission);
}
