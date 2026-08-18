ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_stock_qty_non_negative";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_stock_qty_non_negative";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_qty_non_negative" CHECK ("products"."allow_backorder" = true OR "products"."stock_qty" >= 0);