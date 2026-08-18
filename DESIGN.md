---
name: THE FIRST TRADE (TFT)
description: One logo-rooted brand, two disciplines — a restrained ink-and-gold ledger for Admin/POS, and a quiet editorial catalog ("Atelier Blanc") for the public storefront.
colors:
  gold: "oklch(0.771 0.144 69.41)"
  gold-strong: "oklch(0.700 0.145 67.39)"
  gold-soft: "oklch(0.947 0.036 78.13)"
  ink: "oklch(0.204 0.009 59.14)"
  ink-soft: "oklch(0.457 0.012 67.51)"
  paper: "oklch(0.982 0.003 84.56)"
  border: "oklch(0.921 0.008 73.74)"
  blue: "oklch(0.573 0.126 247.32)"
  blue-text: "oklch(0.463 0.107 248.22)"
  blue-bg: "oklch(0.953 0.016 245.09)"
  red: "oklch(0.626 0.184 29.79)"
  red-text: "oklch(0.532 0.166 30.13)"
  red-bg: "oklch(0.950 0.019 29.55)"
  red-strong: "oklch(0.549 0.174 29.32)"
  green: "oklch(0.621 0.141 152.69)"
  green-text: "oklch(0.515 0.116 153.04)"
  green-bg: "oklch(0.957 0.019 157.87)"
  violet: "oklch(0.565 0.144 305.90)"
  violet-text: "oklch(0.466 0.129 307.23)"
  violet-bg: "oklch(0.944 0.020 311.08)"
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
    rounded: "{rounded.pill}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "oklch(0.29 0.012 59.14)"
  button-accent:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
  button-accent-hover:
    backgroundColor: "{colors.gold-strong}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "11px 23px"
  badge-warning:
    backgroundColor: "{colors.gold-soft}"
    textColor: "{colors.gold-strong}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  badge-success:
    backgroundColor: "{colors.green-bg}"
    textColor: "{colors.green-text}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  badge-info:
    backgroundColor: "{colors.blue-bg}"
    textColor: "{colors.blue-text}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  badge-danger:
    backgroundColor: "{colors.red-bg}"
    textColor: "{colors.red-text}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  storefront-button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "16px 28px"
  storefront-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "15px 27px"
  storefront-card-plate:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    rounded: "0px"
    padding: "24px"
---

# Design System: THE FIRST TRADE (TFT)

## Overview

**Creative North Star: "The Marigold Ledger" (Admin/POS) + "Atelier Blanc" (Storefront)**

One brand, rooted in the shop's own logo, carries two disciplines. Admin and POS keep the system's original register — a Salla-translated back-office ledger: dark structural chrome, generous white space, fully-rounded pill controls, and a five-color named status vocabulary (gold/blue/green/red/violet, lifted from the logo's paint-splat marks and the two children riding the pencil) that reads the order and stock lifecycle at a glance. That register is untouched by this redesign and remains fully documented below.

The public storefront has now been rebuilt twice on user direction. The first rebuild ("The Unboxing," a bold cereal-box packaging system) was tried, shown live, and explicitly rejected — the user asked to see it "like Shopify or Shein," then, after comparing built alternatives side by side, converged on a quiet, premium, editorial register instead of the bold one initially requested. **"Atelier Blanc"** is that register: white ground, a serif display face (Fraunces) doing the work the previous system's monumental bold sans did, hairline borders instead of thick "packaging-line" ink borders, and a single restrained accent — a deep, muted plum — used sparingly rather than a five-hue merchandising palette spent at full region scale. The accent color itself was chosen by elimination: gold, forest green, and a deepened brand blue were each tried and rejected in turn before landing on plum, a hue outside the logo family entirely, picked purely because it reads well against a serif headline on white — a deliberate departure from "every accent must trace back to the logo," authorized because the user asked for a color choice unconstrained by brand at that point in the process.

PRODUCT.md's audience constraint (not confident with technology, favors few steps and plain language) continues to shape the storefront's *interaction* patterns — large tap targets, plain nav labels, no hidden affordances — independent of which visual register the *expression* takes. Quiet and bold are both compatible with that constraint; this round landed on quiet.

**Key Characteristics:**
- Two disciplines, one brand: Admin/POS stays exactly as originally documented — ink/gold, component-scale color, pill controls. The Storefront is now white-ground, hairline-bordered, serif-accented, and does not use the five-hue status family at all.
- The storefront's display face is Fraunces (Latin) / Thmanyah Serif Display (Arabic) — a genuine serif moment, not the previous system's bold sans. Section headings ("Nouveautés," "Boîtes prêtes") use the same serif at a smaller size, not the sans `Headline` step.
- One new accent, Plum, deliberately chosen outside the logo palette — used only for links, the WhatsApp CTA, and small emphasis text, never as a fill covering more than a hairline.
- Storefront buttons are square-cornered rectangles (2px radius) with uppercase tracked labels — a break from the pill-button vocabulary that both Admin/POS and the previous storefront system used.
- Product/bundle photography sits in a bordered white "plate" with `mix-blend-multiply`, so a photo's own white background disappears into the tray instead of showing as a visible seam.
- The storefront header stays a plain, quiet wayfinding bar — this was already true in both prior storefront systems and remains true here; Atelier Blanc's overall quietness makes the header's restraint less of a contrast than it was against "The Unboxing," but the reasoning (PRODUCT.md's audience constraint) is unchanged.

## Colors

Ink and white carry structure everywhere. Admin/POS spends the five-hue status family (gold/blue/red/green/violet) narrowly, component-scale, status-only — unchanged. The storefront no longer uses that family at all; its one accent is Plum, chosen independently of the logo.

### Primary
- **Marigold Gold** (`oklch(0.771 0.144 69.41)`, `#EFA23D`): Admin/POS only now — primary/promotional buttons, active tab underlines, focus rings, POS quick-pick highlight. The storefront tried Gold as its hero-region color under "The Unboxing" and as a link color under an early Atelier Blanc pass; both were rejected. Gold does not appear anywhere in the current storefront build.
- **Gold Strong** / **Gold Soft**: Admin/POS only, unchanged roles (hover state; warning-badge background).

### Storefront Accent
- **Plum** (`oklch(0.36 0.085 337)`, `≈#5A3450`): the storefront's one accent, chosen by elimination (see Overview) and deliberately outside the logo family. Used narrowly: the "view all" links under each home section, the footer's WhatsApp CTA text, the mobile bottom bar's active cart label, hover underlines on nav/category links. Never a fill covering more than a hairline underline — Plum is a text and border-accent color, not a background color, anywhere in the current build.
- **Plum Deep** (`oklch(0.30 0.09 337)`): reserved for a future hover/pressed state; not yet used in a shipped component.
- **Plum Soft** (`oklch(0.94 0.02 337)`): reserved for a future subtle tint (e.g. a selected-state background); not yet used.

### Neutral
- **Ink** (`oklch(0.204 0.009 59.14)`, `#1A1613`): primary text color everywhere, both disciplines. Storefront: headline text, body copy, all borders' resting color on hover, primary button fill, hairline image-plate borders on hover.
- **Ink Soft** (`oklch(0.457 0.012 67.51)`, `#5C5650`): secondary text, subtitle copy, prices, placeholder text, empty-state copy. Unchanged role, both disciplines.
- **Paper** (`oklch(0.982 0.003 84.56)`, `#FAF9F7`): Admin/POS on-ink text color and rare section separation (unchanged). Storefront: the "Boxes" section's barely-there tint band (see Elevation & Depth) — the *only* place the storefront uses a background color other than pure white, and even there it is a near-white tint, not a real color region.
- **Border** (`oklch(0.921 0.008 73.74)`, `#E8E4DF`): the hairline color for **both** disciplines now — Admin/POS card/input borders (unchanged) and every storefront divider, nav rule, and card-plate border (new; replaces the 2px Ink border "The Unboxing" used).
- **Background** (`oklch(1 0 0)`, `#FFFFFF`): pure white, **both** disciplines now — Admin/POS (unchanged) and the storefront's entire page ground, header, footer, and card-plate fill. This restores the original "storefront is pure white" rule that "The Unboxing" had deliberately broken; Atelier Blanc breaks it back.

### Status Family (Admin/POS only)
- **Sketchbook Blue**, **Poppy Red**, **Red Strong**, **Confirmed Green**, **Crayon Violet**: unchanged values, Admin/POS status roles only. **None of these five colors appear anywhere in the current storefront build** — a change from both the original storefront (which used them as component accents) and "The Unboxing" (which used them as a merchandising palette). If a future storefront surface needs a second accent, reach for Plum's own tonal range (Plum Deep / Plum Soft) before reintroducing a status hue, to keep the two disciplines' palettes legibly separate.
- **Order lifecycle mapping (task 13, `OrderStatusBadge`)** — the dangling "see prior revisions of this file" forward-reference is resolved here, now that the admin order state machine actually exists: `pending` → Gold (needs action), `confirmed`/`preparing` → Blue (confirmed, work in progress), `shipped`/`arrived`/`ready` → Violet (in transit / awaiting pickup), `delivered` → Green (done), `cancelled`/`voided` → Red (terminal, not fulfilled). Same component-scale badge pattern as every other Admin/POS status pill (`bg-{x}-bg`/`text-{x}-text` pair plus a solid `bg-{x}` dot), just a nine-value enum instead of a boolean.

### Named Rules
**The No White-on-Gold Rule.** Unchanged: Gold and Gold Strong never carry white text or icons.
**The Ink-Not-Black Rule.** Unchanged: "black" is always Ink, never `#000000`.
**The Status-Color-Means-Something Rule (Admin/POS only).** Unchanged, admin-only — irrelevant to the storefront now that it doesn't use the status family at all.
**The Plum-Is-Not-A-Fill Rule (Storefront, new).** Plum is a text, link, and hairline-underline color only. The moment a design calls for Plum as a background fill covering more than an underline's thickness, that is a new decision to make deliberately, not a default extension of "the accent" — the whole point of Atelier Blanc's restraint is that the accent stays rare. **That deliberate decision has now been made once**, and only once: `Plum Soft` is the selected-state tint on the checkout city radios (see The Errors-Are-Plum Rule below). No other storefront fill exists.

**The Errors-Are-Plum Rule (Storefront, new).** Atelier Blanc had a rule for what an error may *not* be — the Admin status family is off-limits — and no rule for what it *is*, so every storefront error defaulted to `text-xs text-ink`: same size, same weight, no icon, one step of grey away from the ordinary hint sitting directly below it. A critique found this cost the product its orders (a first-time shopper pressed "confirm", the page did not move, and nothing near their thumb changed). The storefront's error voice is now **Plum + weight + a `lucide-react` `CircleAlert`**, in three fixed shapes:
- **Field error:** `text-xs font-semibold text-plum` with a 3.5-size `CircleAlert`, `role="alert"`, directly under its field.
- **Invalid field:** `border-plum` on the control — deliberately *not* `border-ink`, which is the focus treatment; invalid must never look like focused.
- **Error block** (form-level failure, an error summary, a not-found lookup): 1px `border-plum`, Plum text, `CircleAlert`, `role="alert"`.

This does not reintroduce the five-hue status family — it extends the storefront's own accent into the one role restraint could not serve, exactly as the Plum-Is-Not-A-Fill Rule anticipated ("extend Plum's own tonal range first"). Silence stays the default for *stock and promos*; it was never meant to cover failure. **Errors are also the storefront's one required focus movement:** a failed submit focuses and scrolls to the field at fault. An error that renders off-screen has not been reported.
**The Pure-White Rule (Storefront, restored).** The storefront page background, header, footer, and card plates are all pure white (`#FFFFFF`), matching Admin/POS. The one exception is the Boxes section's Paper tint — a deliberately subtle section-boundary cue, not a color region in the sense "The Unboxing" used.

## Typography

**Latin body/UI:** Plus Jakarta Sans (unchanged) — nav, buttons, labels, card copy, prices.
**Latin storefront display:** Fraunces (new), self-hosted via `next/font/google`, weights 400/500/600, roman and italic. Used for the hero headline and every storefront section heading ("Nouveautés," "Boîtes prêtes") at a smaller size — the same face, not a separate token, carries both roles.
**Arabic UI/body:** Thmanyah Sans (unchanged).
**Arabic long-form reading:** Thmanyah Serif Text (unchanged).
**Arabic display/hero:** Thmanyah Serif Display (unchanged font file) — now doing double duty as the direct counterpart to Fraunces: both are serif, so Atelier Blanc's "serif display" identity holds symmetrically across both locales for the first time (the original system's Latin display was sans; only Arabic was ever serif).
**Numerals / Codes:** Geist Mono — order codes, SKUs, barcodes, tabular price columns. The storefront wordmark ("TFT") now uses the serif display face instead of mono (a deliberate change — the previous two storefront systems both set "TFT" in Geist Mono; Atelier Blanc's quieter register reads better with the same face as the headline).

**Character:** Latin now runs two faces with a real division of labor — Plus Jakarta Sans for everything functional, Fraunces for the handful of moments that are genuinely editorial (the hero, section headings, the wordmark). This is new: both prior storefront systems ran a single Latin face for every role. Arabic's existing three-face system (sans / reading serif / display serif) already had this division built in, which is part of why Atelier Blanc's Arabic rendering required no new font files, only reusing the existing Thmanyah Serif Display more consistently.

### Hierarchy
- **Display** (Latin: Fraunces 500, `clamp(2.25rem, 1.5rem + 3.2vw, 3.75rem)`, 1.05 — Arabic: Thmanyah Serif Display 700, same clamp, 1.1): storefront hero headline only. Down from "The Unboxing"'s 5.5rem monumental cap — Atelier Blanc's headline is confident but not shouting. Never used in Admin/POS.
- **Headline** (Fraunces/Thmanyah Serif Display at 1.5rem, 500/700, 1.2): storefront section headings only. This is a **new, separate use of the Display face at Headline scale** — distinct from Admin/POS's own `Headline` step, which stays exactly as documented (Plus Jakarta Sans 700/800, sans, unchanged — see `font-heading` in code, deliberately decoupled from `font-display` specifically so this storefront change could not leak into Admin).
- **Title** (600, 1.25rem, Plus Jakarta Sans): card titles. Unchanged.
- **Reading** (400, 1rem): long-form prose. Unchanged.
- **Body** (400, 1rem): short UI text, prices, subtitles. Unchanged.
- **Label** (600, 0.75rem, 0.04em tracking, uppercase): storefront nav links, category links, "view all" links, button labels — all uppercase-tracked now, a new usage; previously Label was badge/form-only.

### Print Ramp (Admin only — barcode labels)

The screen ramp bottoms out at `Label` (0.75rem/12px) and governs **screen** surfaces only. Printed price labels are a different medium: a physical label is 40 × 30mm of paper carrying a product name, a Code128 barcode, a SKU and a price, and its type is read at hand distance rather than arm's length. Those sizes are therefore documented here rather than treated as violations of the screen ramp (a mechanical scan flags them as off-ramp; that is expected, and the sizes are the answer, not the defect):

- **Label name** — 8px/1.1, 600 weight, 2-line clamp.
- **Label price** — 9px, 600 weight, Geist Mono.
- **Label SKU** — 6px, Geist Mono, Ink Soft.
- **Sheet footer** (selection + print date) — 9px, Ink Soft.

**Physical size is fixed, never fractional.** Both label routes emit the same 40 × 30mm card: `/admin/products/[id]/label` sets `@page { size: 40mm 30mm; margin: 0 }` so one page *is* one label on a dedicated label printer, and `/admin/labels/sheet` tiles `repeat(auto-fill, 40mm)` × `30mm` rows on A4 for an office printer. A percentage-based track (`repeat(4, 1fr)`) is a defect, not a shortcut: it makes a label's size — and with it the barcode's module width — depend on the paper and the margins, so the same product scans differently depending on which route printed it. The A4 sheet keeps a hairline border in print as a cut guide; the per-label route drops it, since there the page edge *is* the label edge.

### Named Rules
**The One Display Rule.** Unchanged in spirit, refined in practice: Display-*size* appears once per screen (the hero); the Display *face* (Fraunces/Thmanyah Serif Display) may recur at smaller sizes for section headings without violating the rule, since the rule constrains scale/shout, not typeface reuse. Admin and POS still top out at their own `Headline` step and never use the Display face at all.
**The Reading-Is-Not-Body Rule.** Unchanged.
**The Font-Heading-Is-Not-Font-Display Rule (new).** `font-heading` (Admin/POS page titles, Plus Jakarta Sans/Thmanyah Serif Display per the pre-existing — unchanged — direction split) and `font-display` (storefront hero + section headings, Fraunces/Thmanyah Serif Display) are separate CSS custom properties in code specifically so a storefront typography change can never silently reach Admin. Any future storefront type change should extend `font-display`, never repoint `font-heading`.

## Layout

Mobile-first, single-column by default. Spacing runs on an 8px rhythm, unchanged both disciplines. **Admin/POS (updated):** a persistent white sidebar (see Navigation) runs full-height at the inline-start edge from tablet width up, with a padded content area filling the remainder — tablet-first, not just tablet-responsive: the same two-region layout holds from 768px through desktop, wider viewports just giving the content region more room, rather than reflowing into a different structure at a "desktop" breakpoint. Below `md`, the sidebar becomes a drawer and content runs full-width under a slim mobile top strip. **Storefront (redesign):** back to a single continuous white page (not "The Unboxing"'s stack of full-bleed color regions) — a hairline `border-b` under each section head is the only structural divider; the hero is a two-column editorial split (copy one side, a single bordered product photo the other) rather than a full-width color block. Touch targets stay ≥44px everywhere, unchanged.

### Section Structure (Admin / POS)
Unchanged — this redesign does not touch Admin/POS.

### Section Structure (Storefront, redesign)
A storefront page is one white surface. Each section (category rail, featured grid, Boxes) is introduced by a heading in the Display face, and — for the two catalog sections — a hairline `border-b` beneath the heading row that also carries the section's "view all" link. This replaces "The Unboxing"'s regions-with-2px-ink-rules model; it is closer to the *original* pre-"Unboxing" storefront's plainness, but now uses hairline dividers under headings (borrowed from Admin/POS's own Section Structure convention) rather than pure whitespace-only separation.

## Elevation & Depth

Admin/POS: unchanged — flat by default, a single hairline `border` on genuine item cards, ambient/modal shadow only for genuinely floating layers.

**Storefront (redesign):** flat, matching Admin/POS's own discipline for the first time. No shadows anywhere in the current build — not on cards, not on the hero image, not on any badge (there are no badges). The hero product photo and every card image sit in a bordered white "plate" (`border border-border`, `mix-blend-multiply` on the `<img>` itself so the photo's own white backdrop disappears into the plate rather than showing as a visible inset square) — border-only, no shadow, same Border-Or-Shadow discipline Admin/POS has always used. This is a reversal of "The Unboxing," which introduced storefront shadows (ribbon badges, hero collage tiles) for the first time; Atelier Blanc removes them again.

### Shadow Vocabulary
- **Ambient (floating panels)** (`box-shadow: 0 8px 32px oklch(0.204 0.009 59.14 / 0.16)`): dropdowns, popovers, the cart drawer, toasts — Admin/POS only currently; the storefront's cart drawer will use this when task 11 builds it.
- **Modal** (`box-shadow: 0 24px 64px oklch(0.204 0.009 59.14 / 0.22)`): confirmation dialogs, the checkout sheet. Admin/POS currently; storefront checkout (task 11) will use this too.

The Ribbon and Collage shadow tokens "The Unboxing" introduced are retired — no shipped component uses them.

### Named Rules
**The Border-Or-Shadow Rule.** Unchanged, and simpler again now that the storefront has no floating elements of its own yet: every storefront surface today is border-only.
**The Page-Is-Not-A-Card Rule (Admin/POS).** Unchanged, admin/POS only.

## Shapes

**Admin/POS:** unchanged — pill buttons/badges/tags, 16–20px card radius, 12px input radius, 8px chip radius.

**Storefront (redesign):** a deliberate break from the pill vocabulary both Admin/POS and "The Unboxing" used. Buttons are square-cornered rectangles at a near-zero 2px radius, uppercase tracked labels standing in for the visual weight a pill's roundness used to carry. Card image plates are perfect squares (`aspect-square` on the featured grid, `aspect-4/5` on the hero) with zero radius and a 1px hairline border — no rounding at all on the storefront's primary content surfaces. Nav/category links carry no shape of their own (plain text with an underline on hover). This is the sharpest the system has been in any of its three storefront iterations; Admin/POS's own rounded language is completely unaffected.

## Motion

**Admin/POS:** unchanged — every pill-shaped primary/secondary button lifts 2px on hover with its color transition.

**Storefront (redesign):** no lift motion anywhere. Buttons and links use a plain color transition only (`transition-colors`), matching the quieter overall register — "The Unboxing"'s pill-lift-on-hover signature (extended there to cards and category chips) is fully retired on the storefront. This is a genuine, cited change from the shared system default, not an oversight: Atelier Blanc's restraint extends to interaction, not just color and shape.

## Iconography

Unchanged: `lucide-react` only, one stroke weight, never emoji or unicode glyphs. The storefront now uses icons more sparingly than either prior system — just the cart bag icon in the header/mobile bar. No empty-state icon has shipped on the storefront yet (Package/Gift icons exist as fallbacks in `ProductCard`/`BundleCard` for a missing photo, per the same icon-plus-adjacent-text discipline as always).

## Surface Details

Unchanged, global: text selection Gold Soft/Ink, caret Gold Strong, thin Border-colored scrollbars. These stay Gold-based system-wide (Admin/POS's own accent) even though the storefront's own accent is now Plum — browser chrome is a whole-site convention, not owned by either discipline alone.

## Components

### Brand Mark
**Admin/POS only now.** The circular Ink-fill/Gold-ring "T" mark (`components/brand-mark.tsx`) anchored the storefront header and footer under both prior storefront systems; Atelier Blanc drops it from the storefront entirely in favor of a plain serif "TFT" wordmark — "the nav is typographic, not iconographic" was the guiding line during the build. The component itself is unchanged and still used on the Admin/POS sidebar (and its mobile top strip/drawer) and login page.

### Buttons
- **Admin/POS:** unchanged — Primary (Ink/Paper), Accent (Gold/Ink), Secondary (outline Ink), Destructive (Red Strong/Paper), Ghost. All fully rounded pills.
- **Storefront (redesign):** square 2px-radius rectangles, uppercase tracked labels, taller than Admin's (`h-12`, ~48px). Primary: Ink fill, Paper text, darkens on hover. Secondary: transparent, 1px Ink border, inverts to solid Ink fill with Paper text on hover. No Accent/Gold variant exists on the storefront at all.

### Chips / Category Links (Storefront, redesign)
- **Style:** plain text, uppercase, tracked, Ink-Soft by default — **not** a pill, **not** filled, a full reversal of both prior systems (the original used a neutral outline pill; "The Unboxing" used five colorful filled pills).
- **State:** a 2px Plum underline plus a color shift to Ink on hover; no "selected" state (home never has an active category).

### Cards / Containers
- **Admin/POS:** unchanged — 1px `border` token, 16–20px radius, border-only.
- **Storefront (redesign):** no card border at all around the whole tile — only the image plate is bordered (1px `border` token, 0px radius). Name and price sit directly on the white page beneath the plate, no container. This is quieter than either prior system, which bordered the whole card.

### Tables (Admin / POS)
Unchanged.

### Inputs / Fields
Unchanged, admin-only (the storefront has no form inputs yet).

### Navigation
- **Storefront header (redesign):** white, 1px `border-b` (down from "The Unboxing"'s 2px Ink rule), serif-wordmark "TFT" replacing the brand-mark lockup, uppercase-tracked hover-underline nav links (unchanged mechanism from both prior systems — the header's *calm* has been the one constant across all three storefront iterations), an outlined (not filled) cart pill. No `backdrop-filter` on this bar (breaks a nested `position: fixed` mobile bar — confirmed live in task 08; the bottom bar stays a sibling of `<header>`, never a child). Mobile bottom bar: catalog / boxes / track order / cart, never "account" (PRODUCT.md — no customer accounts exist).
- **Storefront footer (redesign):** white, 1px `border-t`, plain three-column layout (brand blurb / contact / delivery info), Plum text link for WhatsApp. "The Unboxing"'s Ink-filled full-region footer is retired — Atelier Blanc's footer is quiet like the rest of the page, matching Admin/POS's own "no gratuitous color region" instinct — now shared by Admin/POS's own sidebar too, since it moved from an Ink fill to pure white.
- **Admin/POS (updated):** a persistent left sidebar — the shadcn/ui `Sidebar` block (`components/ui/sidebar.tsx`) — from tablet width up (`md`, 768px) replaces the original horizontal top bar — the shop owner runs Admin/POS from a tablet (PRODUCT.md), and a single row could not hold the nav's ~10 items plus user info and sign-out at tablet-portrait widths, worse in French (longer labels than Arabic). A vertical list has no such ceiling. The sidebar is **pure white** (`--sidebar: var(--background)`, the same white as the content area — a deliberate change from an earlier Ink-filled pass, on user direction), separated from the content only by a hairline `--sidebar-border`; text/icons are Ink, and Gold-soft (`--sidebar-accent`) marks the active nav item, replacing the old horizontal bar's Gold underline. Each row pairs a `lucide-react` icon with its label — the first icon use in Admin/POS nav, still icon-plus-label per the icon discipline. The sidebar is collapsible to an icon-only rail via a trigger button in the content header (`SidebarTrigger`) or by clicking its edge (`SidebarRail`), and remembers its open/collapsed state. The sidebar footer carries the signed-in user's name/role, the AR/FR locale switch (new — previously nowhere in Admin/POS), and sign-out. `side` is set explicitly per locale (`right` for Arabic, `left` for French) since the block does not auto-flip for RTL. Below `md` (phone — not a target device, but kept working) the sidebar becomes a slide-in `Sheet` drawer with identical content.

## Do's and Don'ts

### Do:
- **Do** keep Admin/POS exactly as originally documented — pure white background, pill controls, component-scale Gold/status color, 1px borders. Three storefront redesigns in, Admin/POS has never changed.
- **Do** keep the storefront's Plum accent rare — text, links, and hairline underlines only, never a background fill.
- **Do** use Fraunces/Thmanyah Serif Display for the storefront hero and section headings, and nowhere else — Admin/POS's `font-heading` is a separate token specifically so this can never leak.
- **Do** border product/bundle photos in a plain white plate with `mix-blend-multiply`, never crop or mat them any other way.
- **Do** keep the storefront header calm, hover-only, and icon-plus-label — this has held across all three storefront systems and traces directly to PRODUCT.md's audience constraint, independent of which color/shape register is current.

### Don't:
- **Don't** reintroduce the five-hue status family (gold/blue/red/green/violet) on the storefront — it belongs to Admin/POS only now. If a second storefront accent is ever needed, extend Plum's own tonal range first.
- **Don't** round storefront buttons or card plates — the sharp 2px/0px radius is Atelier Blanc's deliberate departure from the pill vocabulary; a rounded storefront button is a regression to a retired system, not a stylistic choice.
- **Don't** add hover-lift motion to storefront buttons, links, or cards — Atelier Blanc uses color-only transitions everywhere; the pill-lift signature is Admin/POS's alone now.
- **Don't** add a shadow anywhere on the storefront until a genuinely floating layer (the cart drawer, a modal) ships — every current storefront surface is border-only.
- **Don't** use pure black or neutral gray anywhere — every dark/gray value is a tint of Ink's warm hue.
- **Don't** add a kicker/eyebrow label above a heading — banned outright by the craft floor, with no brief-based exception; this was tested against an approved comparison mockup during the build and held even then.
