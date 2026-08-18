import { getTranslations } from "next-intl/server";
import { localized } from "@/src/lib/locale-text";
import { getShopSettings } from "@/src/services/settings";

/** "Atelier Blanc" close: white, bordered, three-column — a quiet catalog-page footer, not a covered region. */
export async function SiteFooter({ locale }: { locale: string }) {
  const [t, settings] = await Promise.all([
    getTranslations({ locale, namespace: "store" }),
    getShopSettings(),
  ]);
  const { whatsappNumber, mapsUrl } = settings;
  // Empty until the owner fills it in from Admin → Settings; the block hides
  // rather than showing a placeholder, and nothing here is invented.
  const address = localized(locale, settings.addressAr ?? "", settings.addressFr ?? "");

  return (
    <footer className="mb-16 border-t border-border bg-background md:mb-0">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-lg font-semibold text-ink">TFT</p>
            <p className="mt-2 max-w-xs text-sm text-ink-soft">{t("footer.tagline")}</p>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-[0.06em] text-ink uppercase">{t("footer.contactTitle")}</h2>
            {whatsappNumber ? (
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-medium text-plum underline-offset-4 hover:underline"
              >
                {t("footer.whatsappCta")}
              </a>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">{t("footer.whatsappUnavailable")}</p>
            )}

            {address ? (
              <div className="mt-5">
                <h3 className="text-xs font-semibold tracking-[0.06em] text-ink uppercase">
                  {t("footer.addressTitle")}
                </h3>
                <address className="mt-2 text-sm not-italic text-ink-soft">{address}</address>
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm font-medium text-plum underline-offset-4 hover:underline"
                  >
                    {t("footer.mapsCta")}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-[0.06em] text-ink uppercase">{t("footer.locationsTitle")}</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
              <li>{t("footer.locationsNdb")}</li>
              <li>{t("footer.locationsNkc")}</li>
            </ul>
          </div>
        </div>

        <p className="mt-12 border-t border-border pt-6 text-xs text-ink-soft">
          {t("brandFull")} · {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}
