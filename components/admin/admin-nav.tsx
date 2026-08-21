"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  FolderTree,
  Gift,
  LayoutDashboard,
  LogOut,
  Package,
  ScanLine,
  Settings,
  ShoppingBag,
  Tag,
  Tags,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Link, usePathname } from "@/src/i18n/navigation";
import { routing } from "@/src/i18n/routing";
import { ADMIN_SECTIONS, type Permission } from "@/src/lib/permissions";
import { signOutAction } from "@/src/services/session-actions";

type AdminHref = ComponentProps<typeof Link>["href"];

type NavLink = {
  href: AdminHref;
  label: string;
  icon: LucideIcon;
  active: boolean;
};

/**
 * Icon and translation key per admin section. The section list, its order,
 * and the permission each one needs live in `src/lib/permissions.ts` — the
 * same array the service gates and the post-login landing choice read, so
 * the sidebar can never offer a page the gate then refuses.
 */
const SECTION_CHROME: Record<
  (typeof ADMIN_SECTIONS)[number]["href"],
  { icon: LucideIcon; labelKey: string; matches: (pathname: string) => boolean }
> = {
  "/admin": { icon: LayoutDashboard, labelKey: "dashboard", matches: (p) => p === "/admin" },
  "/admin/orders": { icon: ShoppingBag, labelKey: "orders", matches: (p) => p.startsWith("/admin/orders") },
  "/admin/pos": { icon: ScanLine, labelKey: "pos", matches: (p) => p.startsWith("/admin/pos") },
  "/admin/inventory": { icon: Warehouse, labelKey: "inventory", matches: (p) => p.startsWith("/admin/inventory") },
  "/admin/categories": { icon: FolderTree, labelKey: "categories", matches: (p) => p === "/admin/categories" },
  "/admin/products": { icon: Package, labelKey: "products", matches: (p) => p.startsWith("/admin/products") },
  "/admin/bundles": { icon: Gift, labelKey: "bundles", matches: (p) => p.startsWith("/admin/bundles") },
  "/admin/promotions": { icon: Tag, labelKey: "promotions", matches: (p) => p.startsWith("/admin/promotions") },
  "/admin/labels/sheet": { icon: Tags, labelKey: "labels", matches: (p) => p.startsWith("/admin/labels") },
  "/admin/users": { icon: Users, labelKey: "users", matches: (p) => p.startsWith("/admin/users") },
  "/admin/settings": { icon: Settings, labelKey: "settings", matches: (p) => p === "/admin/settings" },
};

/**
 * Admin/POS chrome — the shadcn/ui sidebar block (`components/ui/sidebar.tsx`),
 * white (the design system's own `--sidebar` token, already `paper`/`ink`),
 * collapsible to an icon rail via `SidebarTrigger`, and persistent from
 * tablet width up (`md`, 768px — the `useIsMobile` breakpoint the block
 * ships with, matching PRODUCT.md: the owner runs Admin/POS from a tablet).
 * A vertical list has no width ceiling the way the original horizontal top
 * bar did, so this is also what fixed nav crowding — worst in French, whose
 * labels run longer than Arabic's.
 */
export function AdminNav({
  name,
  role,
  permissions,
  children,
}: {
  name: string;
  role: "admin" | "staff";
  permissions: Permission[];
  children: ReactNode;
}) {
  const t = useTranslations("admin.nav");
  const tDashboard = useTranslations("admin.dashboard");
  const pathname = usePathname();
  const locale = useLocale();

  const otherLocale = routing.locales.find((candidate) => candidate !== locale) ?? routing.locales[0];
  const roleLabel = role === "admin" ? tDashboard("roleAdmin") : tDashboard("roleStaff");
  const localeLabel = t(`localeSwitch.${otherLocale}` as "localeSwitch.ar" | "localeSwitch.fr");

  // The wordmark is a "go home" affordance, and home is whatever the account
  // can actually open — for a staff member without the dashboard that is
  // their first granted section, not a page that would bounce them.
  const homeHref: AdminHref = (ADMIN_SECTIONS.find(
    (section) => role === "admin" || permissions.includes(section.permission),
  )?.href ?? "/admin") as AdminHref;

  const links: NavLink[] = ADMIN_SECTIONS.filter(
    (section) => role === "admin" || permissions.includes(section.permission),
  ).map((section) => {
    const chrome = SECTION_CHROME[section.href];
    return {
      href: section.href as AdminHref,
      label: t(chrome.labelKey as Parameters<typeof t>[0]),
      icon: chrome.icon,
      active: chrome.matches(pathname),
    };
  });

  return (
    <TooltipProvider>
      <SidebarProvider className="admin print:block">
        <Sidebar side={locale === "ar" ? "right" : "left"} collapsible="icon" className="print:hidden">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" render={<Link href={homeHref} />}>
                  <span className="font-display text-lg font-semibold text-ink">TFT</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {links.map((link) => (
                    <SidebarMenuItem key={link.label}>
                      <SidebarMenuButton render={<Link href={link.href} />} isActive={link.active} tooltip={link.label}>
                        <link.icon />
                        <span>{link.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarSeparator />

          <SidebarFooter>
            <div className="flex items-center justify-between gap-2 px-1 py-1 group-data-[collapsible=icon]:hidden">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-sidebar-foreground">{name}</p>
                <p className="text-xs text-sidebar-foreground/60">{roleLabel}</p>
              </div>
              <Link
                href={pathname}
                locale={otherLocale}
                className="shrink-0 rounded-xs border border-sidebar-border px-3 py-1.5 text-xs font-medium tracking-[0.04em] text-sidebar-foreground uppercase transition-colors hover:bg-ink hover:text-paper"
              >
                {localeLabel}
              </Link>
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <form action={signOutAction}>
                  <SidebarMenuButton tooltip={t("signOut")} render={<button type="submit" />}>
                    <LogOut />
                    <span>{t("signOut")}</span>
                  </SidebarMenuButton>
                </form>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>

          <SidebarRail />
        </Sidebar>

        <SidebarInset className="print:m-0">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 md:h-16 md:px-4 print:hidden">
            {/* `size="icon-sm"` renders 28×28 — under the 44px floor on the
                tablet this admin is actually operated from. */}
            <SidebarTrigger className="size-11" />
            <Link href={homeHref} className="flex items-center gap-2 md:hidden">
              <span className="font-display text-lg font-semibold text-ink">TFT</span>
            </Link>
          </header>
          <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 print:p-0">
            <div className="mx-auto max-w-6xl print:max-w-none">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
