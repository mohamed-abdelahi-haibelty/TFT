"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrderStatusValue } from "@/src/lib/order-tracking";
import { buildAdminOrderStatusMessage, buildWhatsAppUrl } from "@/src/lib/whatsapp";
import { advanceOrderStatusAction, confirmOrderAction } from "@/src/services/order-actions";
import type { OrderNextAction } from "@/src/services/orders";

type AdvanceTarget = Extract<OrderNextAction, { action: "advance" }>["target"];

const INLINE_ADVANCES: ReadonlySet<"preparing" | "ready" | "arrived" | "delivered"> = new Set([
  "preparing",
  "ready",
  "arrived",
  "delivered",
]);

function isInlineAdvance(target: AdvanceTarget): target is "preparing" | "ready" | "arrived" | "delivered" {
  return INLINE_ADVANCES.has(target as "preparing" | "ready" | "arrived" | "delivered");
}

export function OrderRowActions({
  orderId,
  orderCode,
  source,
  customerPhone,
  locale,
  nextActions,
  statusLabels,
}: {
  orderId: string;
  orderCode: string;
  source: "web" | "pos";
  customerPhone: string | null;
  locale: string;
  nextActions: OrderNextAction[];
  statusLabels: Record<OrderStatusValue, string>;
}) {
  const t = useTranslations("admin.orders");

  const confirmNext = nextActions.find((next): next is Extract<OrderNextAction, { action: "confirm" }> => next.action === "confirm");
  const advanceNext = nextActions.find((next): next is Extract<OrderNextAction, { action: "advance" }> => next.action === "advance");

  const [confirmState, confirmFormAction, confirmPending] = useActionState(confirmOrderAction.bind(null, orderId), null);
  const [advanceState, advanceFormAction, advancePending] = useActionState(
    advanceOrderStatusAction.bind(null, orderId, advanceNext?.target ?? "preparing"),
    null,
  );

  const whatsappUrl =
    source === "web" && customerPhone
      ? buildWhatsAppUrl(customerPhone, buildAdminOrderStatusMessage({ locale, orderCode, status: "pending" }))
      : null;

  if (confirmNext) {
    return (
      <form action={confirmFormAction} className="flex flex-wrap items-center justify-end gap-2">
        {confirmNext.requiresPaymentMethod ? (
          <Select name="paymentMethod" required defaultValue="">
            <SelectTrigger size="md" className="w-32">
              <SelectValue placeholder={t("detail.actions.paymentMethodLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">{t("detail.actions.paymentCash")}</SelectItem>
              <SelectItem value="bankily">{t("detail.actions.paymentBankily")}</SelectItem>
              <SelectItem value="masrvi">{t("detail.actions.paymentMasrvi")}</SelectItem>
              <SelectItem value="sedad">{t("detail.actions.paymentSedad")}</SelectItem>
              <SelectItem value="other">{t("detail.actions.paymentOther")}</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        <Button type="submit" size="sm" disabled={confirmPending} className="rounded-full">
          {t("table.confirm")}
        </Button>
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={t("detail.actions.whatsappCta")}
            aria-label={t("detail.actions.whatsappCta")}
            className="inline-flex size-8 items-center justify-center rounded-full border border-border text-ink transition-colors hover:bg-paper"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
          </a>
        ) : null}
        {confirmState && !confirmState.ok ? <p className="text-xs text-red-text">{confirmState.error.message}</p> : null}
      </form>
    );
  }

  if (advanceNext && isInlineAdvance(advanceNext.target)) {
    return (
      <form action={advanceFormAction} className="flex flex-col items-end gap-1">
        <Button type="submit" size="sm" variant="secondary" disabled={advancePending} className="rounded-full">
          {t("table.advanceTo", { status: statusLabels[advanceNext.target] })}
        </Button>
        {advanceState && !advanceState.ok ? (
          <p className="text-xs text-red-text">{advanceState.error.message}</p>
        ) : null}
      </form>
    );
  }

  return null;
}
