ALTER TABLE "admin_account" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD COLUMN "account_version" integer;