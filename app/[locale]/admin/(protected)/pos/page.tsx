import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { AdminLoadError } from "@/components/admin/admin-load-error";
import { PosRegisterView } from "@/components/admin/pos-register-view";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { listPosCatalog, listPosCategories, listPosQuickPicks } from "@/src/services/pos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pos" });
  return { title: t("title") };
}

export default async function AdminPosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireUser();
  // The protected layout already redirects, so this is a belt-and-braces
  // path — but it has to lead somewhere. Returning `null` rendered an empty
  // admin shell with no explanation and no way out.
  if (!auth.ok) redirect(`/${locale}/admin/login`);

  if (!hasPermission(auth.data, "pos.use")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const [quickPicksResult, catalogResult, categoriesResult] = await Promise.all([
    listPosQuickPicks(locale),
    listPosCatalog(locale),
    listPosCategories(locale),
  ]);

  // A register with an empty grid and no explanation reads as "the catalog is
  // gone". Failing loudly is the only honest option at a counter with a
  // customer waiting.
  if (!catalogResult.ok) {
    return <AdminLoadError error={catalogResult.error} retryHref="/admin/pos" />;
  }
  if (!quickPicksResult.ok) {
    return <AdminLoadError error={quickPicksResult.error} retryHref="/admin/pos" />;
  }

  return (
    <PosRegisterView
      quickPicks={quickPicksResult.data}
      catalog={catalogResult.data}
      categories={categoriesResult.ok ? categoriesResult.data : []}
      canOverrideStock={hasPermission(auth.data, "inventory.adjust")}
    />
  );
}
