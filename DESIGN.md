---
name: THE FIRST TRADE (TFT)
description: One logo-rooted brand, one register — "Atelier Blanc," a quiet white-ground editorial system with a single Plum accent, now shared by the public storefront and Admin/POS alike.
colors:
  ink: "oklch(0.204 0.009 59.14)"
  ink-soft: "oklch(0.457 0.012 67.51)"
  paper: "oklch(0.982 0.003 84.56)"
  border: "oklch(0.921 0.008 73.74)"
  plum: "oklch(0.36 0.085 337)"
  plum-deep: "oklch(0.30 0.09 337)"
  plum-soft: "oklch(0.94 0.02 337)"
typography:
  display:
    fontFamily: "Fraunces, Georgia, \"Iowan Old Style\", serif"
    fontSize: "clamp(2.25rem, 1.5rem + 3.2vw, 3.75rem)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "0em"
  headline:
    fontFamily: "Fraunces, Georgia, \"Iowan Old Style\", serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.2
  title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.04em"
  arabic-display:
    fontFamily: "Thmanyah Serif Display, ui-serif, serif"
    fontSize: "clamp(2.25rem, 1.5rem + 3.2vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.1
  arabic-reading:
    fontFamily: "Thmanyah Serif Text, ui-serif, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  arabic-sans:
    fontFamily: "Thmanyah Sans, ui-sans-serif, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  none: "2px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "oklch(0.29 0.012 59.14)"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "11px 23px"
    border: "1px solid {colors.ink}"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.plum}"
    rounded: "{rounded.none}"
    padding: "11px 23px"
    border: "1px solid {colors.plum}"
  button-destructive-hover:
    backgroundColor: "{colors.plum}"
    textColor: "{colors.paper}"
  badge-attention:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "4px 10px"
    border: "1px solid {colors.ink}"
  badge-error:
    backgroundColor: "transparent"
    textColor: "{colors.plum}"
    rounded: "{rounded.none}"
    padding: "4px 10px"
    border: "1px solid {colors.plum}"
  card-plate:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    rounded: "0px"
    padding: "24px"
---

# Design System: THE FIRST TRADE (TFT)

## Overview

**Creative North Star: "Atelier Blanc," one register, both disciplines**

One brand, rooted in the shop's own logo, now carries a single visual register everywhere. The system used to run two disciplines — a dark ink-and-gold "Marigold Ledger" for Admin/POS, and a quiet white "Atelier Blanc" for the public storefront — kept deliberately apart across three storefront redesigns. On direct user instruction ("make the dashboard look like the public business design... remove the gold color... make it the same design as the public pages"), Admin/POS was merged into Atelier Blanc: white ground, Ink text and structure, a single Plum accent, near-zero-radius square shapes, flat surfaces with color-only transitions. The old gold primary color and the five-hue gold/blue/green/red/violet status family are fully retired — no component anywhere in the codebase uses them, and their tokens no longer exist in `app/globals.css`.

Two decisions shaped how far the merge went, both made explicitly rather than assumed:
1. **Status color → monochrome, not recolored.** Admin's order/stock/promotion/user states no longer read through a hue family at all (not even a Plum-recolored one). They read through icon, weight, and the presence of a border — bordered Ink for "needs a look," plain Ink-soft for calm mid-flow, plain Ink (often with a `CircleCheck`) for resolved — the same technique the storefront's own `StockBadge` already used for backorder vs. out-of-stock. Real errors (a failed form submission, a failed scan, a destructive-action confirmation) are the one place color survives, via the existing "Errors-Are-Plum" rule, now shared by both disciplines.
2. **Shape and motion, not just palette.** Admin fully adopted the storefront's square 2px radius (`rounded-xs` in code) in place of its old pill vocabulary, and dropped the pill-button's 2px hover-lift in favor of the storefront's plain `transition-colors`. This was a deliberate "go all the way" choice over a palette-only reskin — the brief asked for "the same design," and shape/motion are as much a part of a register as its colors.

**Key Characteristics:**
- One discipline, one brand: Admin/POS and the storefront now share the same tokens, the same button/badge/input vocabulary, and the same restraint. Nothing in the codebase is styled "Admin-only" or "storefront-only" anymore at the palette or shape level — the only surviving split is a typographic one (see below).
- The storefront's display face (Fraunces / Thmanyah Serif Display) stays storefront-only, deliberately. Admin/POS keeps its own `font-heading` (Plus Jakarta Sans / Thmanyah Serif Display, sans in Latin) for page titles and table-dense UI — a considered exception to "same design," not an oversight: Operate-mode surfaces (dense tables, forms, a tablet POS) are better served by a workhorse UI face than a serif display face, and the two tokens were already architecturally decoupled so this could be decided independently of color/shape.
- Plum is the one accent, both disciplines now — text, borders, and hairline underlines only, never a fill wider than a hairline (The Plum-Is-Not-A-Fill Rule), with the single addition of a hover-invert on outline/destructive buttons (an interaction state, not a resting fill).
- The Admin/POS sidebar dropped the circular Ink/Gold `BrandMark` icon entirely — the component is deleted — in favor of the same plain serif "TFT" wordmark the storefront header and footer use. "The nav is typographic, not iconographic" now holds for both disciplines, not just the storefront.
- Product/bundle photography still sits in a bordered white "plate" with `mix-blend-multiply` on the storefront; Admin/POS's own photo affordances (image-uploader thumbnails) stayed circular/square per their own established use, not forced into the plate pattern — that pattern is a storefront merchandising device, not a general "any product photo" rule.

## Colors

Ink and white carry structure everywhere, one accent (Plum) covers both disciplines, and the old Gold primary plus the five-hue gold/blue/green/red/violet status family are gone — not deprecated, removed: their CSS custom properties no longer exist in `app/globals.css`, and no component references their Tailwind classes.

### Accent
- **Plum** (`oklch(0.36 0.085 337)`, `≈#5A3450`): the system's one accent, both disciplines now. Storefront roles unchanged (the "view all" links, the WhatsApp CTA, hover underlines, the checkout error vocabulary). Admin/POS roles: every real error state (failed form submissions, failed scans, failed order actions), every destructive-action affordance (delete/void/remove/deactivate), and the access-forbidden icon badge. Never a background fill at rest — outline-only, inverting to a solid Plum fill on hover for buttons specifically (see The Plum-Is-Not-A-Fill Rule).
- **Plum Deep** (`oklch(0.30 0.09 337)`): `--destructive` in the shared token layer; a stronger-weight Plum for destructive emphasis. Also still reserved for a future hover/pressed state on storefront components.
- **Plum Soft** (`oklch(0.94 0.02 337)`): the checkout city radios' selected-state tint (storefront); reserved for a future analogous Admin use, not yet spent there.

### Neutral
- **Ink** (`oklch(0.204 0.009 59.14)`, `#1A1613`): primary text color everywhere, both disciplines — headline/body text, all resting-state borders, primary button fills, focus outlines, and (new) Admin/POS's entire former Gold vocabulary: active nav-item text weight, primary CTAs, "needs a look" bordered badges, low-stock/attention chips.
- **Ink Soft** (`oklch(0.457 0.012 67.51)`, `#5C5650`): secondary text, subtitle copy, prices, placeholder text, calm mid-flow status text (e.g. "confirmed," "shipped"). Unchanged role, both disciplines.
- **Paper** (`oklch(0.982 0.003 84.56)`, `#FAF9F7`): Admin/POS on-ink text color (buttons, filled chips) and both disciplines' rare barely-there section tints (the storefront's Boxes band; Admin's sidebar active-item tint, which moved off Gold Soft onto this same near-white neutral).
- **Border** (`oklch(0.921 0.008 73.74)`, `#E8E4DF`): the hairline color for both disciplines — card/input borders, dividers, nav rules, image-plate borders. Unchanged.
- **Background** (`oklch(1 0 0)`, `#FFFFFF`): pure white, both disciplines. Unchanged.

### Retired
- **Gold / Gold Strong / Gold Soft** — fully removed. Every former Gold role (primary buttons, focus rings, the sidebar active-item tint, the brand mark's ring, caret color, text selection) now maps to Ink (structure/emphasis) or a neutral Paper-based tint (hover/secondary surfaces); browser chrome (caret, `::selection`) moved to Plum, since there is no longer a second discipline's accent to keep it distinct from.
- **The five-hue status family (Blue/Red/Green/Violet)** — fully removed, from both disciplines. Order/stock/promotion/user status no longer reads through color at all; see Overview decision (1) and Named Rules below.

### Named Rules
**The Ink-Not-Black Rule.** Unchanged: "black" is always Ink, never `#000000`.
**The Plum-Is-Not-A-Fill Rule (both disciplines now).** Plum is a text, border, and hairline-underline color only at rest. The one standing exception is the hover-invert on outline/destructive buttons (`border-plum text-plum` → `hover:bg-plum hover:text-paper`) — a transient interaction state, not a resting fill, and the same inversion pattern Ink-outline buttons already used. `Plum Soft` is the one named resting-fill exception (the checkout city-radio selected state); no other resting Plum fill exists anywhere in the codebase.
**The Errors-Are-Plum Rule (both disciplines now).** Previously storefront-only, now the shared error vocabulary system-wide: **Field error:** `text-xs font-semibold text-plum` with a `CircleAlert` icon, `role="alert"`, directly under its field. **Invalid field:** `border-plum` on the control — never `border-ink`, which is the focus/neutral treatment. **Error block** (form-level failure, a failed scan, a failed order action, an access-forbidden screen): `border-plum`, Plum text, `CircleAlert`, `role="alert"`. Admin/POS's own action-failure messages (order actions, stock adjustments, POS scan failures, permission saves) all converted to this vocabulary from the retired `red-text`/`red-bg` classes.
**The Status-Is-Not-Color Rule (new, both disciplines).** Domain/lifecycle state (an order's status, a promotion's active/scheduled/ended state, a user's active/inactive flag, a stock level) is never conveyed by hue. It reads through, in order of preference: icon choice, text label, font-weight, and the presence of a 1px Ink border marking "needs a look" — never a background color fill, never a colored dot. `components/admin/order-status-badge.tsx` is the reference implementation (nine order states, three visual tiers, zero color). This does not contradict The Errors-Are-Plum Rule: a *state* (pending, shipped, inactive) is not a *failure* (a rejected form, a scan that found nothing) — only the latter earns Plum.
**The Pure-White Rule.** The entire product — storefront and Admin/POS alike — sits on pure white (`#FFFFFF`), with the same two named near-white tint exceptions (the storefront's Boxes band, Admin's sidebar active-item tint), both Paper, never a real color region.

## Typography

**Latin body/UI:** Plus Jakarta Sans — nav, buttons, labels, card copy, prices, tables, forms. Both disciplines, unchanged.
**Latin storefront display:** Fraunces, self-hosted via `next/font/google`, weights 400/500/600, roman and italic. Storefront hero + section headings, and (new) the storefront's own login-adjacent surfaces stay sans — this face is still storefront-only.
**Arabic UI/body:** Thmanyah Sans — both disciplines, unchanged.
**Arabic long-form reading:** Thmanyah Serif Text — unchanged.
**Arabic display/hero:** Thmanyah Serif Display — storefront hero/section headings; Admin/POS's own Arabic headings keep using it too for `font-heading` (a pre-existing, unchanged direction split — Arabic never had a separate sans display face the way Latin does).
**Numerals / Codes:** Geist Mono — order codes, SKUs, barcodes, tabular price columns, both disciplines.
**Wordmark:** "TFT" is now set in the storefront's serif display face (`font-display`) everywhere it appears — storefront header/footer, Admin/POS sidebar header, Admin/POS mobile top strip, and the Admin/POS login screen. The old circular Ink/Gold `BrandMark` icon component is deleted; there is no icon mark left in the product, anywhere — "the nav is typographic, not iconographic" now holds system-wide.

### Hierarchy
- **Display**: storefront hero headline only, unchanged. Never used in Admin/POS — this is the one typographic line that still separates the disciplines, kept deliberately (see Overview).
- **Headline**: storefront section headings (Fraunces/Thmanyah Serif Display) and Admin/POS page titles (Plus Jakarta Sans/Thmanyah Serif Display) remain two separate uses of the same *name* at the same *size*, via the still-decoupled `font-display` / `font-heading` CSS custom properties — unchanged architecture, now doing the job of explicitly preserving one considered typographic difference rather than preventing an accidental leak.
- **Title / Reading / Body / Label**: unchanged, both disciplines.

### Print Ramp (Admin only — barcode labels)
Unchanged — physical label sizing (40×30mm, fixed `@page` rules, the print-only type ramp) is a separate medium from screen UI and was explicitly out of scope for this redesign; the print templates in `label-print-view.tsx` and `label-sheet-view.tsx` were not touched, only their surrounding on-screen chrome (buttons, inputs, filters).

### Named Rules
**The One Display Rule.** Unchanged.
**The Font-Heading-Is-Not-Font-Display Rule.** Unchanged, and now load-bearing rather than precautionary: this is the mechanism that keeps one deliberate typographic difference (Admin stays sans, storefront stays serif-for-display) from collapsing now that everything else has merged.

## Layout

Mobile-first, single-column by default. Spacing runs on an 8px rhythm, both disciplines, unchanged. **Admin/POS:** a persistent white sidebar runs full-height at the inline-start edge from tablet width up; below `md` it becomes a drawer under a slim mobile top strip — layout structure unchanged by this redesign, only its palette/shape/type details. **Storefront:** unchanged, a single continuous white page with hairline `border-b` section dividers.

## Elevation & Depth

Both disciplines: flat by default, a single hairline `border` on genuine item cards, ambient/modal shadow reserved for genuinely floating layers (dropdowns, popovers, the cart drawer, toasts, confirmation dialogs). Admin/POS's button/card hover-lift is retired — no component anywhere lifts on hover now; every interactive surface uses `transition-colors` only, matching the storefront's own long-standing discipline.

### Shadow Vocabulary
- **Ambient (floating panels)** (`box-shadow: 0 8px 32px oklch(0.204 0.009 59.14 / 0.16)`): dropdowns, popovers, the cart drawer, toasts.
- **Modal** (`box-shadow: 0 24px 64px oklch(0.204 0.009 59.14 / 0.22)`): confirmation dialogs, the checkout sheet.

### Named Rules
**The Border-Or-Shadow Rule.** Unchanged, both disciplines: a surface is either bordered or shadowed, never both, and never neither if it needs separation.
**The Page-Is-Not-A-Card Rule.** Unchanged.

## Shapes

Near-zero 2px radius (`rounded-xs` in code) everywhere, both disciplines — the shared `--radius` CSS custom property in `app/globals.css` moved from `1rem` to `2px`, and every literal `rounded-full` pill/badge/chip in Admin/POS was converted to `rounded-xs` to match. The pill-button vocabulary ("Marigold Ledger") is fully retired; nothing in the product is pill-shaped anymore except a small number of named exceptions: genuine circular elements (photo thumbnails, a circular icon-only remove/dismiss button, the login/forbidden screen's circular icon badge) where a real circle — not a pill — is the correct shape, and any toggle-switch *track* if one is added (a switch's circularity is a distinct, non-pill UI convention). Card image plates stay perfect squares/rects with zero radius and a 1px hairline border, both disciplines where photography appears.

## Motion

Both disciplines, one rule now: buttons, links, and cards use a plain color transition only (`transition-colors`) — no hover-lift, no scale, no shadow-on-hover. Admin/POS's prior `hover:-translate-y-0.5` pill-lift signature is fully retired system-wide, matching the storefront's long-standing restraint.

## Iconography

Unchanged: `lucide-react` only, one stroke weight, never emoji or unicode glyphs. Admin/POS's new monochrome status vocabulary (see Colors → The Status-Is-Not-Color Rule) leans on icon choice more than the old system did, since icon shape is now doing work color used to do — `Clock3`/`PackageOpen`/`Truck`/`PackageCheck`/`CircleCheck`/`XCircle` for order states, `CircleAlert` for errors, `AlertTriangle`/`CircleCheck` for attention/resolved states elsewhere in Admin.

## Surface Details

Both disciplines, one convention now: text selection is Plum Soft/Ink, caret is Plum, thin Border-colored scrollbars. This moved off the old Gold-based system default specifically because there is no longer a second discipline's own accent to keep browser chrome distinct from — with one register, browser chrome uses that register's one accent.

## Components

### Brand Mark
**Retired entirely.** The circular Ink-fill/Gold-ring "T" mark (`components/brand-mark.tsx`) is deleted from the codebase. Every place it appeared — the storefront (already retired in an earlier round), the Admin/POS sidebar header, its mobile top strip, and the Admin login screen — now uses the plain serif "TFT" wordmark (`font-display`) instead.

### Buttons
One vocabulary, both disciplines: square 2px-radius rectangles. **Primary:** Ink fill, Paper text, darkens on hover (`transition-colors` only). **Secondary/outline:** transparent, 1px Ink border, inverts to solid Ink fill with Paper text on hover. **Destructive:** transparent, 1px Plum border, Plum text, inverts to solid Plum fill with Paper text on hover — this is new for Admin/POS, replacing the old solid `bg-destructive`/Red-Strong fill. No Accent/Gold variant exists anywhere anymore. Storefront buttons keep their taller `h-12` sizing and uppercase-tracked labels as a CTA-specific convention; Admin/POS buttons were not forced into uppercase tracking (a dense operate surface reads better in sentence case) — only their color, shape, and motion merged, not their label casing.

### Badges / Status
One vocabulary, both disciplines: no color, no dots. A three-tier system — **bordered Ink** ("needs a look": pending orders, out-of-stock/low-stock, scheduled/disabled promotions, inactive users), **plain Ink-soft** (calm mid-flow states), **plain Ink + `CircleCheck`** (resolved/positive states) — each paired with a state-specific icon rather than a state-specific hue. `components/admin/order-status-badge.tsx` is the canonical implementation. Real errors still use the bordered-Plum treatment (see Colors → The Errors-Are-Plum Rule), which is a different axis (failure, not state) and is not part of this three-tier system.

### Chips / Category Links (Storefront)
Unchanged: plain text, uppercase, tracked, Ink-Soft by default, 2px Plum underline + Ink on hover, no pill/fill.

### Cards / Containers
Both disciplines: 1px `border` token, near-zero radius, border-only — Admin/POS's cards moved from 16–20px radius to the shared 2px, storefront cards unchanged (no whole-tile border, only the image plate is bordered).

### Tables (Admin / POS)
Structure unchanged; only the badges/chips/buttons inside table rows moved to the shared vocabulary above.

### Inputs / Fields
Both disciplines now: near-zero radius (`rounded-xs`), 1px Border-colored resting border, `focus-visible:border-ink` (no colored focus ring — the global `:focus-visible` outline rule supplies a solid 2px Ink outline instead), `border-plum` for an invalid field. Admin/POS's inputs moved off `focus-visible:border-gold`/`ring-gold` onto this shared treatment.

### Navigation
- **Storefront header/footer:** unchanged.
- **Admin/POS sidebar:** structure, collapse behavior, and RTL side-flipping unchanged. Its active-item tint moved from Gold Soft to the shared Paper near-white tint (font-weight already carried the "active" signal via the pre-existing `data-active:font-medium` class, so no legibility was lost); its wordmark moved from a mono "TFT" + `BrandMark` icon lockup to the plain serif wordmark alone; its locale-switch pill and every icon-button in the footer moved from `rounded-full` to `rounded-xs`.

## Do's and Don'ts

### Do:
- **Do** keep the one shared vocabulary — Ink/Paper/Border for structure, Plum as the only accent, near-zero radius, color-only transitions — consistent across storefront and Admin/POS; there is no longer a reason to style them differently at this level.
- **Do** keep Plum rare and outline-first everywhere: text, borders, hairline underlines, and the hover-invert on outline/destructive buttons — never a resting background fill beyond the one named `Plum Soft` exception.
- **Do** convey domain/lifecycle status through icon + weight + border-presence, never through color — see The Status-Is-Not-Color Rule.
- **Do** use Fraunces/Thmanyah Serif Display for the storefront hero and section headings only; Admin/POS's `font-heading` stays Plus Jakarta Sans/Thmanyah Serif Display, a deliberate, considered exception to "same design," not a leftover.
- **Do** border product/bundle photos in a plain white plate with `mix-blend-multiply` on the storefront; treat Admin/POS's own photo affordances (upload thumbnails) on their own established terms rather than forcing the storefront plate pattern onto them.

### Don't:
- **Don't** reintroduce Gold or the five-hue status family (blue/red/green/violet) anywhere — their tokens no longer exist in `app/globals.css`, and reintroducing any of their Tailwind classes will not resolve to a defined color.
- **Don't** round any button, badge, chip, or card plate — the sharp 2px/0px radius is now the system default, both disciplines; a rounded control (beyond the named circular exceptions) is a regression to the retired "Marigold Ledger" register.
- **Don't** add hover-lift motion anywhere — every interactive surface uses `transition-colors` only, both disciplines now.
- **Don't** fill a surface with solid Plum at rest — outline/text/border/hover-invert only, per The Plum-Is-Not-A-Fill Rule.
- **Don't** use color to distinguish a domain state (order status, active/inactive, stock level) — use icon, weight, and border-presence instead; color is reserved for genuine errors.
- **Don't** use pure black or neutral gray anywhere — every dark/gray value is a tint of Ink's warm hue.
- **Don't** add a kicker/eyebrow label above a heading — banned outright by the craft floor, no brief-based exception.
