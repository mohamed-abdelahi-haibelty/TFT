# Task 06 — Barcode Generation + Printable Labels

## Goal
Every product/variant/bundle SKU has a scannable Code 128 barcode and a printable label.

## Depends on
Task 05.

## Scope
- Route handler `GET /api/barcode/[sku]` (auth required): bwip-js Code 128 PNG, cached immutable.
- Label view `/admin/products/[id]/label` (and per variant / bundle): renders label(s) containing barcode, product name (French), price. Sized for common 40×30 mm thermal labels, with a count input to render N copies on one page for batch printing.
- "Print label" action on product list and product form; browser print stylesheet so printing the page yields clean labels only (workflow: print/share this page via the thermal printer's app — no direct Bluetooth printing).
- Barcode value = SKU exactly (what the scanner will type in POS).

## Done when
- [ ] Label page for a product with variants shows one label per variant with distinct SKUs.
- [ ] Barcode PNG endpoint rejects unauthenticated requests.
- [ ] Generated barcode for a known SKU decodes back to that SKU (unit test via bwip-js round-trip or fixture).
- [ ] Build + tests pass.
