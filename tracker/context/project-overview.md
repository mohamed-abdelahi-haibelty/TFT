# Papeterie Store

## Overview

An online storefront + admin system for a stationery shop (papeterie) in Nouadhibou (NDB), Mauritania. Customers in NDB and Nouakchott (NKC) browse products (bags, pens, notebooks, school "boxes") on a fast mobile-first website and order via WhatsApp. Payment happens outside the system (Bankily/Masrvi/Sedad screenshots in WhatsApp). NKC orders are shipped via intercity buses; the owner tracks each order through its lifecycle. The admin side also works as a lightweight POS for in-person sales in the shop, using barcode labels printed per product and a Bluetooth scanner.

## Goals

1. Customers can browse and place an order in under 2 minutes on a mobile phone, with no account.
2. The owner can manage products, stock, bundles, and every order status from a tablet.
3. Every stock change and order change is traceable (who, what, when).
4. Runs entirely on free tiers: Vercel, Neon, Cloudinary, Cloudflare.

## Core User Flows

### Web order (NKC customer)
1. Customer browses catalog, adds items to cart.
2. Checkout form: name, phone, city.
3. Order saved as `pending`; WhatsApp opens with prefilled message (order code + items + total).
4. Owner confirms payment screenshot in WhatsApp → marks order `confirmed`.
5. Order prepared, put on a bus → `shipped` (bus info recorded) → `arrived` → customer picks up at station → `delivered`.
6. Customer can track status anytime with order code + phone.

### Web order (NDB customer)
Same, but after `preparing` the order goes to `ready` (pickup at shop) → `delivered`.

### In-person sale (POS)
1. Staff opens Scan mode, scans product barcodes with Bluetooth scanner (acts as keyboard).
2. Lines can be removed before completion (wrong scan, customer changed mind) — every removal is logged.
3. Sale completed with payment method (cash / Bankily / Masrvi / other) → stock decremented → recorded as an order with `source=pos`, status `delivered`.
4. A completed sale can be voided by admin → stock restored, void logged.

## Features

### Storefront (public, no auth)
- Home: featured products, bundles ("boxes"), categories.
- Catalog: category filter, price filter, in-stock filter, search, sort.
- Product page: multi-image gallery, color variants, discount price, stock badge, backorder-allowed products can be ordered while out of stock.
- Bundle page: contents list, bundle price vs sum of item prices.
- Cart + checkout → order creation → WhatsApp deep link.
- Order tracking page (order code + phone).
- Bilingual Arabic (RTL) / French.

### Admin (auth required)
- Roles: `admin` (owner, full access), `staff` (one person: orders, POS, stock adjustments; no product deletion, price changes, user management, or revenue dashboard).
- Products: CRUD, categories, multiple images (Cloudinary), color variants, discounts, backorder flag, auto SKU + barcode label (printable).
- Bundles: compose from products, own price and images.
- Orders: list/filter by status, status transitions with history, bus info, edit items before shipping, cancel with reason.
- POS Scan mode: scan → add line, remove line, complete sale.
- Inventory: manual stock adjustments with reason; full stock movement log.
- Dashboard (admin only): monthly orders, revenue, top products, low-stock alerts.

## Scope

### In Scope
- Everything above.

### Out of Scope
- Online payment integration.
- Customer accounts, reviews, wishlists.
- Automated background removal for images (white background via Cloudinary transformations instead; may revisit later).
- Direct web-to-Bluetooth printing (labels are printed via the printer's own app from a rendered label image).
- Staging environment (dev + production only).

## Success Criteria

1. A phone user can place an order and land in WhatsApp with a correct prefilled message.
2. Owner can move an order pending → delivered with each change recorded in order events.
3. Scanning a barcode in Scan mode adds the correct product within 1 second.
4. Removing a POS line or voiding a sale restores stock and appears in the stock movement log.
5. Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95 on home, catalog, product pages.
