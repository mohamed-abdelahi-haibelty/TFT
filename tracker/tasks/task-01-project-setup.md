# Task 01 — Project Setup

## Goal
A running Next.js 16 skeleton with all infrastructure wired: TypeScript strict, Tailwind + shadcn/ui, Drizzle + Neon connection, next-intl (ar default RTL, fr), proxy.ts locale routing, global error boundaries, logger, env handling.

## Depends on
Nothing.

## Scope
- `create-next-app` (Next 16, App Router, TS, Tailwind). Strict tsconfig.
- Install: drizzle-orm, @neondatabase/serverless, drizzle-kit, zod, better-auth, next-intl, bwip-js, vitest. shadcn init.
- Folder structure per `code-standards.md` → File Organization.
- `src/db/client.ts` Neon + Drizzle client reading `DATABASE_URL`.
- Env validation module (Zod) that fails the build on missing vars; copy `context/env.example` to project root as `.env.example`.
- next-intl setup: `ar` (default, `dir="rtl"`) and `fr`; locale switch persisted; message files with a starter set of common keys.
- `proxy.ts`: locale handling; placeholder admin gate (real session check comes in Task 03).
- Global boundaries from `error-handling.md`: `error.tsx`, `global-error.tsx`, `not-found.tsx`, `withErrorHandling` helper, `src/lib/logger.ts`.
- Placeholder home page rendering a translated string in both locales.
- Vitest configured; one smoke test for the env validator.

## Out of scope
Any real page, schema, or auth logic.

## Done when
- [ ] `npm run dev` serves `/ar` (RTL) and `/fr` with translated placeholder.
- [ ] Missing env var fails startup with a clear message.
- [ ] Visiting an unknown route shows the localized 404.
- [ ] `npm run build` and `npm test` pass.
