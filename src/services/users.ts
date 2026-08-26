import { hashPassword } from "better-auth/crypto";
import { asc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, withTransaction } from "@/src/db/client";
import { accounts, sessions, users } from "@/src/db/schema";
import { isUniqueViolation } from "@/src/lib/db-errors";
import type { ServiceResult } from "@/src/lib/errors";
import {
  type Permission,
  PERMISSIONS,
  normalizeGrantedPermissions,
  parsePermissions,
} from "@/src/lib/permissions";

/** What the editor and the access column show: the stored set, closed the same way the gate closes it, minus anything not grantable. */
function displayedPermissions(raw: unknown): Permission[] {
  return normalizeGrantedPermissions(parsePermissions(raw));
}
import { requirePermission } from "@/src/services/authz";

export type StaffListItem = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  isActive: boolean;
  permissions: Permission[];
  createdAt: Date;
};

const createStaffSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(128),
});

export async function listUsers(): Promise<ServiceResult<StaffListItem[]>> {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) return auth;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      permissions: users.permissions,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));

  return {
    ok: true,
    data: rows.map((row) => ({ ...row, permissions: displayedPermissions(row.permissions) })),
  };
}

export async function createStaff(
  input: unknown,
): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("authErrors");
  const parsed = createStaffSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: t("invalidStaffInput") } };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (existing) {
    return { ok: false, error: { code: "CONFLICT", message: t("emailTaken") } };
  }

  // A user without its credential row cannot sign in and cannot be invited
  // again (the e-mail is taken), so the two writes are one unit. This used to
  // be a `DELETE` in a catch block standing in for a rollback.
  const password = await hashPassword(parsed.data.password);

  try {
    const created = await withTransaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: parsed.data.name,
          email: parsed.data.email,
          emailVerified: true,
          role: "staff",
          isActive: true,
        })
        .returning({ id: users.id });

      await tx.insert(accounts).values({
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password,
      });

      return user;
    });

    return { ok: true, data: { id: created.id } };
  } catch (error) {
    // The existence check above is not atomic; two invites for the same
    // address raced into a raw 23505 instead of "this e-mail is already used".
    if (isUniqueViolation(error, "users_email_unique")) {
      return { ok: false, error: { code: "CONFLICT", message: t("emailTaken") } };
    }
    throw error;
  }
}

export async function deactivateUser(targetId: string): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("authErrors");
  if (targetId === auth.data.id) {
    return { ok: false, error: { code: "CONFLICT", message: t("cannotDeactivateSelf") } };
  }

  await db.update(users).set({ isActive: false }).where(eq(users.id, targetId));
  await db.delete(sessions).where(eq(sessions.userId, targetId));

  return { ok: true, data: { id: targetId } };
}

export async function reactivateUser(targetId: string): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) return auth;

  await db.update(users).set({ isActive: true }).where(eq(users.id, targetId));

  return { ok: true, data: { id: targetId } };
}

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export async function resetUserPassword(
  targetId: string,
  input: unknown,
): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("authErrors");
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: t("invalidPassword") } };
  }

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, targetId))
    .limit(1);

  if (!account) {
    return { ok: false, error: { code: "NOT_FOUND", message: t("userNotFound") } };
  }

  await db
    .update(accounts)
    .set({ password: await hashPassword(parsed.data.password) })
    .where(eq(accounts.id, account.id));
  await db.delete(sessions).where(eq(sessions.userId, targetId));

  return { ok: true, data: { id: targetId } };
}

export async function getStaffMember(targetId: string): Promise<ServiceResult<StaffListItem>> {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("authErrors");

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      permissions: users.permissions,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!row) {
    return { ok: false, error: { code: "NOT_FOUND", message: t("userNotFound") } };
  }

  return { ok: true, data: { ...row, permissions: displayedPermissions(row.permissions) } };
}

const setPermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
});

/**
 * Replaces a staff member's granted set. The submitted list is filtered to
 * the grantable keys and closed over its prerequisites
 * (`normalizeGrantedPermissions`), so a payload that names `orders.cancel`
 * without `orders.view` stores the coherent set rather than the literal one,
 * and a payload naming `users.manage` stores nothing of the sort.
 *
 * An `admin` target is refused outright: the owner's access is not a list to
 * be edited, and treating it as one is how an owner locks themselves out.
 */
export async function setStaffPermissions(
  targetId: string,
  input: unknown,
): Promise<ServiceResult<{ id: string; permissions: Permission[] }>> {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("authErrors");
  const parsed = setPermissionsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: t("invalidPermissions") } };
  }

  const [target] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!target) {
    return { ok: false, error: { code: "NOT_FOUND", message: t("userNotFound") } };
  }

  if (target.role === "admin") {
    return { ok: false, error: { code: "CONFLICT", message: t("cannotEditAdminPermissions") } };
  }

  const permissions = normalizeGrantedPermissions(parsed.data.permissions);

  await db.update(users).set({ permissions }).where(eq(users.id, targetId));

  return { ok: true, data: { id: targetId, permissions } };
}
