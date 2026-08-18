import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import { accounts, sessions, users } from "@/src/db/schema";
import { auth } from "@/src/lib/auth";
import type { Permission } from "@/src/lib/permissions";
import { evaluateSession } from "@/src/services/authz";

const messages = { unauthorized: "unauthorized", forbidden: "forbidden" };

async function createSignedInUser(role: "admin" | "staff", permissions: Permission[] = []) {
  const email = `authz-test-${role}-${Date.now()}@example.com`;
  const password = "correct-horse-battery";

  const [user] = await db
    .insert(users)
    .values({ name: `Test ${role}`, email, emailVerified: true, role, permissions })
    .returning({ id: users.id });

  await db.insert(accounts).values({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: await hashPassword(password),
  });

  const { headers: signInHeaders } = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    returnHeaders: true,
  });

  const cookie = signInHeaders
    .getSetCookie()
    .find((value) => value.includes("session_token"));
  if (!cookie) throw new Error("Sign-in did not return a session cookie");

  const session = await auth.api.getSession({
    headers: new Headers({ cookie: cookie.split(";")[0] }),
  });

  return { userId: user.id, session };
}

describe("requireUser role enforcement (evaluateSession)", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(sessions).where(eq(sessions.userId, id));
      await db.delete(accounts).where(eq(accounts.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("rejects an unauthenticated request", () => {
    const result = evaluateSession(null, { role: "admin" }, messages);
    expect(result).toEqual({ ok: false, error: { code: "UNAUTHORIZED", message: "unauthorized" } });
  });

  it("rejects a real staff session against an admin-only gate", async () => {
    const { userId, session } = await createSignedInUser("staff");
    createdUserIds.push(userId);

    expect(session?.user.role).toBe("staff");

    const result = evaluateSession(session, { role: "admin" }, messages);
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN", message: "forbidden" } });
  });

  it("accepts a real admin session against an admin-only gate", async () => {
    const { userId, session } = await createSignedInUser("admin");
    createdUserIds.push(userId);

    expect(session?.user.role).toBe("admin");

    const result = evaluateSession(session, { role: "admin" }, messages);
    expect(result.ok).toBe(true);
  });

  it("accepts any authenticated role when no role is required", async () => {
    const { userId, session } = await createSignedInUser("staff");
    createdUserIds.push(userId);

    const result = evaluateSession(session, {}, messages);
    expect(result.ok).toBe(true);
  });
});

describe("permission enforcement against a real session", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(sessions).where(eq(sessions.userId, id));
      await db.delete(accounts).where(eq(accounts.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("carries the granted permissions on the session", async () => {
    const { userId, session } = await createSignedInUser("staff", ["orders.view", "pos.use"]);
    createdUserIds.push(userId);

    const result = evaluateSession(session, {}, messages);
    if (!result.ok) throw new Error("expected an authenticated staff session");

    // The array survives Better Auth's `string[]` additional field and the
    // Drizzle `text[]` column without being stringified on the way through.
    expect(result.data.permissions).toEqual(["catalog.view", "orders.view", "pos.use"]);
  });

  it("accepts a staff session on a granted permission", async () => {
    const { userId, session } = await createSignedInUser("staff", ["inventory.view", "inventory.adjust"]);
    createdUserIds.push(userId);

    expect(evaluateSession(session, { permission: "inventory.adjust" }, messages).ok).toBe(true);
  });

  it("rejects a staff session on a permission it was not granted", async () => {
    const { userId, session } = await createSignedInUser("staff", ["orders.view", "orders.manage"]);
    createdUserIds.push(userId);

    expect(evaluateSession(session, { permission: "orders.cancel" }, messages)).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "forbidden" },
    });
  });

  it("rejects a staff session holding nothing", async () => {
    const { userId, session } = await createSignedInUser("staff");
    createdUserIds.push(userId);

    expect(evaluateSession(session, { permission: "orders.view" }, messages).ok).toBe(false);
  });

  it("accepts an admin session on every permission, its own column being empty", async () => {
    const { userId, session } = await createSignedInUser("admin");
    createdUserIds.push(userId);

    for (const permission of ["dashboard.view", "users.manage", "settings.manage", "pos.void"] as const) {
      expect(evaluateSession(session, { permission }, messages).ok, permission).toBe(true);
    }
  });

  it("rejects a deactivated account before any permission is consulted", async () => {
    const { userId, session } = await createSignedInUser("staff", ["orders.view"]);
    createdUserIds.push(userId);

    // Granted and passing, right up until the account is switched off.
    expect(evaluateSession(session, { permission: "orders.view" }, messages).ok).toBe(true);

    const deactivated = session
      ? { ...session, user: { ...session.user, isActive: false } }
      : null;

    expect(evaluateSession(deactivated, { permission: "orders.view" }, messages)).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "unauthorized" },
    });
  });
});
