import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { PromotionRowActions } from "@/components/admin/promotion-row-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@/src/i18n/navigation";
import { formatMoney } from "@/src/lib/money";
import { remainingUntil, type PromotionStatus } from "@/src/lib/promotion-status";
import { firstAllowedSection, hasPermission } from "@/src/lib/permissions";
import { requireUser } from "@/src/services/authz";
import { listPromotions, type PromotionListItem } from "@/src/services/promotions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.promotions" });
  return { title: t("title") };
}

const STATUS_BADGE_CLASS: Record<PromotionStatus, string> = {
  scheduled: "bg-gold-soft text-gold-strong",
  active: "bg-green-bg text-green-text",
  ended: "border border-border text-ink",
  disabled: "bg-red-bg text-red-text",
};

const STATUS_DOT_CLASS: Record<PromotionStatus, string> = {
  scheduled: "bg-gold",
  active: "bg-green",
  ended: "",
  disabled: "bg-red",
};

function formatDiscount(promotion: PromotionListItem): string {
  return promotion.kind === "percent" ? `-${promotion.value}%` : `-${formatMoney(promotion.value)}`;
}

type Translator = (key: string) => string;

function statusLabel(t: Translator, status: PromotionStatus): string {
  switch (status) {
    case "scheduled":
      return t("statusScheduled");
    case "active":
      return t("statusActive");
    case "ended":
      return t("statusEnded");
    case "disabled":
      return t("statusDisabled");
  }
}

function channelLabel(t: Translator, channel: PromotionListItem["channel"]): string {
  switch (channel) {
    case "web":
      return t("channelWeb");
    case "pos":
      return t("channelPos");
    case "both":
      return t("channelBoth");
  }
}

export default async function AdminPromotionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: PromotionStatus }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const auth = await requireUser();
  if (!auth.ok) return null;

  if (!hasPermission(auth.data, "promotions.manage")) {
    return <AdminForbidden backHref={firstAllowedSection(auth.data) ?? "/admin"} />;
  }

  const promotionsResult = await listPromotions({ search: query.q, status: query.status });
  const promotions = promotionsResult.ok ? promotionsResult.data : [];

  const t = await getTranslations("admin.promotions");
  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "latn",
  });
  const now = new Date();

  function remainingLabel(endsAt: Date) {
    const remaining = remainingUntil(endsAt, now);
    if (remaining.days >= 1) return t("remainingDays", { days: remaining.days, hours: remaining.hours });
    if (remaining.hours >= 1) return t("remainingHours", { hours: remaining.hours, minutes: remaining.minutes });
    return t("remainingMinutes", { minutes: remaining.minutes });
  }

  function startsInLabel(startsAt: Date) {
    const remaining = remainingUntil(startsAt, now);
    if (remaining.days >= 1) return t("startsInDays", { days: remaining.days, hours: remaining.hours });
    if (remaining.hours >= 1) return t("startsInHours", { hours: remaining.hours, minutes: remaining.minutes });
    return t("startsInMinutes", { minutes: remaining.minutes });
  }

  const statusOptions: PromotionStatus[] = ["scheduled", "active", "ended", "disabled"];
  const columnCount = hasPermission(auth.data, "promotions.manage") ? 7 : 6;
  const hasFilters = Boolean(query.q || query.status);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("subtitle")}</p>
        </div>
        {hasPermission(auth.data, "promotions.manage") ? (
          <Link
            href="/admin/promotions/new"
            className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-[color-mix(in_oklch,var(--ink),white_10%)] active:translate-y-0 focus-visible:ring-3 focus-visible:ring-gold/30"
          >
            {t("addPromotion")}
          </Link>
        ) : null}
      </div>

      <form className="flex flex-wrap items-center gap-3" method="get">
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder={t("searchPlaceholder")}
          className="h-10 min-w-56 flex-1 rounded-md border border-border px-3.5 text-sm text-ink outline-none focus-visible:border-gold focus-visible:ring-3 focus-visible:ring-gold/30"
        />
        <Select name="status" defaultValue={query.status ?? ""}>
          <SelectTrigger size="md" className="w-40">
            <SelectValue placeholder={t("statusFilterAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("statusFilterAll")}</SelectItem>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabel(t, status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="submit"
          className="h-10 rounded-full border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper focus-visible:ring-3 focus-visible:ring-gold/30"
        >
          {t("filterSubmit")}
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-200 border-collapse text-start">
          <thead>
            <tr className="border-b-2 border-border text-start">
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableName")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableDiscount")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableSchedule")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableChannel")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableItems")}
              </th>
              <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                {t("tableStatus")}
              </th>
              {hasPermission(auth.data, "promotions.manage") ? (
                <th className="px-5 py-3 text-start text-xs font-semibold tracking-wide text-ink-soft">
                  {t("tableActions")}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {promotions.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-5 py-10 text-center">
                  {hasFilters ? (
                    <p className="text-sm text-ink-soft">{t("empty")}</p>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-ink-soft">{t("emptyAll")}</p>
                      {hasPermission(auth.data, "promotions.manage") ? (
                        <Link
                          href="/admin/promotions/new"
                          className="inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-medium text-ink transition-colors hover:bg-paper focus-visible:ring-3 focus-visible:ring-gold/30"
                        >
                          {t("addPromotion")}
                        </Link>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              promotions.map((promotion) => (
                <tr
                  key={promotion.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-paper"
                >
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-nowrap text-ink">
                      {locale === "ar" ? promotion.nameAr : promotion.nameFr}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <span dir="ltr" className="font-mono text-sm text-ink">
                      {formatDiscount(promotion)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span dir="ltr" className="font-mono text-xs text-ink-soft">
                      {dateFormatter.format(promotion.startsAt)} — {dateFormatter.format(promotion.endsAt)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-ink">{channelLabel(t, promotion.channel)}</td>
                  <td className="px-5 py-4 font-mono text-sm text-ink">{promotion.itemCount}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[promotion.status]}`}
                      >
                        {STATUS_DOT_CLASS[promotion.status] ? (
                          <span className={`size-2 rounded-full ${STATUS_DOT_CLASS[promotion.status]}`} />
                        ) : null}
                        {statusLabel(t, promotion.status)}
                      </span>
                      {promotion.status === "active" ? (
                        <span className="font-mono text-xs text-ink-soft">{remainingLabel(promotion.endsAt)}</span>
                      ) : null}
                      {promotion.status === "scheduled" ? (
                        <span className="font-mono text-xs text-ink-soft">{startsInLabel(promotion.startsAt)}</span>
                      ) : null}
                    </div>
                  </td>
                  {hasPermission(auth.data, "promotions.manage") ? (
                    <td className="px-5 py-4">
                      <PromotionRowActions
                        promotionId={promotion.id}
                        isActive={promotion.isActive}
                        name={locale === "ar" ? promotion.nameAr : promotion.nameFr}
                      />
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
