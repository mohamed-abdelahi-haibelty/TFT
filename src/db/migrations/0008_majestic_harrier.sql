DROP TABLE "label_sheet_selections" CASCADE;--> statement-breakpoint
-- `labels.print` is no longer part of the permission vocabulary. `parsePermissions`
-- already drops unknown keys on read, so a stale entry could not widen access —
-- but leaving it in the column means the users page reports a granted count that
-- includes a permission nothing can act on.
UPDATE "users" SET "permissions" = array_remove("permissions", 'labels.print')
WHERE 'labels.print' = ANY("permissions");
