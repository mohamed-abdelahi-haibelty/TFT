"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
  // Deactivating signs the account out everywhere and takes effect instantly,
  // so it asks first — same two-step shape as deleting a category.
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const boundResetAction = resetPasswordAction.bind(null, userId);
  const [resetState, resetFormAction, isResetPending] = useActionState(boundResetAction, null);

  const [toggleState, toggleFormAction, isTogglePending] = useActionState(
    toggleUserActiveAction.bind(null, userId, !isActive),
    null,
  );

  useEffect(() => {
    if (confirmingDeactivate) confirmRef.current?.focus();
  }, [confirmingDeactivate]);

  if (isSelf) {
    return <span className="text-sm text-ink-soft">{t("you")}</span>;
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {!isActive ? (
          <form action={toggleFormAction}>
            <Button type="submit" variant="secondary" disabled={isTogglePending} className="h-8 rounded-xs px-3.5 text-xs">
              {t("reactivate")}
            </Button>
          </form>
        ) : confirmingDeactivate ? (
          <div className="flex flex-col gap-1.5">
            <p className="max-w-64 text-xs text-ink">{t("deactivateConfirm")}</p>
            <div className="flex items-center gap-2">
              <form action={toggleFormAction}>
                <Button
                  ref={confirmRef}
                  type="submit"
                  variant="destructive"
                  disabled={isTogglePending}
                  className="h-8 rounded-xs px-3.5 text-xs"
                >
                  {t("deactivateConfirmSubmit")}
                </Button>
              </form>
              <Button
                type="button"
                variant="ghost"
                className="h-8 rounded-xs px-3.5 text-xs"
                onClick={() => setConfirmingDeactivate(false)}
              >
                {t("deactivateConfirmDismiss")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="destructive"
            className="h-8 rounded-xs px-3.5 text-xs"
            onClick={() => setConfirmingDeactivate(true)}
          >
            {t("deactivate")}
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          className="h-8 rounded-xs px-3.5 text-xs"
          onClick={() => setShowReset((v) => !v)}
        >
          {t("resetPasswordToggle")}
        </Button>
      </div>

      {toggleState && !toggleState.ok ? (
        <p className="max-w-64 text-xs font-semibold text-plum" role="alert">
          {toggleState.error.message}
        </p>
      ) : null}

      {showReset ? (
        <form action={resetFormAction} className="flex items-center gap-2" noValidate>
          <Input
            type="password"
            name="password"
            required
            minLength={8}
            maxLength={128}
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
