import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { PosScanView } from "@/components/admin/pos-scan-view";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { listPosCatalog, listPosQuickPicks } from "@/src/services/pos";

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
  if (!auth.ok) return null;

  if (!hasPermission(auth.data, "pos.use")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const [quickPicksResult, catalogResult] = await Promise.all([listPosQuickPicks(locale), listPosCatalog(locale)]);

  return (
    <PosScanView
      quickPicks={quickPicksResult.ok ? quickPicksResult.data : []}
      catalog={catalogResult.ok ? catalogResult.data : []}
    />
  );
}
