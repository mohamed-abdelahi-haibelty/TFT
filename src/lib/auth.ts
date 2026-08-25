import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/src/db/client";
import { env } from "@/src/lib/env";
import * as schema from "@/src/db/schema";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        input: false,
        defaultValue: "staff",
      },
      isActive: {
        type: "boolean",
        input: false,
        defaultValue: true,
      },
      // Read back with the session on every gate check. `session.cookieCache`
      // is deliberately NOT enabled: without it Better Auth re-reads the user
      // row per request, which is why revoking a permission takes effect
      // immediately. Turning cookie caching on would silently make revocation
      // lag by its TTL — if that trade is ever wanted, delete the target's
      // sessions in `setStaffPermissions` at the same time.
      //
      // `input: false` keeps it un-settable through any auth endpoint — the
      // only writer is `setStaffPermissions` in `src/services/users.ts`,
      // behind the admin-only `users.manage` gate.
      permissions: {
        type: "string[]",
        input: false,
        defaultValue: [],
      },
    },
  },
  advanced: {
    database: {
      generateId: false,
    },
  },
  plugins: [nextCookies()],
});
