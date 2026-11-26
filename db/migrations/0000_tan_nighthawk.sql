CREATE TABLE "admin_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "education" (
	"id" serial PRIMARY KEY NOT NULL,
	"degree" text NOT NULL,
	"school" text NOT NULL,
	"location" text,
	"start_date" date,
	"end_date" date,
	"description" text,
	"is_visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experience" (
	"id" serial PRIMARY KEY NOT NULL,
	"position" text NOT NULL,
	"company" text,
	"location" text,
	"start_date" date,
	"end_date" date,
	"current" boolean DEFAULT false NOT NULL,
	"bullets" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"subject" text,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"headline" text NOT NULL,
	"intro" text NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"location" text,
	"email" text NOT NULL,
	"github_url" text,
	"linkedin_url" text,
	"available" boolean DEFAULT false NOT NULL,
	"availability_text" text,
	"photo_key" text,
	"photo_alt" text,
	"cv_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_singleton" CHECK ("profile"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"role" text,
	"category" text NOT NULL,
	"technologies" text[] DEFAULT '{}'::text[] NOT NULL,
	"live_url" text,
	"github_url" text,
	"image_key" text,
	"image_alt" text,
	"featured" boolean DEFAULT false NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_saved_at" timestamp with time zone,
	CONSTRAINT "site_state_singleton" CHECK ("site_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"icon_slug" text,
	"is_visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_ip_hash_created_at_idx" ON "login_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "messages_ip_hash_created_at_idx" ON "messages" USING btree ("ip_hash","created_at");