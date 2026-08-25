CREATE INDEX "bundle_images_bundle_id_idx" ON "bundle_images" USING btree ("bundle_id","sort");--> statement-breakpoint
CREATE INDEX "bundle_items_product_id_idx" ON "bundle_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_images_product_id_idx" ON "product_images" USING btree ("product_id","sort");--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at" desc);--> statement-breakpoint
CREATE INDEX "variant_images_variant_id_idx" ON "variant_images" USING btree ("variant_id","sort");