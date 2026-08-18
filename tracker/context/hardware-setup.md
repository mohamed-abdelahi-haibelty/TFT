# Hardware Setup — Scanner & Printer (field notes, Aug 2026)

Conversation notes: how TFT's code integrates with a barcode scanner and printers,
what to buy, and exact setup steps on a MacBook Air M2 (macOS 15.2 Sequoia).

## The core idea

The app **never talks to the scanner or printer as devices**:

- The **scanner is treated as a keyboard** — it "types" the SKU + Enter into a
  hidden, always-focused input on the POS screen. So ANY scanner that works as a
  keyboard (HID mode) works, no drivers, no code.
- The **printer is driven only through the browser's print dialog** — the app
  renders correctly-sized pages and calls `window.print()`. So ANY printer the
  OS/browser can reach works. Direct web-to-Bluetooth printing is deliberately
  out of scope.

## How the scanner integration works in code

- Hidden `sr-only` input at `components/admin/pos-scan-view.tsx:454`, kept
  focused after any interaction (`pos-scan-view.tsx:228`).
- Scanner types SKU + Enter → `onScanKeyDown` catches Enter
  (`pos-scan-view.tsx:319`) → `handleScan(value)` (`pos-scan-view.tsx:295`).
- `handleScan` calls server action `resolvePosScanAction` → looks up the SKU
  across products/variants/bundles, returns channel-`pos` price + stock.
- Found → line added + beep; unknown/inactive/out-of-stock → non-blocking
  banner, sale untouched. Focus returns to the hidden input automatically.

## How the printer integration works in code

- Single labels: `components/admin/label-print-view.tsx` — each label is a
  **40×30mm** box, one per printed page via
  `@page { size: 40mm 30mm; margin: 0 }` (`label-print-view.tsx:20`) +
  `break-after-page`. "Imprimer" just calls `window.print()`
  (`label-print-view.tsx:39`).
- Barcode image generated on the fly by `GET /api/barcode/[sku]` (bwip-js,
  Code 128, explicit white background — see `src/lib/barcode.ts`).
- Counter sheet: `components/admin/label-sheet-view.tsx` — **A4** page with a
  grid of ~24–30 barcode cards, paginates automatically.
- Labels show French name, barcode, SKU, price (`components/admin/label-card.tsx`).

## What to buy

- **Scanner:** any 1D barcode scanner in keyboard/HID mode. For the counter:
  a Bluetooth model (pairs as a keyboard). 2D-imager type is future-proof, 1D
  laser is cheapest — either reads our Code 128 labels.
- **Label printer:** Bluetooth thermal printer accepting **40×30mm rolls**
  (direct thermal, no ink). CRITICAL: code hard-codes 40×30mm — the rolls must
  match, or `label-print-view.tsx:20` must be edited.
- **A4 printer:** any normal inkjet/laser (for the laminated counter sheet).

## Scanner connection options

1. **Bluetooth (best for counter):** pair as a Bluetooth keyboard — System
   Settings → Bluetooth → pair. No app, no code.
2. **USB:** plug in — it's literally a USB keyboard. MacBook M2 Air has only
   USB-C ports, so a USB-A scanner needs a USB-C hub/adapter.
3. **2.4GHz wireless dongle:** plug the USB receiver into the Mac (or tablet via
   OTG).

Gotcha: if a scanner is set to "SPP/serial" mode it needs the vendor app and
won't type into the page — set it back to HID/keyboard mode via the manual's
setup barcode. Key setting: **suffix = Enter**.

## Printer workflows

- **Label printer (phone-app model, e.g. Phomemo/Deli/NIIMBOT):**
  Imprimer → **Save as PDF** (page is already 40×30mm) → AirDrop/share to
  phone → open in the printer's app → print.
- **Label printer (Mac-driver model, Brother QL / DYMO / Zebra):** appears in
  the print dialog directly. VERIFY it takes 40×30mm rolls before buying —
  many use 58–62mm widths (would require a code size change).
- **A4 sheet printer:** same WiFi network + AirPrint → appears in print dialog
  automatically. USB printer needs a one-time driver install on the Mac.

## MacBook Air M2 (macOS 15.2 Sequoia) specifics

- Scanner: System Settings → Bluetooth → pair (scanner may need pairing mode:
  hold trigger ~5s or pairing button).
- A4 printer: AirPrint, zero drivers, appears in every print dialog.
- Label printer: no macOS app for cheap brands → PDF + AirDrop path above.
- M2 Air has only USB-C ports — keep a small USB-C hub handy.

## Testing without buying anything

- **Test 0 (no hardware):** open `/admin/pos`, click anywhere, type a seeded SKU
  + Enter (e.g. `P-000001`) → line appears + beep. Proves the whole software
  path.
- **Phone-as-scanner:** Android phone + a "phone as Bluetooth keyboard scanner"
  app → pairs via System Settings → Bluetooth → camera-scan `P-000001` → line
  appears. iPhone is unreliable for this (Apple restricts HID keyboard
  emulation) — use Android or just type the SKU.
- Note: the code has a unit test proving generated barcodes decode back to the
  SKU, so the physical round-trip is the only thing hardware can't test.

## Seeded SKUs for testing

`P-000001` … `P-000006` (`src/db/seed.ts`).
