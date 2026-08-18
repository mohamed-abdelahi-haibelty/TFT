import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { ProductForm } from "@/components/admin/product-form";
import { Link } from "@/src/i18n/navigation";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { listCategories } from "@/src/services/categories";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.products" });
  return { title: t("formTitleCreate") };
}

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireUser();
  if (!auth.ok) return null;

  const t = await getTranslations("admin.products");

  if (!hasPermission(auth.data, "catalog.pricing")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const categoriesResult = await listCategories();
  const categoryOptions = categoriesResult.ok ? categoriesResult.data : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/products" className="text-sm text-ink-soft hover:text-ink">
          {t("back")}
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold text-ink">{t("formTitleCreate")}</h1>
      </div>

      <ProductForm categoryOptions={categoryOptions} />
    </div>
  );
}
