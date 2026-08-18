import { formatMoney } from "@/src/lib/money";

export type WhatsAppOrderLine = { name: string; qty: number };

export type OrderCity = "ndb" | "nkc" | "other";

export type WhatsAppOrderMessageInput = {
  locale: string;
  orderCode: string;
  lines: WhatsAppOrderLine[];
  total: number;
  customerName: string;
  city: OrderCity;
};

const CITY_LABELS: Record<"ar" | "fr", Record<OrderCity, string>> = {
  ar: { ndb: "نواذيبو", nkc: "نواكشوط", other: "مدينة أخرى" },
  fr: { ndb: "Nouadhibou", nkc: "Nouakchott", other: "autre ville" },
};

/**
 * Pure order-handoff message, built in the customer's own locale (task 11:
 * order code, each line as `name ×qty`, total, name + city, a sentence
 * asking to confirm and send the Bankily/Masrvi/Sedad payment screenshot).
 * `buildWhatsAppUrl` URL-encodes it into a `wa.me` link — kept as a separate
 * step so the raw text is independently testable and reusable (e.g. a
 * "copy message" fallback when no WhatsApp number is configured yet).
 */
export function buildWhatsAppOrderMessage(input: WhatsAppOrderMessageInput): string {
  const isAr = input.locale === "ar";
  const cityLabel = CITY_LABELS[isAr ? "ar" : "fr"][input.city];
  const lines = input.lines.map((line) => `${line.name} ×${line.qty}`).join("\n");
  const total = formatMoney(input.total);

  if (isAr) {
    return [
      `طلب جديد ${input.orderCode}`,
      lines,
      `المجموع: ${total}`,
      `الاسم: ${input.customerName} — ${cityLabel}`,
      `الرجاء تأكيد الطلب وإرسال لقطة شاشة لإيصال الدفع عبر بنكيلي أو مصرفي أو سداد.`,
    ].join("\n\n");
  }

  return [
    `Nouvelle commande ${input.orderCode}`,
    lines,
    `Total : ${total}`,
    `Nom : ${input.customerName} — ${cityLabel}`,
    `Merci de confirmer la commande et d'envoyer une capture d'écran du paiement via Bankily, Masrvi ou Sedad.`,
  ].join("\n\n");
}

/** `null` when no WhatsApp number is configured yet — callers fall back to a "coming soon" state, same posture as the footer (task 08). The number now comes from `getShopSettings()` (owner-editable, env var as bootstrap), so `null` is a first-class input here, not just `undefined`. */
export function buildWhatsAppUrl(phoneNumber: string | null | undefined, message: string): string | null {
  if (!phoneNumber) return null;
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
}

export type AdminOrderStatusMessageStatus = "pending" | "confirmed" | "shipped" | "arrived" | "ready";

export type AdminOrderStatusMessageInput = {
  locale: string;
  orderCode: string;
  status: AdminOrderStatusMessageStatus;
  busCompany?: string | null;
};

/**
 * Task 13's per-status admin quick action — a short customer-facing update,
 * built in the customer's own locale and opened against the customer's own
 * phone (`buildWhatsAppUrl(order.customerPhone, ...)`, not the shop's
 * number). Deliberately shorter than `buildWhatsAppOrderMessage`: this is a
 * status ping on an order the customer already placed, not the original
 * order handoff.
 */
export function buildAdminOrderStatusMessage(input: AdminOrderStatusMessageInput): string {
  const isAr = input.locale === "ar";

  if (isAr) {
    switch (input.status) {
      case "pending":
        return `طلبك ${input.orderCode} بانتظار التأكيد. الرجاء تأكيده وإرسال لقطة شاشة لإيصال الدفع عبر بنكيلي أو مصرفي أو سداد.`;
      case "confirmed":
        return `تم تأكيد طلبك ${input.orderCode}. سنجهزه قريبًا.`;
      case "shipped":
        return input.busCompany
          ? `طلبك ${input.orderCode} في الطريق عبر حافلة ${input.busCompany}.`
          : `طلبك ${input.orderCode} في الطريق عبر الحافلة.`;
      case "arrived":
        return `وصل طلبك ${input.orderCode} إلى محطة الوصول. يمكنك استلامه الآن، يرجى إحضار رقم الطلب.`;
      case "ready":
        return `طلبك ${input.orderCode} جاهز للاستلام من المحل في نواذيبو.`;
    }
  }

  switch (input.status) {
    case "pending":
      return `Votre commande ${input.orderCode} est en attente de confirmation. Merci de la confirmer et d'envoyer une capture d'écran du paiement via Bankily, Masrvi ou Sedad.`;
    case "confirmed":
      return `Votre commande ${input.orderCode} est confirmée. Nous la préparons bientôt.`;
    case "shipped":
      return input.busCompany
        ? `Votre commande ${input.orderCode} est en route par bus (${input.busCompany}).`
        : `Votre commande ${input.orderCode} est en route par bus.`;
    case "arrived":
      return `Votre commande ${input.orderCode} est arrivée à la gare routière. Vous pouvez la récupérer, munissez-vous du numéro de commande.`;
    case "ready":
      return `Votre commande ${input.orderCode} est prête à retirer au magasin à Nouadhibou.`;
  }
}
