ALTER TABLE "shop_settings" ADD COLUMN "street_ar" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "street_fr" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "city" text DEFAULT 'Nouadhibou';--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "country" text DEFAULT 'MR';--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "opens_at" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "closes_at" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "closed_day" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "instagram_url" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "facebook_url" text;