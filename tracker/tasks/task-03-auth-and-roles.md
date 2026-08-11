# Task 03 — Auth, Roles, User Management

## Goal
Admin/staff can sign in; admin routes are protected; admin can manage the staff account.

## Depends on
Task 02.

## Scope
- Better Auth configured (email/password, no public signup) with Drizzle adapter; `role` on session.
- `/[locale]/admin/login` page; successful login → `/admin` dashboard placeholder.
- `proxy.ts`: unauthenticated request to `/admin/*` (except login) → redirect to login.
- `src/services/authz.ts`: `requireUser(role?)` helper used by every admin service from now on; returns `UNAUTHORIZED`/`FORBIDDEN` per taxonomy.
- Admin → Users page (`/admin/users`, admin only): list users, create staff (name, email, password), deactivate/reactivate, reset password. Cannot delete self, cannot create a second admin.
- Sign out.

## Done when
- [ ] Wrong credentials show localized error; correct ones reach `/admin`.
- [ ] Staff visiting `/admin/users` gets a localized forbidden screen.
- [ ] Admin creates a staff account and that account can sign in.
- [ ] Integration test: service-level `requireUser('admin')` rejects staff.
- [ ] Build + tests pass.
