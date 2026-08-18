"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
        <p role="alert" className="rounded-md border border-red bg-red-bg px-3.5 py-2.5 text-sm text-red-text">
          {state.error.message}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <Button
          type="submit"
          disabled={isPending}
          className="h-10 w-fit rounded-full bg-ink px-5 text-sm text-paper transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-[color-mix(in_oklch,var(--ink),white_10%)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
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
