import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { InventoryView } from "@/components/admin/inventory-view";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { listCategories } from "@/src/services/categories";
import { listInventoryItems } from "@/src/services/inventory";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.inventory" });
  return { title: t("title") };
}

export default async function AdminInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; category?: string; lowStockOnly?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const auth = await requireUser();
  if (!auth.ok) return null;

  if (!hasPermission(auth.data, "inventory.view")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const [itemsResult, categoriesResult] = await Promise.all([
    listInventoryItems({
      search: query.q,
      categoryId: query.category,
      lowStockOnly: query.lowStockOnly === "on",
    }),
    listCategories(),
  ]);
  const items = itemsResult.ok ? itemsResult.data : [];
  const categories = categoriesResult.ok ? categoriesResult.data : [];

  return (
    <InventoryView
      items={items}
      categories={categories}
      query={query}
      canAdjust={hasPermission(auth.data, "inventory.adjust")}
    />
  );
}
