import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { LabelPrintView, type PrintLabelTarget } from "@/components/admin/label-print-view";
import { Link } from "@/src/i18n/navigation";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { getProduct } from "@/src/services/products";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "admin.labels" });
  const result = await getProduct(id);
  return { title: result.ok ? `${t("title")} — ${locale === "ar" ? result.data.nameAr : result.data.nameFr}` : t("title") };
}

export default async function ProductLabelPage({
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

  const result = await getProduct(id);
  if (!result.ok) notFound();
  const product = result.data;

  const t = await getTranslations("admin.labels");
  const price = product.discountPrice ?? product.price;
  const activeVariants = product.variants.filter((variant) => variant.isActive);
  const productName = locale === "ar" ? product.nameAr : product.nameFr;

  const targets: PrintLabelTarget[] = activeVariants.length
    ? activeVariants.map((variant) => ({
        sku: variant.sku,
        name:
          locale === "ar"
            ? `${product.nameAr} — ${variant.nameAr}`
            : `${product.nameFr} — ${variant.nameFr}`,
        price,
      }))
    : [{ sku: product.sku, name: productName, price }];

  return (
    <div className="flex flex-col gap-8">
      <div className="print:hidden">
        <Link href={`/admin/products/${product.id}`} className="text-sm text-ink-soft hover:text-ink">
          {t("backToProduct")}
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold text-ink">{productName}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {activeVariants.length ? t("subtitleVariants", { count: activeVariants.length }) : t("subtitleSingle")}
        </p>
      </div>

      <LabelPrintView targets={targets} />
    </div>
  );
}
