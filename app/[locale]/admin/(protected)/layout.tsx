import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { ToastProvider } from "@/components/ui/toast";
import { requireUser } from "@/src/services/authz";

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

  return (
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
  );
}
