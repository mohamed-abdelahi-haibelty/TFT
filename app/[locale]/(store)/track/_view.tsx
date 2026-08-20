import { Ban, Check, CircleAlert } from "lucide-react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import {
  buildTrackingSteps,
  isTerminalCancelledStatus,
  type TrackingStep,
  type TrackingStepKey,
} from "@/src/lib/order-tracking";
import { checkRateLimit } from "@/src/lib/rate-limit";
import { trackOrder, type TrackOrderResult } from "@/src/services/tracking";

// A shared tracking link gets reloaded far more than a checkout submit
// does, so this stays generous — same courtesy-limiter posture `orders.ts`
// documents (the real backstop is the Cloudflare edge rule).
const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

async function clientIp(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

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
          <p className="mt-1 text-xs text-ink-soft">{dateFormatter.format(step.reachedAt)}</p>
        )}
        {step.reached && extra}
      </div>
    </li>
  );
}

export async function TrackView({ locale, code, phone }: { locale: string; code?: string; phone?: string }) {
  const t = await getTranslations("track");
  const hasQuery = !!code && !!phone;
  // An empty string means the field was submitted blank; `undefined` means the
  // visitor simply arrived. The form used to carry `noValidate` while its
  // inputs declared `required`/`pattern`, so submitting empty disabled every
  // constraint, reloaded the page, and said nothing at all.
  const submittedBlank = !hasQuery && (code !== undefined || phone !== undefined);

  let result: TrackOrderResult | null = null;
  let errorMessage: string | null = submittedBlank ? t("errors.missingFields") : null;

  if (hasQuery) {
    const ip = await clientIp();
    if (!checkRateLimit(`track:${ip}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
      errorMessage = t("errors.rateLimited");
    } else {
      const lookup = await trackOrder({ code, phone }, locale);
      if (lookup.ok) result = lookup.data;
      else errorMessage = lookup.error.message;
    }
  }

  const codeDefault = code ?? "";
  const phoneDefault = phone?.replace(/\D/g, "").slice(-8) ?? "";

  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "fr-FR", {
    dateStyle: "long",
    numberingSystem: "latn",
  });

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
  const steps =
    result && !cancelled ? buildTrackingSteps(result.delivery, result.status, result.statusDates) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Edge-to-edge below `sm:`, matching checkout-view.tsx: a bordered card
          adds nothing when it already fills the mobile viewport, and it costs
          width on the smallest screens. */}
      <div className="bg-background sm:border sm:border-border sm:p-8">
        <h1 className="font-display text-2xl font-medium text-ink sm:text-3xl">{t("heading")}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t("intro")}</p>

        <form className="mt-8 flex flex-col gap-6">
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
              defaultValue={codeDefault}
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
                defaultValue={phoneDefault}
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
            className="h-12 w-full rounded-[2px] bg-ink text-xs font-semibold tracking-[0.05em] text-paper uppercase transition-colors hover:bg-[oklch(0.29_0.012_59.14)]"
          >
            {t("form.submit")}
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
