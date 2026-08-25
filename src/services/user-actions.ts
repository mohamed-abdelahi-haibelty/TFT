"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import type { ServiceResult } from "@/src/lib/errors";
import { PERMISSIONS, type Permission } from "@/src/lib/permissions";
import {
  createStaff,
  deactivateUser,
  reactivateUser,
  resetUserPassword,
  setStaffPermissions,
} from "@/src/services/users";

async function revalidateUsersPage() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/users`);
}

export async function createStaffAction(
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await createStaff({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.ok) return result;

  await revalidateUsersPage();
  return { ok: true, data: null };
}

/**
 * Returns its result. Deactivating an account also kills its sessions, so
 * "did that work?" is a security question — and this used to answer it by
 * showing nothing at all whether it succeeded or failed.
 */
export async function toggleUserActiveAction(
  userId: string,
  nextActive: boolean,
  _prev: ServiceResult<null> | null,
  _formData: FormData,
): Promise<ServiceResult<null>> {
  const result = nextActive ? await reactivateUser(userId) : await deactivateUser(userId);
  if (!result.ok) return result;

  await revalidateUsersPage();
  return { ok: true, data: null };
}

export async function resetPasswordAction(
  userId: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await resetUserPassword(userId, { password: formData.get("password") });
  if (!result.ok) return result;

  return { ok: true, data: null };
}

export async function setStaffPermissionsAction(
  userId: string,
  _prev: ServiceResult<{ permissions: Permission[] }> | null,
  formData: FormData,
): Promise<ServiceResult<{ permissions: Permission[] }>> {
  // The form posts one checkbox per granted key; `getAll` returns exactly
  // the ticked ones, and the service closes them over their prerequisites.
  const submitted = formData.getAll("permission").filter((value): value is string => typeof value === "string");

  const result = await setStaffPermissions(userId, {
    permissions: submitted.filter((value): value is Permission =>
      (PERMISSIONS as readonly string[]).includes(value),
    ),
  });

  if (!result.ok) return result;

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/users`);
  revalidatePath(`/${locale}/admin/users/${userId}`);

  return { ok: true, data: { permissions: result.data.permissions } };
}
