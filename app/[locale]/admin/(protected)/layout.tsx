import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { ToastProvider } from "@/components/ui/toast";
import { ADMIN_MESSAGE_NAMESPACES, pickMessages } from "@/src/i18n/messages";
import { requireUser } from "@/src/services/authz";

/**
 * Every admin route hangs off this layout, and the first thing it does is read
 * the session — `requireUser()` calls `headers()`. Under Cache Components that
 * blocks the prerender, and there is nothing worth prerendering behind it: the
 * whole shell is per-operator, gated, and used by a handful of staff on known
 * devices. `instant = false` is the sanctioned answer for an auth-gated shell —
 * it marks the segment as allowed to block, and does not force the route
 * dynamic, so anything genuinely prerenderable below still ships a shell.
 *
 * The storefront takes the opposite posture on purpose: nothing there is
 * allowed to block, which is where the speed comes from.
 */
export const instant = false;

export default async function ProtectedAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireUser();
  if (!auth.ok) {
    redirect(`/${locale}/admin/login`);
  }

  const messages = await pickMessages(ADMIN_MESSAGE_NAMESPACES);

  return (
    <NextIntlClientProvider messages={messages}>
      <ToastProvider>
        {/*
          The shell only needs to know who is signed in; which sections it
          offers is decided from their permissions, against the same section
          map the service gates use.
        */}
        <AdminNav name={auth.data.name} role={auth.data.role} permissions={auth.data.permissions}>
          {children}
        </AdminNav>
      </ToastProvider>
    </NextIntlClientProvider>
  );
}
