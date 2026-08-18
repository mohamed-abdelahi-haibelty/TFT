"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/src/services/session-actions";

export function LoginForm() {
  const t = useTranslations("admin.login");
  const [state, formAction, isPending] = useActionState(signInAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("emailLabel")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state?.email ?? ""}
          required
          className="h-11 rounded-md border-border px-3.5 text-base focus-visible:border-gold focus-visible:ring-gold/30"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("passwordLabel")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-md border-border px-3.5 text-base focus-visible:border-gold focus-visible:ring-gold/30"
        />
      </div>

      <div aria-live="polite">
        {state && !state.ok ? (
          <p className="rounded-md bg-red-bg px-3.5 py-2.5 text-sm text-red-text">
            {state.error.message}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-full bg-gold text-ink transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-gold-strong active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
      >
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
