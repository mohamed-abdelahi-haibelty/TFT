import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { LabelSheetView } from "@/components/admin/label-sheet-view";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { listCategories } from "@/src/services/categories";
import { getLabelSheetSelection, listLabelItems } from "@/src/services/labels";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.labels" });
  return { title: t("sheetTitle") };
}

export default async function LabelsSheetPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireUser();
  if (!auth.ok) return null;

  if (!hasPermission(auth.data, "labels.print")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const [itemsResult, categoriesResult, selectionResult] = await Promise.all([
    listLabelItems(),
    listCategories(),
    getLabelSheetSelection(),
  ]);

  const items = itemsResult.ok ? itemsResult.data : [];
  const categories = categoriesResult.ok ? categoriesResult.data : [];
  const initialSelection = selectionResult.ok ? selectionResult.data : [];

  const t = await getTranslations("admin.labels");

  return (
    <div className="flex flex-col gap-8">
      <div className="print:hidden">
        <h1 className="font-heading text-2xl font-bold text-ink">{t("sheetTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t("sheetSubtitle")}</p>
      </div>

      <LabelSheetView items={items} categories={categories} initialSelection={initialSelection} locale={locale} />
    </div>
  );
}
