"use client";

import { CircleAlert, CircleCheck, Copy, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/src/i18n/navigation";
import {
  CART_UPDATED_EVENT,
  type CartItem,
  cartItemName,
  cartSubtotal,
  clearCart,
  getCart,
  removeFromCart,
} from "@/src/lib/cart";
import { buildCloudinaryUrl } from "@/src/lib/cloudinary";
import { formatMoney } from "@/src/lib/money";
import { isValidMauritanianPhone } from "@/src/lib/phone";
import { buildWhatsAppOrderMessage, buildWhatsAppUrl } from "@/src/lib/whatsapp";

// Checkout only ever offers NDB (pickup) or NKC (bus) — "other" is a valid
// `orders.city` DB value for admin/POS-entered orders, just not a choice the
// public storefront hands out.
type CheckoutCity = "ndb" | "nkc";

type FormState = {
  name: string;
  phone: string;
  city: CheckoutCity | "";
  note: string;
};

type FieldErrors = Partial<Record<"name" | "phone" | "city", string>>;

type ConfirmedOrder = {
  code: string;
  customerName: string;
  city: CheckoutCity;
  items: { name: string; qty: number; unitPrice: number }[];
  subtotal: number;
  discountTotal: number;
  total: number;
};

/**
 * `hydrated` distinguishes "the cart is empty" from "we have not read
 * localStorage yet". Without it the server rendered the *empty-cart* state —
 * a short page — and the real checkout appeared a beat later, producing a
 * measured CLS of 0.545 in both locales (Google's "good" threshold is 0.1) on
 * the single most conversion-critical page in the product.
 */
function useCart(): { cart: CartItem[]; hydrated: boolean } {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      setCart(getCart());
      setHydrated(true);
    };
    sync();
    window.addEventListener(CART_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { cart, hydrated };
}

/**
 * Atelier Blanc's error voice (see DESIGN.md, "The Errors-Are-Plum Rule").
 * The register is silent by default, which is right for stock and promos and
 * wrong for a failed submit: before this, an error was `text-xs text-ink`
 * sitting one step of grey away from the phone *hint* directly below it, so a
 * first-time shopper pressed "confirm" and saw nothing change. Plum + weight +
 * icon is the smallest change that makes failure legible without reaching for
 * the Admin status family the storefront deliberately doesn't use.
 */
function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-plum">
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function CartLineRow({ line, locale }: { line: CartItem; locale: string }) {
  return (
    <li className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex size-12 shrink-0 items-center justify-center border border-border p-1.5">
        {line.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary delivery URL, fixed size transform
          <img
            src={buildCloudinaryUrl(line.image, "thumbnail")}
            alt=""
            width={120}
            height={120}
            loading="lazy"
            decoding="async"
            className="size-full object-contain mix-blend-multiply"
          />
        ) : (
          <ShoppingBag className="size-5 text-ink-soft" aria-hidden="true" />
        )}
      </div>
      {/* `truncate` inside an RTL container amputates the *head* of a Latin
          name ("…rillé Seyès couverture rigide"), throwing away the part that
          identifies the product. This catalog is full of Latin brand names. */}
      <span className="line-clamp-2 min-w-0 flex-1 text-sm text-ink">
        {cartItemName(line, locale)} <span className="text-ink-soft">×{line.qty}</span>
      </span>
      <span className="shrink-0 font-mono text-sm text-ink">{formatMoney(line.unitPrice * line.qty)}</span>
    </li>
  );
}

/**
 * The Modal-shadow "checkout sheet" DESIGN.md reserved for task 11 — one
 * raised panel that carries both states of the flow (form, then
 * confirmation) so the customer never leaves the page. Order creation is a
 * single `POST /api/orders`; the server re-prices and re-checks availability
 * (never the client's cart snapshot), so a `CONFLICT` here means the cart
 * itself gets corrected in place before the customer retries.
 */
export function CheckoutView({ locale, whatsappNumber }: { locale: string; whatsappNumber: string | null }) {
  const t = useTranslations("checkout");
  const { cart, hydrated } = useCart();

  const [form, setForm] = useState<FormState>({ name: "", phone: "", city: "", note: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedOrder | null>(null);
  const [copied, setCopied] = useState(false);

  // Submitting with an invalid field used to set state and stop: on a phone
  // the button sits at the page bottom and the first error can be ~600px
  // above it, off-screen, so nothing observable happened. These refs let a
  // failed submit move the viewport and the caret to the field at fault.
  const fieldRefs = useRef<Partial<Record<keyof FieldErrors, HTMLElement | null>>>({});
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const FIELD_ORDER: (keyof FieldErrors)[] = ["name", "phone", "city"];

  const whatsappMessage = confirmed
    ? buildWhatsAppOrderMessage({
        locale,
        orderCode: confirmed.code,
        lines: confirmed.items,
        total: confirmed.total,
        customerName: confirmed.customerName,
        city: confirmed.city,
      })
    : "";
  const whatsappUrl = confirmed ? buildWhatsAppUrl(whatsappNumber, whatsappMessage) : null;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!form.name.trim()) errors.name = t("errors.nameRequired");
    if (!isValidMauritanianPhone(form.phone)) errors.phone = t("errors.phoneInvalid");
    if (!form.city) errors.city = t("errors.cityRequired");
    return errors;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      // Next paint, so the summary block exists before we move to it. Focus
      // goes to the summary itself, not the first bad field: the summary sits
      // beside the button the customer just pressed, so what they see and
      // where their caret is stay the same place. Each row inside it then
      // jumps to its own field.
      requestAnimationFrame(() => {
        errorSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        errorSummaryRef.current?.focus({ preventScroll: true });
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          customerName: form.name.trim(),
          phone: form.phone,
          city: form.city,
          note: form.note.trim() || undefined,
          items: cart.map((line) => ({
            key: line.key,
            kind: line.kind,
            productId: line.productId,
            variantId: line.variantId,
            bundleId: line.bundleId,
            qty: line.qty,
          })),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        if (payload?.error?.code === "CONFLICT") {
          const unavailableKeys: string[] = payload.error.details?.unavailableKeys ?? [];
          for (const key of unavailableKeys) removeFromCart(key);
          setFormError(`${t("errors.conflictTitle")} — ${t("errors.conflictBody")}`);
        } else {
          setFormError(payload?.error?.message ?? t("errors.generic"));
        }
        return;
      }

      clearCart();
      setConfirmed(payload as ConfirmedOrder);
    } catch {
      setFormError(t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        {/* The panel carries border and shadow at every width, matching the
            form state it replaces. It used to be `sm:`-only, so on a phone the
            card visually dissolved at the exact moment the order succeeded —
            the one moment in the flow that most needs to feel like it landed
            somewhere solid. */}
        <div className="border border-border bg-background p-6 shadow-[0_24px_64px_oklch(0.204_0.009_59.14_/_0.22)] sm:p-8">
          <div className="flex items-center gap-3">
            <CircleCheck className="size-7 shrink-0 text-ink" aria-hidden="true" />
            <h1 className="font-display text-2xl font-medium text-ink sm:text-3xl">{t("confirmation.title")}</h1>
          </div>

          <div className="mt-6 border-y border-border py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
                {t("confirmation.orderCodeLabel")}
              </span>
              <span className="font-mono text-lg text-ink">{confirmed.code}</span>
            </div>
            {/* Code + phone is the only credential that will ever retrieve
                this order, and there are no accounts to fall back on. */}
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">{t("confirmation.saveCode")}</p>
          </div>

          <ul className="mt-2">
            {confirmed.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex items-center gap-3 border-b border-border py-3">
                <span className="line-clamp-2 min-w-0 flex-1 text-sm text-ink">
                  {item.name} <span className="text-ink-soft">×{item.qty}</span>
                </span>
                <span className="shrink-0 font-mono text-sm text-ink">{formatMoney(item.unitPrice * item.qty)}</span>
              </li>
            ))}
          </ul>

          {/* `discountTotal` was fetched and never rendered, so the first
              promotion would have labelled a reduced figure "total" with no
              explanation of where the difference went. */}
          {confirmed.discountTotal > 0 && (
            <>
              <div className="flex items-baseline justify-between pt-4 text-sm text-ink-soft">
                <span>{t("summary.subtotal")}</span>
                <span className="font-mono">{formatMoney(confirmed.subtotal)}</span>
              </div>
              <div className="flex items-baseline justify-between pt-1.5 text-sm font-semibold text-plum">
                <span>{t("summary.discount")}</span>
                <span className="font-mono">−{formatMoney(confirmed.discountTotal)}</span>
              </div>
            </>
          )}

          <div className="flex items-baseline justify-between pt-4">
            <span className="text-sm font-medium text-ink">{t("summary.total")}</span>
            <span className="font-mono text-lg text-ink">{formatMoney(confirmed.total)}</span>
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <h2 className="text-sm font-semibold tracking-[0.04em] text-ink uppercase">
              {t("confirmation.nextStepsTitle")}
            </h2>
            <p className="mt-2 text-sm text-ink-soft">{t("confirmation.nextStepsBody")}</p>

            {whatsappUrl ? (
              <>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 flex h-12 w-full items-center justify-center rounded-[2px] bg-ink text-xs font-semibold tracking-[0.05em] text-paper uppercase transition-colors hover:bg-[oklch(0.29_0.012_59.14)]"
                >
                  {t("confirmation.whatsappCta")}
                </a>
              </>
            ) : (
              /* Without a configured number the product's whole mechanism
                 dead-ended here. The order message already exists as plain
                 text (`buildWhatsAppOrderMessage`), so hand it to the
                 customer rather than leaving them with a code and no channel
                 — the "copy message" fallback whatsapp.ts always anticipated. */
              <div className="mt-5 border border-border p-4">
                <p className="text-sm leading-relaxed text-ink">{t("confirmation.whatsappUnavailable")}</p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(whatsappMessage).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    );
                  }}
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[2px] border border-ink text-xs font-semibold tracking-[0.05em] text-ink uppercase transition-colors hover:bg-ink hover:text-paper"
                >
                  <Copy className="size-4" aria-hidden="true" />
                  {copied ? t("confirmation.copied") : t("confirmation.copyCta")}
                </button>
                <p aria-live="polite" className="sr-only">
                  {copied ? t("confirmation.copied") : ""}
                </p>
              </div>
            )}
          </div>

          {/* The customer is holding a code and the site has a tracking page;
              the confirmation used to mention neither. Pre-filling both halves
              of the credential makes the end of the journey one tap. */}
          <Link
            href={{ pathname: "/track", query: { code: confirmed.code, phone: form.phone } }}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-[2px] border border-ink text-xs font-semibold tracking-[0.05em] text-ink uppercase transition-colors hover:bg-ink hover:text-paper"
          >
            {t("confirmation.trackCta")}
          </Link>

          <Link
            href="/catalog"
            className="mt-6 inline-flex min-h-11 items-center text-xs font-medium tracking-[0.04em] text-ink underline underline-offset-4 uppercase transition-colors hover:text-plum"
          >
            {t("confirmation.backToShop")}
          </Link>
        </div>
      </div>
    );
  }

  // Reserve the panel's height before the cart is known, so the empty state
  // and the real form occupy the same box and neither pushes the footer.
  if (!hydrated) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14" aria-busy="true">
        {/* Mirrors the real panel's structure, not just a rough block: title,
            three summary rows, a total, four field groups and the button. A
            skeleton that is the wrong height only moves the shift later. */}
        <div className="border border-border bg-background p-6 shadow-[0_24px_64px_oklch(0.204_0.009_59.14_/_0.22)] sm:p-8">
          <div className="h-9 w-44 animate-pulse bg-border" />
          <div className="mt-6 h-4 w-28 animate-pulse bg-border/60" />
          <div className="mt-2 flex flex-col">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3 border-b border-border py-3">
                <div className="size-12 shrink-0 animate-pulse bg-border/60" />
                <div className="h-4 flex-1 animate-pulse bg-border/60" />
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-4">
            <div className="h-5 w-20 animate-pulse bg-border/60" />
            <div className="h-6 w-24 animate-pulse bg-border/60" />
          </div>
          <div className="mt-8 flex flex-col gap-6 border-t border-border pt-8">
            {[0, 1, 2].map((field) => (
              <div key={field}>
                <div className="h-3 w-24 animate-pulse bg-border/60" />
                <div className="mt-2 h-12 w-full animate-pulse bg-border/60" />
              </div>
            ))}
            <div>
              <div className="h-3 w-24 animate-pulse bg-border/60" />
              <div className="mt-2 h-[86px] w-full animate-pulse bg-border/60" />
            </div>
            <div>
              <div className="h-12 w-full animate-pulse bg-border" />
              <div className="mt-3 h-8 w-full animate-pulse bg-border/40" />
            </div>
          </div>
          <span className="sr-only">{t("heading")}</span>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    // A failed submit that removed every unavailable line (the `CONFLICT`
    // branch in `handleSubmit`) lands here too, since it empties the cart
    // as a side effect — this used to render the same generic "cart is
    // empty, go browse" screen as a customer who never added anything,
    // with the real reason (`formError`) set but never shown. A customer
    // whose order silently vanished with no explanation is a lost order;
    // this branch now leads with why, when there is a why.
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 py-10 text-center sm:px-6 sm:py-14">
        {formError ? (
          <p role="alert" aria-live="assertive" className="mb-6 flex items-start gap-2 border border-plum p-3.5 text-start text-sm font-medium text-plum">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{formError}</span>
          </p>
        ) : null}
        <ShoppingBag className="mx-auto size-10 text-ink-soft" aria-hidden="true" />
        <h1 className="mt-4 font-display text-2xl font-medium text-ink">{t("emptyTitle")}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t("emptyBody")}</p>
        <Link
          href="/catalog"
          className="mt-6 inline-flex h-12 items-center rounded-[2px] border border-ink px-6 text-xs font-semibold tracking-[0.04em] text-ink uppercase transition-colors hover:bg-ink hover:text-paper"
        >
          {t("emptyCta")}
        </Link>
      </div>
    );
  }

  const subtotal = cartSubtotal(cart);
  const hasFieldErrors = FIELD_ORDER.some((key) => fieldErrors[key]);
  const cityOptions: { value: CheckoutCity; label: string; delivery: string }[] = [
    { value: "ndb", label: t("form.cityNdb"), delivery: t("form.deliveryNdb") },
    { value: "nkc", label: t("form.cityNkc"), delivery: t("form.deliveryBus") },
  ];
  const selectedCity = cityOptions.find((option) => option.value === form.city);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="border border-border bg-background p-6 shadow-[0_24px_64px_oklch(0.204_0.009_59.14_/_0.22)] sm:p-8">
        <h1 className="font-display text-2xl font-medium text-ink sm:text-3xl">{t("heading")}</h1>

        <h2 className="mt-6 text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">{t("summary.title")}</h2>
        <ul className="mt-2">
          {cart.map((line) => (
            <CartLineRow key={line.key} line={line} locale={locale} />
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-border pt-4">
          <span className="text-sm font-medium text-ink">{t("summary.total")}</span>
          <span className="font-mono text-lg text-ink">{formatMoney(subtotal)}</span>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-6 border-t border-border pt-8">
          <div>
            <label htmlFor="checkout-name" className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
              {t("form.nameLabel")}
            </label>
            <input
              id="checkout-name"
              ref={(node) => {
                fieldRefs.current.name = node;
              }}
              type="text"
              autoComplete="name"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              aria-invalid={!!fieldErrors.name}
              aria-describedby={fieldErrors.name ? "checkout-name-error" : undefined}
              className={`mt-2 h-12 w-full rounded-[2px] border bg-transparent px-3.5 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm ${
                fieldErrors.name ? "border-plum" : "border-border focus:border-ink"
              }`}
            />
            {fieldErrors.name && <FieldError id="checkout-name-error">{fieldErrors.name}</FieldError>}
          </div>

          <div>
            <label htmlFor="checkout-phone" className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
              {t("form.phoneLabel")}
            </label>
            {/* `dir="ltr"` on the row keeps the +222 prefix welded to the
                digits in Arabic. Without it the prefix sat at the inline-start
                edge while the LTR input left-aligned its text, leaving ~200px
                of empty field between the two halves of one phone number. */}
            <div
              dir="ltr"
              className={`mt-2 flex h-12 items-stretch rounded-[2px] border has-focus-visible:ring-2 has-focus-visible:ring-ring/50 ${
                fieldErrors.phone ? "border-plum" : "border-border focus-within:border-ink"
              }`}
            >
              <span className="flex items-center border-e border-border px-3 font-mono text-sm text-ink-soft">
                +222
              </span>
              <input
                id="checkout-phone"
                ref={(node) => {
                  fieldRefs.current.phone = node;
                }}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={8}
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value.replace(/\D/g, "").slice(0, 8))}
                aria-invalid={!!fieldErrors.phone}
                aria-describedby={fieldErrors.phone ? "checkout-phone-error" : "checkout-phone-hint"}
                className="h-full min-w-0 flex-1 bg-transparent px-3.5 font-mono text-base text-ink outline-none md:text-sm"
              />
            </div>
            {fieldErrors.phone ? (
              <FieldError id="checkout-phone-error">{fieldErrors.phone}</FieldError>
            ) : (
              <p id="checkout-phone-hint" className="mt-1.5 text-xs text-ink-soft">
                {t("form.phoneHint")}
              </p>
            )}
          </div>

          {/* `aria-invalid` belongs on the group, not on each radio — the
              role does not support it on the individual inputs. */}
          <fieldset
            role="radiogroup"
            aria-invalid={!!fieldErrors.city}
            aria-describedby={fieldErrors.city ? "checkout-city-error" : undefined}
          >
            <legend className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">{t("form.cityLabel")}</legend>
            {/* This is the only branching decision in the whole purchase flow,
                and it used to render as two boxes pixel-identical to the text
                inputs above, distinguished only by a 1px hairline changing
                shade. A drawn radio mark plus the Plum-Soft selected tint
                DESIGN.md reserved for exactly this makes the choice, and the
                choice already made, readable at a glance. */}
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {cityOptions.map((option, index) => {
                const isSelected = form.city === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-[2px] border px-4 py-3 text-sm font-medium text-ink transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring/50 ${
                      isSelected
                        ? "border-ink bg-plum-soft"
                        : fieldErrors.city
                          ? "border-plum"
                          : "border-border hover:border-ink"
                    }`}
                  >
                    <input
                      ref={(node) => {
                        if (index === 0) fieldRefs.current.city = node;
                      }}
                      type="radio"
                      name="city"
                      value={option.value}
                      checked={isSelected}
                      onChange={() => updateField("city", option.value)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isSelected ? "border-ink" : "border-border"
                      }`}
                    >
                      {isSelected && <span className="size-2.5 rounded-full bg-ink" />}
                    </span>
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
            {fieldErrors.city && <FieldError id="checkout-city-error">{fieldErrors.city}</FieldError>}
            {selectedCity && !fieldErrors.city && <p className="mt-2 text-xs text-ink-soft">{selectedCity.delivery}</p>}
          </fieldset>

          <div>
            <label htmlFor="checkout-note" className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
              {t("form.noteLabel")}
            </label>
            <textarea
              id="checkout-note"
              rows={3}
              value={form.note}
              onChange={(event) => updateField("note", event.target.value)}
              className="mt-2 w-full resize-none rounded-[2px] border border-border bg-transparent px-3.5 py-3 text-base text-ink outline-none focus:border-ink focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm"
            />
          </div>

          {formError && (
            <p role="alert" aria-live="assertive" className="flex items-start gap-2 border border-plum p-3.5 text-sm font-medium text-plum">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </p>
          )}

          {/* A summary next to the button the customer just pressed, because
              the field it points at can be an entire screen away. Each row
              moves focus to its own field, so the fix is one tap from here. */}
          {hasFieldErrors && (
            <div
              ref={errorSummaryRef}
              role="alert"
              tabIndex={-1}
              className="scroll-mt-24 border border-plum p-3.5 text-plum outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <p className="flex items-start gap-2 text-sm font-semibold">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{t("errors.summaryTitle")}</span>
              </p>
              <ul className="mt-2 flex flex-col items-start gap-1 ps-6">
                {FIELD_ORDER.filter((key) => fieldErrors[key]).map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => fieldRefs.current[key]?.focus()}
                      className="text-start text-xs font-medium underline underline-offset-4"
                    >
                      {fieldErrors[key]}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={submitting}
              className="h-12 w-full scroll-mb-24 rounded-[2px] bg-ink text-xs font-semibold tracking-[0.05em] text-paper uppercase transition-colors hover:bg-[oklch(0.29_0.012_59.14)] disabled:cursor-not-allowed disabled:bg-ink/30"
            >
              {submitting ? t("form.submitting") : t("form.submit")}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">{t("form.reassurance")}</p>
          </div>
        </form>
      </div>
    </div>
  );
}
