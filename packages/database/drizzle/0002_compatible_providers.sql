ALTER TYPE "public"."provider_id" ADD VALUE 'groq' BEFORE 'demo';--> statement-breakpoint
ALTER TYPE "public"."provider_id" ADD VALUE 'openrouter' BEFORE 'demo';--> statement-breakpoint
ALTER TYPE "public"."provider_id" ADD VALUE 'ollama' BEFORE 'demo';--> statement-breakpoint
ALTER TABLE "provider_configs" ADD COLUMN "base_url" text;--> statement-breakpoint
ALTER TABLE "provider_configs" ADD COLUMN "free_tier" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_configs" ADD COLUMN "max_concurrency" integer;