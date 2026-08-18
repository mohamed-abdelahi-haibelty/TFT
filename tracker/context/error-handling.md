# Error Handling

## Principles

- Errors are values at boundaries: server actions and services return typed results; they do not throw for expected failures.
- Throw only for programmer errors and truly unexpected states; those are caught by global boundaries.
- Never leak internals (SQL, stack traces, Cloudinary/Neon messages) to any client response.
- Every user-visible error message exists in both Arabic and French via next-intl keys.

## Error Taxonomy

Service functions return `{ ok: false, error: { code, message } }` with codes:

| Code | Meaning | Typical HTTP |
| --- | --- | --- |
| `VALIDATION` | Zod parse failed | 400 |
| `UNAUTHORIZED` | No session | 401 |
| `FORBIDDEN` | Role not allowed | 403 |
| `NOT_FOUND` | Missing resource / wrong tracking pair | 404 |
| `CONFLICT` | Invalid state transition, duplicate SKU, insufficient stock (non-backorder) | 409 |
| `RATE_LIMITED` | Order endpoint throttle | 429 |
| `INTERNAL` | Anything unexpected | 500 |

## Global Boundaries (Next.js 16)

- `app/[locale]/error.tsx` — localized friendly error screen + "try again"; logs via the logger.
- `app/global-error.tsx` — last-resort shell (root layout crash).
- `app/[locale]/not-found.tsx` — localized 404 with link back to store.
- Route handlers wrap logic in one shared `withErrorHandling` helper that maps taxonomy → HTTP status and returns `{ error: { code, message } }` JSON.
- Client forms show field errors inline (from Zod) and a single form-level error region (aria-live) for action failures.

## Domain Rules

- **Order creation (public)**: if an item became unavailable between browse and submit → `CONFLICT` listing the affected items; nothing is saved (all-or-nothing).
- **Stock**: decrement uses a conditional update (`stock_qty >= needed` unless backorder); failure inside the transaction rolls back everything → `CONFLICT`.
- **State machine**: invalid transitions (e.g. `shipped → pending`) → `CONFLICT`; the UI only offers valid next states but the service is the enforcer.
- **Tracking lookup**: wrong code+phone pair → generic `NOT_FOUND` (never reveal whether the code exists).
- **POS scan**: unknown barcode → non-blocking "not found" feedback in scan UI, input refocused; never interrupts the sale.
- **Cloudinary upload failure**: product saves are independent of image uploads; a failed upload reports per-image and can be retried without resubmitting the form.
- **WhatsApp redirect**: order is saved before redirecting; if the redirect fails, the confirmation screen still shows the order code + a manual "Open WhatsApp" link.

## Logging

- Tiny `src/lib/logger.ts` (level + JSON to console; Vercel captures it). Log every `INTERNAL` with request context. No third-party logging service in v1.
- Never log customer phone numbers at info level; only within order records in DB.
