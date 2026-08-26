import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/src/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

const ADMIN_PATH_PATTERN = /^\/(ar|fr)\/admin(\/|$)/;
const ADMIN_LOGIN_PATTERN = /^\/(ar|fr)\/admin\/login\/?$/;

function isProtectedAdminRoute(pathname: string) {
  return ADMIN_PATH_PATTERN.test(pathname) && !ADMIN_LOGIN_PATTERN.test(pathname);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Session presence only — role enforcement happens in requireUser() at the
  // service layer per next.js's own guidance to never rely on proxy alone.
  if (isProtectedAdminRoute(pathname) && !getSessionCookie(request)) {
    const locale = pathname.match(ADMIN_PATH_PATTERN)?.[1] ?? routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}/admin/login`, request.url));
  }

  return handleI18nRouting(request);
}

export const config = {
  // `icon` and `apple-icon` are Next's file-based metadata routes and, unlike
  // `favicon.ico` / `sitemap.xml` / `manifest.webmanifest`, their paths carry
  // no dot — so the catch-all below was locale-prefixing them into
  // `/ar/icon`, which 404s. Every `<link rel="icon">` on the site pointed at
  // a redirect to nothing.
  matcher: ["/((?!api|_next|_vercel|icon|apple-icon|.*\\..*).*)"],
};
