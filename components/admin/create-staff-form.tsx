"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck } from "lucide-react";
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
            className="h-11 rounded-xs border-border px-3.5 focus-visible:border-ink focus-visible:ring-0"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="staff-email">{t("emailLabel")}</Label>
          <Input
            id="staff-email"
            name="email"
            type="email"
            required
            className="h-11 rounded-xs border-border px-3.5 focus-visible:border-ink focus-visible:ring-0"
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
            className="h-11 rounded-xs border-border px-3.5 focus-visible:border-ink focus-visible:ring-0"
          />
        </div>

        <div className="sm:col-span-3" aria-live="polite">
          {state && !state.ok ? (
            <p role="alert" className="flex items-start gap-2 rounded-xs border border-plum px-3.5 py-2.5 text-sm font-medium text-plum">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {state.error.message}
            </p>
          ) : null}
          {state?.ok ? (
            <p className="flex items-center gap-2 text-sm text-ink">
              <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
              {t("addSuccess")}
            </p>
          ) : null}
        </div>

        <div className="sm:col-span-3">
          <Button
            type="submit"
            disabled={isPending}
            className="h-10 rounded-xs bg-ink px-5 text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)] disabled:opacity-70"
          >
            {isPending ? t("addSubmitting") : t("addSubmit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
