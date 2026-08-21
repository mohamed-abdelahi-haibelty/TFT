import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/admin/login-form";
import { requireUser } from "@/src/services/authz";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.login" });
  return { title: t("title") };
}

export default async function AdminLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireUser();
  if (auth.ok) {
    redirect(`/${locale}/admin`);
  }

  const t = await getTranslations("admin.login");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="font-display text-3xl font-semibold text-ink">TFT</span>
          <p className="mt-3 text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
            {t("brand")}
          </p>
          <h1 className="mt-3 font-heading text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="mt-1.5 text-sm text-ink-soft">{t("subtitle")}</p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
