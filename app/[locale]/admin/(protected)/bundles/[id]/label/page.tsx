import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { LabelPrintView, type PrintLabelTarget } from "@/components/admin/label-print-view";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { getBundleLabelData } from "@/src/services/labels";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "admin.labels" });
  const result = await getBundleLabelData(id);
  return { title: result.ok ? `${t("title")} — ${locale === "ar" ? result.data.nameAr : result.data.nameFr}` : t("title") };
}

export default async function BundleLabelPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  // Printing is its own permission: a catalogue reader is not automatically
  // someone who prints shelf labels.
  const auth = await requireUser();
  if (!auth.ok) return null;
  if (!hasPermission(auth.data, "labels.print")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const result = await getBundleLabelData(id);
  if (!result.ok) notFound();
  const bundle = result.data;

  const t = await getTranslations("admin.labels");
  const bundleName = locale === "ar" ? bundle.nameAr : bundle.nameFr;
  const targets: PrintLabelTarget[] = [{ sku: bundle.sku, name: bundleName, price: bundle.price }];

  return (
    <div className="flex flex-col gap-8">
      <div className="print:hidden">
        <h1 className="font-heading text-2xl font-bold text-ink">{bundleName}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t("subtitleSingle")}</p>
      </div>

      <LabelPrintView targets={targets} />
    </div>
  );
}
