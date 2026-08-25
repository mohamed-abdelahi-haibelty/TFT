import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { PromotionForm } from "@/components/admin/promotion-form";
import { Link } from "@/src/i18n/navigation";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { getPromotion, listPromotionPickerData } from "@/src/services/promotions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "admin.promotions" });
  const result = await getPromotion(id);
  const title = result.ok ? (locale === "ar" ? result.data.nameAr : result.data.nameFr) : t("formTitleEdit");
  return { title };
}

export default async function EditPromotionPage({
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

  const t = await getTranslations("admin.promotions");

  if (!hasPermission(auth.data, "promotions.manage")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const [promotionResult, pickerResult] = await Promise.all([getPromotion(id), listPromotionPickerData()]);
  if (!promotionResult.ok) notFound();

  const promotion = promotionResult.data;
  const pickerData = pickerResult.ok ? pickerResult.data : { categories: [], products: [], bundles: [] };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/promotions"
          className="inline-flex h-10 items-center rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper focus-visible:ring-3 focus-visible:ring-ink/30"
        >
          {t("back")}
        </Link>
        <h1 className="mt-3 font-heading text-2xl font-bold text-ink">
          {locale === "ar" ? promotion.nameAr : promotion.nameFr}
        </h1>
      </div>

      <PromotionForm promotion={promotion} pickerData={pickerData} locale={locale as "ar" | "fr"} />
    </div>
  );
}
