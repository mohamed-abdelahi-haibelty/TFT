import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { BundleForm } from "@/components/admin/bundle-form";
import { Link } from "@/src/i18n/navigation";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { getBundle, listBundlePickerProducts } from "@/src/services/bundles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "admin.bundles" });
  const result = await getBundle(id);
  return { title: result.ok ? (locale === "ar" ? result.data.nameAr : result.data.nameFr) : t("formTitleEdit") };
}

export default async function EditBundlePage({
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

  const t = await getTranslations("admin.bundles");

  if (!hasPermission(auth.data, "catalog.manage")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const [bundleResult, pickerResult] = await Promise.all([getBundle(id), listBundlePickerProducts()]);
  if (!bundleResult.ok) notFound();

  const bundle = bundleResult.data;
  const pickerProducts = pickerResult.ok ? pickerResult.data : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/bundles" className="text-sm text-ink-soft hover:text-ink">
            {t("back")}
          </Link>
          <h1 className="mt-2 font-heading text-2xl font-bold text-ink">
            {locale === "ar" ? bundle.nameAr : bundle.nameFr}
          </h1>
        </div>
      </div>

      <BundleForm
        bundle={bundle}
        pickerProducts={pickerProducts}
        canEditPricing={hasPermission(auth.data, "catalog.pricing")}
      />
    </div>
  );
}
