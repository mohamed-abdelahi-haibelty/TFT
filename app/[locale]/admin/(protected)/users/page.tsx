import { AlertTriangle, ChevronLeft, ChevronRight, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/src/i18n/navigation";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { AdminLoadError } from "@/components/admin/admin-load-error";
import { CreateStaffForm } from "@/components/admin/create-staff-form";
import { UserRowActions } from "@/components/admin/user-row-actions";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { listUsers } from "@/src/services/users";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.users" });
  return { title: t("title") };
}

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireUser();
  // The protected layout already redirects, so this is a belt-and-braces
  // path — but it has to lead somewhere. Returning `null` rendered an empty
  // admin shell with no explanation and no way out.
  if (!auth.ok) redirect(`/${locale}/admin/login`);

  if (!hasPermission(auth.data, "users.manage")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const result = await listUsers();
  const t = await getTranslations("admin.users");

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("subtitle")}</p>
        </div>
        <AdminLoadError error={result.error} retryHref="/admin/users" />
      </div>
    );
  }

  const users = result.data;
  const format = await getFormatter();
  const ChevronIcon = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t("subtitle")}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-140 border-collapse text-start">
          <thead>
            <tr className="border-b-2 border-border text-start">
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableName")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableEmail")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableRole")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableStatus")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableCreated")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableAccess")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableActions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-ink-soft">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-paper"
                >
                  <td className="px-5 py-4 text-sm font-medium text-ink">{user.name}</td>
                  <td className="px-5 py-4 text-sm text-ink-soft">{user.email}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center rounded-xs border border-border px-2.5 py-1 text-xs font-semibold text-ink">
                      {user.role === "admin" ? t("roleAdmin") : t("roleStaff")}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={
                        user.isActive
                          ? "inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-semibold text-ink"
                          : "inline-flex items-center gap-1.5 rounded-xs border border-ink px-2.5 py-1 text-xs font-semibold text-ink"
                      }
                    >
                      {user.isActive ? (
                        <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                      )}
                      {user.isActive ? t("statusActive") : t("statusInactive")}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-ink-soft">
                    {format.dateTime(user.createdAt, { dateStyle: "medium" })}
                  </td>
                  <td className="px-5 py-4">
                    {user.role === "admin" ? (
                      <span className="text-sm text-ink-soft">{t("accessAll")}</span>
                    ) : (
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="group inline-flex items-center gap-1.5 rounded-xs border border-border px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-muted"
                      >
                        {user.permissions.length === 0
                          ? t("accessNone")
                          : t("accessCount", { count: user.permissions.length })}
                        <ChevronIcon
                          className="size-3.5 text-ink-soft transition-transform group-hover:translate-x-px rtl:group-hover:-translate-x-px"
                          aria-hidden="true"
                        />
                        <span className="sr-only">{t("manageAccess")}</span>
                      </Link>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <UserRowActions
                      userId={user.id}
                      isActive={user.isActive}
                      isSelf={user.id === auth.data.id}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CreateStaffForm />
    </div>
  );
}
