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
      // Rides on the session so a gate costs no extra round trip. `input:
      // false` keeps it un-settable through any auth endpoint — the only
      // writer is `setStaffPermissions` in `src/services/users.ts`, behind
      // the admin-only `users.manage` gate.
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
