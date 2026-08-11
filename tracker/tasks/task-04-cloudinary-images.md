# Task 04 — Cloudinary Integration

## Goal
Signed uploads from the admin UI and consistent optimized rendering everywhere.

## Depends on
Task 03.

## Scope
- Route handler `POST /api/cloudinary/sign` (auth required) returning a signed upload signature scoped to folder `papeterie/`.
- Reusable admin uploader component: multi-file, per-file progress, per-file retry on failure, returns ordered `public_id[]`, drag-to-reorder, remove.
- `src/lib/cloudinary.ts`: URL builder producing transforms — product card, gallery, zoom, thumbnail, and label sizes — always `f_auto,q_auto`; product imagery on white background via padding transform (`c_pad,b_white`) for a uniform look. No background-removal add-on.
- Custom `next/image` loader using the builder.
- Server-side delete endpoint used when an image is removed from a saved product.

## Done when
- [ ] Uploading 3 images shows progress and yields ordered public_ids; one simulated failure is retryable alone.
- [ ] Rendered URLs contain `f_auto,q_auto` and the white-pad transform for card/gallery sizes.
- [ ] Unauthenticated call to the sign endpoint → 401.
- [ ] Build + tests pass (unit test: URL builder outputs).
