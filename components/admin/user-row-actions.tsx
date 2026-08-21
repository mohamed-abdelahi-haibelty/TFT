"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toggleUserActiveAction, resetPasswordAction } from "@/src/services/user-actions";

export function UserRowActions({
  userId,
  isActive,
  isSelf,
}: {
  userId: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  const t = useTranslations("admin.users");
  const [showReset, setShowReset] = useState(false);
  const boundResetAction = resetPasswordAction.bind(null, userId);
  const [resetState, resetFormAction, isResetPending] = useActionState(boundResetAction, null);

  if (isSelf) {
    return <span className="text-sm text-ink-soft">{t("you")}</span>;
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <form action={toggleUserActiveAction.bind(null, userId, !isActive)}>
          <Button
            type="submit"
            variant={isActive ? "destructive" : "secondary"}
            className="h-8 rounded-xs px-3.5 text-xs"
          >
            {isActive ? t("deactivate") : t("reactivate")}
          </Button>
        </form>

        <Button
          type="button"
          variant="ghost"
          className="h-8 rounded-xs px-3.5 text-xs"
          onClick={() => setShowReset((v) => !v)}
        >
          {t("resetPasswordToggle")}
        </Button>
      </div>

      {showReset ? (
        <form action={resetFormAction} className="flex items-center gap-2" noValidate>
          <Input
            type="password"
            name="password"
            required
            minLength={8}
            placeholder={t("resetPasswordLabel")}
            className="h-9 w-44 rounded-md border-border px-3 text-sm focus-visible:border-ink focus-visible:ring-0"
          />
          <Button
            type="submit"
            disabled={isResetPending}
            className="h-9 rounded-xs bg-ink px-3.5 text-xs text-paper hover:bg-[color-mix(in_oklch,var(--ink),white_10%)]"
          >
            {t("resetPasswordSubmit")}
          </Button>
        </form>
      ) : null}

      {resetState ? (
        <p
          className={`text-xs font-semibold ${resetState.ok ? "text-ink" : "text-plum"}`}
          aria-live="polite"
        >
          {resetState.ok ? t("resetPasswordSuccess") : resetState.error.message}
        </p>
      ) : null}
    </div>
  );
}
