"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createStaffAction } from "@/src/services/user-actions";

export function CreateStaffForm() {
  const t = useTranslations("admin.users");
  const [state, formAction, isPending] = useActionState(createStaffAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <section className="border-t border-border pt-8">
      <h2 className="font-heading text-lg font-semibold text-ink">{t("addStaffTitle")}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t("addStaffSubtitle")}</p>

      <form ref={formRef} action={formAction} className="mt-6 grid gap-4 sm:grid-cols-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="staff-name">{t("nameLabel")}</Label>
          <Input
            id="staff-name"
            name="name"
            required
            className="h-11 rounded-md border-border px-3.5 focus-visible:border-gold focus-visible:ring-gold/30"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="staff-email">{t("emailLabel")}</Label>
          <Input
            id="staff-email"
            name="email"
            type="email"
            required
            className="h-11 rounded-md border-border px-3.5 focus-visible:border-gold focus-visible:ring-gold/30"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="staff-password">{t("passwordLabel")}</Label>
          <Input
            id="staff-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="h-11 rounded-md border-border px-3.5 focus-visible:border-gold focus-visible:ring-gold/30"
          />
        </div>

        <div className="sm:col-span-3" aria-live="polite">
          {state && !state.ok ? (
            <p className="rounded-md bg-red-bg px-3.5 py-2.5 text-sm text-red-text">
              {state.error.message}
            </p>
          ) : null}
          {state?.ok ? (
            <p className="rounded-md bg-green-bg px-3.5 py-2.5 text-sm text-green-text">
              {t("addSuccess")}
            </p>
          ) : null}
        </div>

        <div className="sm:col-span-3">
          <Button
            type="submit"
            disabled={isPending}
            className="h-10 rounded-full bg-ink px-5 text-paper transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-[color-mix(in_oklch,var(--ink),white_10%)] active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {isPending ? t("addSubmitting") : t("addSubmit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
