import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/src/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

const ADMIN_PATH_PATTERN = /^\/(ar|fr)\/admin(\/|$)/;

function isAdminRoute(pathname: string) {
  return ADMIN_PATH_PATTERN.test(pathname);
}

export function proxy(request: NextRequest) {
  if (isAdminRoute(request.nextUrl.pathname)) {
    // Placeholder — real Better Auth session/role check lands in Task 03.
  }

  return handleI18nRouting(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
