"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/src/i18n/navigation";
import { toggleBundleActiveAction } from "@/src/services/bundle-actions";

export function BundleRowActions({
  bundleId,
  isActive,
  name,
}: {
  bundleId: string;
  isActive: boolean;
  name: string;
}) {
  const t = useTranslations("admin.bundles");
  const { toast } = useToast();
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const action = toggleBundleActiveAction.bind(null, bundleId, !isActive);
  const [state, formAction, isPending] = useActionState(action, null);
  const prevOk = useRef(false);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    setConfirmingDeactivate(false);
  }

  useEffect(() => {
    if (state?.ok && !prevOk.current) {
      toast(isActive ? t("deactivateSuccess") : t("activateSuccess"));
    }
    prevOk.current = Boolean(state?.ok);
  }, [state, t, toast, isActive]);

  useEffect(() => {
    if (confirmingDeactivate) confirmRef.current?.focus();
  }, [confirmingDeactivate]);

  if (confirmingDeactivate) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-ink">{t("deactivateConfirm", { name })}</p>
        <div className="flex items-center gap-2">
          <form action={formAction}>
            <Button
              type="submit"
              ref={confirmRef}
              disabled={isPending}
              className="h-11 rounded-xs bg-ink px-4 text-sm text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)]"
            >
              {isPending ? t("deactivateSubmitting") : t("deactivate")}
            </Button>
          </form>
          <Button
            type="button"
            variant="ghost"
            className="h-11 rounded-xs px-4 text-sm"
            onClick={() => setConfirmingDeactivate(false)}
          >
            {t("cancel")}
          </Button>
        </div>
        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-plum" aria-live="polite">
            <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
            {state.error.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/admin/bundles/${bundleId}`}
        className="inline-flex h-11 items-center rounded-xs border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
      >
        {t("edit")}
      </Link>
      {isActive ? (
        <Button
          type="button"
          variant="secondary"
          className="h-11 rounded-xs px-4 text-sm"
          onClick={() => setConfirmingDeactivate(true)}
        >
          {t("deactivate")}
        </Button>
      ) : (
        <form action={formAction}>
          <Button type="submit" disabled={isPending} className="h-11 rounded-xs px-4 text-sm">
            {isPending ? t("activateSubmitting") : t("activate")}
          </Button>
        </form>
      )}
      {state && !state.ok ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-plum" aria-live="polite">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {state.error.message}
        </p>
      ) : null}
    </div>
  );
}
