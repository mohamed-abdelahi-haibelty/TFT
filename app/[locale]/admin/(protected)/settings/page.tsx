import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { ShopSettingsForm } from "@/components/admin/shop-settings-form";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { getShopSettings } from "@/src/services/settings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.settings" });
  return { title: t("title") };
}

/**
 * Shop profile. `settings.manage` is one of the two permissions that stay
 * admin-exclusive and are never grantable to staff (`ADMIN_ONLY_PERMISSIONS`)
 * — the shop's own identity sits with the owner. Gated here *and* in the
 * service (`updateShopSettings`), never by hiding a link alone.
 */
export default async function AdminSettingsPage({
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

  if (!hasPermission(auth.data, "settings.manage")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const [t, settings] = await Promise.all([
    getTranslations("admin.settings"),
    getShopSettings(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t("subtitle")}</p>
      </div>

      <ShopSettingsForm settings={settings} />
    </div>
  );
}
