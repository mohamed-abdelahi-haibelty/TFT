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
- [x] Wrong credentials show localized error; correct ones reach `/admin`.
- [x] Staff visiting `/admin/users` gets a localized forbidden screen.
- [x] Admin creates a staff account and that account can sign in.
- [x] Integration test: service-level `requireUser('admin')` rejects staff.
- [x] Build + tests pass.

## Amendment — granular staff permissions

Supersedes this task's binary role split. `role` stays `admin`/`staff`, but what a
staff account may do is now a granted set rather than a fixed list.

### Scope
- `src/lib/permissions.ts`: 15 permission keys, prerequisites between them, the
  grouping the editor renders, and the admin section→permission map the sidebar,
  the landing redirect, and the gates all share. Pure module, unit-tested.
- `users.permissions` (`text[]`, migration `0006`) + a Better Auth `string[]`
  additional field, so a gate costs no extra round trip. Migration backfills
  existing staff with the access they already had; new staff start empty.
- `requirePermission(key)` replaces every `requireUser("admin")` and every bare
  `requireUser()` in `src/services/*` and `app/api/*`. `requireUser(role?)`
  survives only for "any signed-in operator".
- `catalog.pricing` is enforced on the *delta*: `updateProduct`/`updateBundle`
  compare the submitted money fields against what is stored and refuse only an
  actual change, so a catalogue editor without pricing rights can still save the
  rest of the form. Creating an item requires pricing (creation sets a price).
- `users.manage` and `settings.manage` are never grantable — permission
  escalation is impossible by construction, not by policy.
- Admin UI: `/admin/users/[id]` permission editor (grouped checkboxes, plain-
  language descriptions, prerequisites auto-ticked and locked with the reason
  named, sticky save bar); access column on `/admin/users`; sidebar renders only
  granted sections; a shared `AdminForbidden` screen; a "no access yet" screen
  for a staff account that has been granted nothing.

### Done when
- [x] Admin grants and revokes permissions from `/admin/users/[id]`; changes take
      effect on the staff member's next request.
- [x] Service-level gate rejects a real staff session on an ungranted key and
      accepts it on a granted one (integration test, real Better Auth session).
- [x] An incoherent grant cannot be stored: the writer closes it over its
      prerequisites, and the reader closes it again.
- [x] Staff with no permissions sees the no-access screen, not a broken shell.
- [x] Build, lint, and full suite (237 tests) pass; `detect.mjs` clean.
