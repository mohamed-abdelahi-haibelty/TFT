ALTER TABLE "users" ADD COLUMN "permissions" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Backfill: staff accounts that already exist keep exactly the access they
-- had before permissions existed (orders lifecycle, POS, inventory, labels,
-- catalog reads), so shipping this changes nothing for anyone already
-- signed in. Newly created staff start empty and are granted explicitly.
-- Promotions are deliberately absent: staff previously had a read-only
-- promotions list, and the vocabulary has no view-only promotions key, so
-- that one read is re-granted by the owner rather than silently upgraded
-- into manage rights.
UPDATE "users"
SET "permissions" = ARRAY[
  'catalog.view',
  'orders.view',
  'orders.manage',
  'orders.cancel',
  'pos.use',
  'inventory.view',
  'inventory.adjust',
  'labels.print'
]::text[]
WHERE "role" = 'staff' AND "permissions" = '{}';
