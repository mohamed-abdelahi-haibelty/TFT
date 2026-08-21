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
          className="h-11 rounded-xs border-border px-3.5 text-base focus-visible:border-ink focus-visible:ring-0"
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
          className="h-11 rounded-xs border-border px-3.5 text-base focus-visible:border-ink focus-visible:ring-0"
        />
      </div>

      <div aria-live="polite">
        {state && !state.ok ? (
          <p className="rounded-xs border border-plum px-3.5 py-2.5 text-sm font-semibold text-plum" role="alert">
            {state.error.message}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-xs bg-ink text-xs font-semibold tracking-wider text-paper uppercase transition-colors hover:bg-[oklch(0.29_0.012_59.14)] disabled:opacity-70"
      >
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
