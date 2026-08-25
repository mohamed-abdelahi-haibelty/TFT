import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { BundleForm } from "@/components/admin/bundle-form";
import { Link } from "@/src/i18n/navigation";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { listBundlePickerProducts } from "@/src/services/bundles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.bundles" });
  return { title: t("formTitleCreate") };
}

export default async function NewBundlePage({
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

  const t = await getTranslations("admin.bundles");

  if (!hasPermission(auth.data, "catalog.pricing")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const pickerResult = await listBundlePickerProducts();
  const pickerProducts = pickerResult.ok ? pickerResult.data : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/bundles" className="text-sm text-ink-soft hover:text-ink">
          {t("back")}
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold text-ink">{t("formTitleCreate")}</h1>
      </div>

      <BundleForm pickerProducts={pickerProducts} />
    </div>
  );
}
