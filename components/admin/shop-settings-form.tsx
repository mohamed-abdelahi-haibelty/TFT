"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { SCHEMA_DAYS } from "@/src/lib/days";
import { updateShopSettingsAction } from "@/src/services/settings-actions";
import type { ShopSettings } from "@/src/services/settings";

/** Sentinel for "open all week". Base UI treats an empty string as no selection, so the *stored* empty value needs a non-empty stand-in in the UI. */
const NO_CLOSED_DAY = "none";

export function ShopSettingsForm({ settings }: { settings: ShopSettings }) {
  const t = useTranslations("admin.settings");
  const { toast } = useToast();
  const [state, formAction, isPending] = useActionState(updateShopSettingsAction, null);
  // The one controlled field on an otherwise uncontrolled form: Base UI's
  // Select doesn't submit a form value of its own, so it drives a hidden input
  // — the same pairing promotion-form.tsx uses.
  const [closedDay, setClosedDay] = useState(settings.closedDay ?? NO_CLOSED_DAY);

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

      {/* Structured-data only — none of this renders anywhere on the storefront.
          It is what a `LocalBusiness` record needs to put the shop on Google's
          local results and map pack, which the free-text address above cannot
          express. */}
      <fieldset className="flex flex-col gap-6 border-t border-border pt-6">
        <legend className="sr-only">{t("seoSectionTitle")}</legend>
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">{t("seoSectionTitle")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("seoSectionHint")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-street-ar">{t("streetArLabel")}</Label>
            <Input id="settings-street-ar" name="streetAr" type="text" dir="rtl" defaultValue={settings.streetAr ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-street-fr">{t("streetFrLabel")}</Label>
            <Input id="settings-street-fr" name="streetFr" type="text" dir="ltr" defaultValue={settings.streetFr ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-city">{t("cityLabel")}</Label>
            <Input id="settings-city" name="city" type="text" defaultValue={settings.city ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-postal">{t("postalCodeLabel")}</Label>
            <Input id="settings-postal" name="postalCode" type="text" dir="ltr" defaultValue={settings.postalCode ?? ""} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settings-latitude">{t("latitudeLabel")}</Label>
              <Input
                id="settings-latitude"
                name="latitude"
                type="text"
                inputMode="decimal"
                dir="ltr"
                defaultValue={settings.latitude ?? ""}
                placeholder="20.9412"
                aria-describedby="settings-coordinates-hint"
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settings-longitude">{t("longitudeLabel")}</Label>
              <Input
                id="settings-longitude"
                name="longitude"
                type="text"
                inputMode="decimal"
                dir="ltr"
                defaultValue={settings.longitude ?? ""}
                placeholder="-17.0347"
                aria-describedby="settings-coordinates-hint"
                className="font-mono"
              />
            </div>
          </div>
          <p id="settings-coordinates-hint" className="text-xs text-ink-soft">
            {t("coordinatesHint")}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settings-opens-at">{t("opensAtLabel")}</Label>
              <Input
                id="settings-opens-at"
                name="opensAt"
                type="time"
                dir="ltr"
                defaultValue={settings.opensAt ?? ""}
                aria-describedby="settings-hours-hint"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settings-closes-at">{t("closesAtLabel")}</Label>
              <Input
                id="settings-closes-at"
                name="closesAt"
                type="time"
                dir="ltr"
                defaultValue={settings.closesAt ?? ""}
                aria-describedby="settings-hours-hint"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settings-closed-day">{t("closedDayLabel")}</Label>
              <input type="hidden" name="closedDay" value={closedDay === NO_CLOSED_DAY ? "" : closedDay} readOnly />
              <Select value={closedDay} onValueChange={(value) => setClosedDay(value ?? NO_CLOSED_DAY)}>
                <SelectTrigger id="settings-closed-day" size="lg" className="w-full">
                  <SelectValue placeholder={t("closedDayLabel")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLOSED_DAY}>{t("closedDayNone")}</SelectItem>
                  {SCHEMA_DAYS.map((day) => (
                    <SelectItem key={day} value={day}>
                      {t(`days.${day}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p id="settings-hours-hint" className="text-xs text-ink-soft">
            {t("hoursHint")}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settings-instagram">{t("instagramLabel")}</Label>
              <Input
                id="settings-instagram"
                name="instagramUrl"
                type="url"
                dir="ltr"
                defaultValue={settings.instagramUrl ?? ""}
                placeholder="https://instagram.com/…"
                aria-describedby="settings-social-hint"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settings-facebook">{t("facebookLabel")}</Label>
              <Input
                id="settings-facebook"
                name="facebookUrl"
                type="url"
                dir="ltr"
                defaultValue={settings.facebookUrl ?? ""}
                placeholder="https://facebook.com/…"
                aria-describedby="settings-social-hint"
              />
            </div>
          </div>
          <p id="settings-social-hint" className="text-xs text-ink-soft">
            {t("socialHint")}
          </p>
        </div>
      </fieldset>

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
