import { AlertTriangle, ArrowLeft, ArrowRight, CircleCheck, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { PermissionEditor } from "@/components/admin/permission-editor";
import { Link } from "@/src/i18n/navigation";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { getStaffMember } from "@/src/services/users";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.permissions" });
  return { title: t("title") };
}

/**
 * One staff member's access, on its own page rather than inside the users
 * table: thirteen permissions with a sentence of plain explanation each do
 * not fit a row, and the owner deciding what someone may do is a decision
 * worth its own screen — PRODUCT.md's audience is not a technical one, so
 * every key is spelled out in shop language instead of abbreviated to a
 * column of ticks.
 */
export default async function StaffAccessPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const auth = await requireUser();
  // The protected layout already redirects, so this is a belt-and-braces
  // path — but it has to lead somewhere. Returning `null` rendered an empty
  // admin shell with no explanation and no way out.
  if (!auth.ok) redirect(`/${locale}/admin/login`);

  if (!hasPermission(auth.data, "users.manage")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const result = await getStaffMember(id);
  if (!result.ok) notFound();

  const staff = result.data;
  const t = await getTranslations("admin.permissions");
  const tUsers = await getTranslations("admin.users");
  const format = await getFormatter();
  const BackArrow = locale === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <Link
          href="/admin/users"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <BackArrow className="size-4" aria-hidden="true" />
          {tUsers("detailBack")}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold text-ink">{staff.name}</h1>
            <p className="mt-1 font-mono text-sm text-ink-soft">{staff.email}</p>
          </div>

          <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-ink-soft">{tUsers("tableRole")}</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {staff.role === "admin" ? tUsers("roleAdmin") : tUsers("roleStaff")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">{tUsers("tableStatus")}</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-ink">
                {staff.isActive ? (
                  <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                {staff.isActive ? tUsers("statusActive") : tUsers("statusInactive")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">{tUsers("detailCreated")}</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {format.dateTime(staff.createdAt, { dateStyle: "medium" })}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="border-t border-border pt-7">
        <h2 className="font-heading text-lg font-semibold text-ink">{t("title")}</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          {t("subtitle", { name: staff.name })}
        </p>

        <div className="mt-6">
          {staff.role === "admin" ? (
            <div className="flex items-start gap-3 rounded-2xl border border-border p-5">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ink-soft" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-ink">{t("allAccess")}</p>
                <p className="mt-1 max-w-prose text-sm leading-6 text-ink-soft">{t("adminNote")}</p>
              </div>
            </div>
          ) : (
            <PermissionEditor userId={staff.id} initialPermissions={staff.permissions} />
          )}
        </div>
      </div>
    </div>
  );
}
