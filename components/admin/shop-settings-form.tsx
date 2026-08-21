"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateShopSettingsAction } from "@/src/services/settings-actions";
import type { ShopSettings } from "@/src/services/settings";

export function ShopSettingsForm({ settings }: { settings: ShopSettings }) {
  const t = useTranslations("admin.settings");
  const { toast } = useToast();
  const [state, formAction, isPending] = useActionState(updateShopSettingsAction, null);

  useEffect(() => {
    if (state?.ok) toast(t("saveSuccess"));
  }, [state, t, toast]);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-whatsapp">{t("whatsappLabel")}</Label>
        <Input
          id="settings-whatsapp"
          name="whatsappNumber"
          type="text"
          inputMode="numeric"
          dir="ltr"
          defaultValue={settings.whatsappNumber ?? ""}
          placeholder="22227139094"
          aria-describedby="settings-whatsapp-hint"
          className="font-mono"
        />
        <p id="settings-whatsapp-hint" className="text-xs text-ink-soft">
          {t("whatsappHint")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-address-ar">{t("addressArLabel")}</Label>
          <Input id="settings-address-ar" name="addressAr" type="text" dir="rtl" defaultValue={settings.addressAr ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-address-fr">{t("addressFrLabel")}</Label>
          <Input id="settings-address-fr" name="addressFr" type="text" dir="ltr" defaultValue={settings.addressFr ?? ""} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-maps">{t("mapsLabel")}</Label>
        <Input
          id="settings-maps"
          name="mapsUrl"
          type="url"
          dir="ltr"
          defaultValue={settings.mapsUrl ?? ""}
          placeholder="https://maps.app.goo.gl/…"
          aria-describedby="settings-maps-hint"
        />
        <p id="settings-maps-hint" className="text-xs text-ink-soft">
          {t("mapsHint")}
        </p>
      </div>

      {state && !state.ok ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-xs border border-plum px-3.5 py-2.5 text-sm font-semibold text-plum"
        >
          <CircleAlert className="mt-px size-4 shrink-0" aria-hidden="true" />
          <span>{state.error.message}</span>
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <Button
          type="submit"
          disabled={isPending}
          className="h-10 w-fit rounded-xs bg-ink px-5 text-sm text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)] disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? t("saving") : t("save")}
        </Button>
        <p aria-live="polite" className="text-sm text-ink-soft">
          {state?.ok ? t("saveSuccess") : ""}
        </p>
      </div>
    </form>
  );
}
