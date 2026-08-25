"use client";

import { Ban, Check, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useMemo } from "react";
import {
  buildTrackingSteps,
  isTerminalCancelledStatus,
  type TrackingStep,
  type TrackingStepKey,
} from "@/src/lib/order-tracking";
import { trackOrderAction } from "@/src/services/tracking-actions";

function TimelineStep({
  step,
  isLast,
  nextReached,
  labels,
  extra,
  dateFormatter,
  stateLabels,
}: {
  step: TrackingStep;
  isLast: boolean;
  nextReached: boolean;
  labels: Record<TrackingStepKey, string>;
  extra: React.ReactNode;
  dateFormatter: Intl.DateTimeFormat;
  stateLabels: { done: string; pending: string };
}) {
  return (
    // Step state was carried by a decorative `<Check>` and a colour change
    // alone, so a reached step and an unreached one announced identically.
    <li className="flex gap-4" aria-current={step.reached && !nextReached ? "step" : undefined}>
      <div className="flex flex-col items-center">
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${
            step.reached ? "border-ink bg-ink text-paper" : "border-border text-transparent"
          }`}
        >
          <Check className="size-3.5" aria-hidden="true" />
        </span>
        {!isLast && <span className={`mt-1 w-px flex-1 ${step.reached && nextReached ? "bg-ink" : "bg-border"}`} />}
      </div>
      {/* `last:pb-0` used to sit here. This div is the last child of its own
          `<li>`, so `:last-child` matched on EVERY step and cancelled the
          padding universally — five steps crushed to ~28px pitch with the
          connector line invisible, reading as a radio group rather than a
          timeline. The "no padding after the final step" intent belongs to the
          last `<li>`, which is what `isLast` actually knows. */}
      <div className={`flex-1 ${isLast ? "" : "pb-7"}`}>
        <p className={`text-xs font-semibold tracking-[0.04em] uppercase ${step.reached ? "text-ink" : "text-ink-soft"}`}>
          {labels[step.key]}{" "}
          <span className="sr-only">— {step.reached ? stateLabels.done : stateLabels.pending}</span>
        </p>
        {step.reached && step.reachedAt && (
          <p className="mt-1 text-xs text-ink-soft">{dateFormatter.format(new Date(step.reachedAt))}</p>
        )}
        {step.reached && extra}
      </div>
    </li>
  );
}

/**
 * The lookup posts through a server action rather than submitting to itself as
 * a GET — the code/phone pair is the only credential this order has, and a
 * query string leaks it into history, access logs, and `Referer`. Only the
 * order code is ever pre-filled from the URL.
 */
export function TrackView({ locale, defaultCode }: { locale: string; defaultCode?: string }) {
  const t = useTranslations("track");
  const [state, formAction, pending] = useActionState(trackOrderAction, null);

  const result = state?.ok ? state.data : null;
  const errorMessage = state && !state.ok ? state.error.message : null;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar" : "fr-FR", {
        dateStyle: "long",
        numberingSystem: "latn",
      }),
    [locale],
  );

  const stepLabels: Record<TrackingStepKey, string> = {
    received: t("result.steps.received"),
    confirmed: t("result.steps.confirmed"),
    preparing: t("result.steps.preparing"),
    shipped: t("result.steps.shipped"),
    arrived: t("result.steps.arrived"),
    ready: t("result.steps.ready"),
    delivered: t("result.steps.delivered"),
  };

  const cancelled = result ? isTerminalCancelledStatus(result.status) : false;
  const steps = result && !cancelled ? buildTrackingSteps(result.delivery, result.status, result.statusDates) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Edge-to-edge below `sm:`, matching checkout-view.tsx: a bordered card
          adds nothing when it already fills the mobile viewport, and it costs
          width on the smallest screens. */}
      <div className="bg-background sm:border sm:border-border sm:p-8">
        <h1 className="font-display text-2xl font-medium text-ink sm:text-3xl">{t("heading")}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t("intro")}</p>

        <form action={formAction} className="mt-8 flex flex-col gap-6">
          <div>
            <label htmlFor="track-code" className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
              {t("form.codeLabel")}
            </label>
            <input
              id="track-code"
              name="code"
              type="text"
              required
              maxLength={40}
              defaultValue={defaultCode ?? ""}
              placeholder={t("form.codePlaceholder")}
              dir="ltr"
              className="mt-2 h-12 w-full rounded-[2px] border border-border bg-transparent px-3.5 font-mono text-base text-ink uppercase outline-none placeholder:normal-case placeholder:text-ink-soft/60 focus:border-ink focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm"
            />
          </div>

          <div>
            <label htmlFor="track-phone" className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
              {t("form.phoneLabel")}
            </label>
            <div className="mt-2 flex h-12 items-stretch rounded-[2px] border border-border has-focus-visible:ring-2 has-focus-visible:ring-ring/50 focus-within:border-ink">
              <span dir="ltr" className="flex items-center border-e border-border px-3 font-mono text-sm text-ink-soft">
                +222
              </span>
              <input
                id="track-phone"
                name="phone"
                type="tel"
                dir="ltr"
                inputMode="numeric"
                required
                pattern="[234][0-9]{7}"
                maxLength={8}
                aria-describedby="track-phone-hint"
                className="h-full flex-1 bg-transparent px-3.5 font-mono text-base text-ink outline-none md:text-sm"
              />
            </div>
            <p id="track-phone-hint" className="mt-1.5 text-xs text-ink-soft">
              {t("form.phoneHint")}
            </p>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="h-12 w-full rounded-[2px] bg-ink text-xs font-semibold tracking-[0.05em] text-paper uppercase transition-colors hover:bg-[oklch(0.29_0.012_59.14)] disabled:cursor-not-allowed disabled:bg-ink/30"
          >
            {pending ? t("form.submitting") : t("form.submit")}
          </button>
        </form>

        {errorMessage && (
          <p
            role="alert"
            aria-live="assertive"
            className="mt-6 flex items-start gap-2 border border-plum p-3.5 text-sm font-medium text-plum"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </p>
        )}

        {result && cancelled && (
          <div className="mt-8 border-t border-border pt-8">
            <div className="flex items-center gap-3">
              <Ban className="size-6 shrink-0 text-ink" aria-hidden="true" />
              <h2 className="text-sm font-semibold tracking-[0.04em] text-ink uppercase">{t("result.cancelledTitle")}</h2>
            </div>
            <p className="mt-2 text-sm text-ink-soft">{t("result.cancelledBody")}</p>
          </div>
        )}

        {result && steps && (
          <div className="mt-8 border-t border-border pt-8">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
                {t("result.orderCodeLabel")}
              </span>
              <span className="font-mono text-sm text-ink">{result.code}</span>
            </div>

            {/* An order sitting at step 1 of 5 with a date told the customer
                nothing about who acts next, or when. */}
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">{t("result.nextStepsPending")}</p>

            <ol className="mt-6 flex flex-col">
              {steps.map((step, index) => {
                let extra: React.ReactNode = null;
                if (step.key === "shipped" && step.reached && (result.busCompany || result.busNote)) {
                  extra = (
                    <div className="mt-1.5 border border-border p-3">
                      <p className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
                        {t("result.busInfoTitle")}
                      </p>
                      {result.busCompany && (
                        <p className="mt-1 text-xs text-ink">
                          {t("result.busCompanyLabel")}: {result.busCompany}
                        </p>
                      )}
                      {result.busNote && <p className="mt-1 text-xs text-ink-soft">{result.busNote}</p>}
                    </div>
                  );
                } else if (step.key === "arrived" && step.reached) {
                  extra = <p className="mt-1.5 text-xs text-ink-soft">{t("result.arrivedInstructions")}</p>;
                } else if (step.key === "ready" && step.reached) {
                  extra = <p className="mt-1.5 text-xs text-ink-soft">{t("result.readyInstructions")}</p>;
                }

                return (
                  <TimelineStep
                    key={step.key}
                    step={step}
                    isLast={index === steps.length - 1}
                    nextReached={steps[index + 1]?.reached ?? false}
                    labels={stepLabels}
                    extra={extra}
                    dateFormatter={dateFormatter}
                    stateLabels={{ done: t("result.stepDone"), pending: t("result.stepPending") }}
                  />
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
