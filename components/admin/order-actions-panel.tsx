"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrderStatusValue } from "@/src/lib/order-tracking";
import { buildAdminOrderStatusMessage, buildWhatsAppUrl, type AdminOrderStatusMessageStatus } from "@/src/lib/whatsapp";
import { advanceOrderStatusAction, cancelOrderAction, confirmOrderAction, voidOrderAction } from "@/src/services/order-actions";
import type { OrderNextAction } from "@/src/services/orders";

const WHATSAPP_STATUSES: AdminOrderStatusMessageStatus[] = ["pending", "confirmed", "shipped", "arrived", "ready"];

const fieldClassName =
  "h-9 rounded-md border border-border px-2.5 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/30";

function AdvanceAction({
  orderId,
  next,
  statusLabels,
  t,
}: {
  orderId: string;
  next: Extract<OrderNextAction, { action: "advance" }>;
  statusLabels: Record<OrderStatusValue, string>;
  t: ReturnType<typeof useTranslations>;
}) {
  const [state, formAction, pending] = useActionState(advanceOrderStatusAction.bind(null, orderId, next.target), null);
  const needsBusInfo = "requiresBusInfo" in next && next.requiresBusInfo;

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {needsBusInfo ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
            {t("busCompanyLabel")}
            <input name="busCompany" required className={fieldClassName} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
            {t("busNoteLabel")}
            <input name="busNote" className={fieldClassName} />
          </label>
        </>
      ) : null}
      <Button type="submit" disabled={pending} className="rounded-xs">
        {t("advanceTo", { status: statusLabels[next.target] })}
      </Button>
      {state && !state.ok ? <p className="w-full text-sm font-medium text-plum">{state.error.message}</p> : null}
    </form>
  );
}

export function OrderActionsPanel({
  orderId,
  status,
  nextActions,
  locale,
  orderCode,
  customerPhone,
  busCompany,
  statusLabels,
  permissions,
}: {
  orderId: string;
  status: OrderStatusValue;
  nextActions: OrderNextAction[];
  locale: string;
  orderCode: string;
  customerPhone: string | null;
  busCompany: string | null;
  statusLabels: Record<OrderStatusValue, string>;
  /** Already resolved for the signed-in operator; admin arrives holding everything. */
  permissions: { canManage: boolean; canCancel: boolean; canVoid: boolean };
}) {
  const t = useTranslations("admin.orders.detail.actions");
  const [showCancel, setShowCancel] = useState(false);
  const [showVoid, setShowVoid] = useState(false);

  const [confirmState, confirmFormAction, confirmPending] = useActionState(confirmOrderAction.bind(null, orderId), null);
  const [cancelState, cancelFormAction, cancelPending] = useActionState(cancelOrderAction.bind(null, orderId), null);
  const [voidState, voidFormAction, voidPending] = useActionState(voidOrderAction.bind(null, orderId), null);

  const whatsappUrl =
    customerPhone && WHATSAPP_STATUSES.includes(status as AdminOrderStatusMessageStatus)
      ? buildWhatsAppUrl(
          customerPhone,
          buildAdminOrderStatusMessage({
            locale,
            orderCode,
            status: status as AdminOrderStatusMessageStatus,
            busCompany,
          }),
        )
      : null;

  const canCancel = permissions.canCancel && nextActions.some((next) => next.action === "cancel");
  const canVoid = permissions.canVoid && nextActions.some((next) => next.action === "void");
  const hasPrimaryAction =
    permissions.canManage &&
    nextActions.some((next) => next.action !== "cancel" && next.action !== "void");
  const hasNothingToShow = !hasPrimaryAction && !whatsappUrl && !canCancel && !canVoid;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-5">
      <h2 className="font-heading text-lg font-semibold text-ink">{t("title")}</h2>

      {hasNothingToShow ? <p className="text-sm text-ink-soft">{t("noActions")}</p> : null}

      <div className="flex flex-wrap gap-2">
        {(permissions.canManage ? nextActions : []).map((next, index) => {
          if (next.action === "confirm") {
            return (
              <form key="confirm" action={confirmFormAction} className="flex flex-wrap items-end gap-2">
                {next.requiresPaymentMethod ? (
                  <>
                    <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
                      {t("paymentMethodLabel")}
                      <Select name="paymentMethod" required defaultValue="">
                        <SelectTrigger size="md" className="w-40">
                          <SelectValue placeholder={t("paymentMethodLabel")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">{t("paymentCash")}</SelectItem>
                          <SelectItem value="bankily">{t("paymentBankily")}</SelectItem>
                          <SelectItem value="masrvi">{t("paymentMasrvi")}</SelectItem>
                          <SelectItem value="sedad">{t("paymentSedad")}</SelectItem>
                          <SelectItem value="other">{t("paymentOther")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
                      {t("paymentNoteLabel")}
                      <input name="paymentNote" className={fieldClassName} placeholder={t("paymentNotePlaceholder")} />
                    </label>
                  </>
                ) : null}
                <Button type="submit" disabled={confirmPending} className="rounded-xs">
                  {t("confirm")}
                </Button>
                {confirmState && !confirmState.ok ? (
                  <p className="w-full text-sm font-medium text-plum">{confirmState.error.message}</p>
                ) : null}
              </form>
            );
          }
          if (next.action === "cancel" || next.action === "void") return null;
          return <AdvanceAction key={`${next.action}-${index}`} orderId={orderId} next={next} statusLabels={statusLabels} t={t} />;
        })}
      </div>

      {whatsappUrl ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 w-fit items-center rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          {t("whatsappCta")}
        </a>
      ) : null}

      {canCancel ? (
        <div className="border-t border-border pt-4">
          {!showCancel ? (
            <button type="button" onClick={() => setShowCancel(true)} className="text-sm font-medium text-plum hover:underline">
              {t("cancelOrder")}
            </button>
          ) : (
            <form action={cancelFormAction} className="flex flex-col gap-2">
              <label className="text-xs font-medium text-ink-soft" htmlFor="cancel-reason">
                {t("cancelReasonLabel")}
              </label>
              <textarea
                id="cancel-reason"
                name="reason"
                required
                rows={2}
                className="rounded-md border border-border px-3 py-2 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/30"
              />
              {cancelState && !cancelState.ok ? <p className="text-sm font-medium text-plum">{cancelState.error.message}</p> : null}
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={cancelPending} className="rounded-xs">
                  {t("cancelSubmit")}
                </Button>
                <Button type="button" variant="secondary" className="rounded-xs" onClick={() => setShowCancel(false)}>
                  {t("cancelDismiss")}
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {canVoid ? (
        <div className="border-t border-border pt-4">
          {!showVoid ? (
            <button type="button" onClick={() => setShowVoid(true)} className="text-sm font-medium text-plum hover:underline">
              {t("voidOrder")}
            </button>
          ) : (
            <form action={voidFormAction} className="flex flex-col gap-2">
              <label className="text-xs font-medium text-ink-soft" htmlFor="void-reason">
                {t("voidReasonLabel")}
              </label>
              <textarea
                id="void-reason"
                name="reason"
                required
                rows={2}
                className="rounded-md border border-border px-3 py-2 text-sm text-ink outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/30"
              />
              {voidState && !voidState.ok ? <p className="text-sm font-medium text-plum">{voidState.error.message}</p> : null}
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={voidPending} className="rounded-xs">
                  {t("voidSubmit")}
                </Button>
                <Button type="button" variant="secondary" className="rounded-xs" onClick={() => setShowVoid(false)}>
                  {t("voidDismiss")}
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
