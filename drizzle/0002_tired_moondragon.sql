CREATE TYPE "public"."activity_kind" AS ENUM('object_added', 'object_updated', 'object_filed', 'collection_created', 'share_created');--> statement-breakpoint
CREATE TYPE "public"."collection_kind" AS ENUM('cluster', 'shelf', 'smart');--> statement-breakpoint
CREATE TYPE "public"."cut_style" AS ENUM('edge', 'die_cut', 'loose', 'full');--> statement-breakpoint
CREATE TYPE "public"."date_precision" AS ENUM('day', 'month', 'year', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."face_role" AS ENUM('recto', 'verso', 'detail');--> statement-breakpoint
CREATE TYPE "public"."intake_source" AS ENUM('camera', 'share_target', 'files');--> statement-breakpoint
CREATE TYPE "public"."intake_status" AS ENUM('uploaded', 'segmented', 'extracted', 'needs_review', 'filed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."person_role" AS ENUM('given_by', 'depicted', 'mentioned');--> statement-breakpoint
CREATE TYPE "public"."retention" AS ENUM('retained', 'digital_only');--> statement-breakpoint
CREATE TYPE "public"."share_scope" AS ENUM('object', 'collection');--> statement-breakpoint
CREATE TYPE "public"."silhouette" AS ENUM('edge', 'card', 'ticket', 'polaroid', 'circle', 'blob', 'bust');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"target_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_objects" (
	"collection_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collection_objects_collection_id_object_id_pk" PRIMARY KEY("collection_id","object_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "collection_kind" NOT NULL,
	"rule" jsonb,
	"board_x" real,
	"board_y" real,
	"board_w" real,
	"board_h" real,
	"implied_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"source" "intake_source" DEFAULT 'camera' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"status" "intake_status" DEFAULT 'uploaded' NOT NULL,
	"original_url" text,
	"cutout_url" text,
	"corners" jsonb,
	"ocr" jsonb,
	"suggestions" jsonb,
	"object_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "object_faces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid NOT NULL,
	"role" "face_role" DEFAULT 'recto' NOT NULL,
	"original_url" text,
	"cutout_url" text,
	"mask_url" text,
	"thumb_url" text,
	"width" integer,
	"height" integer,
	"bytes" bigint,
	"mime" text,
	"dpi" integer,
	"exif" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "object_people" (
	"object_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "person_role" DEFAULT 'given_by' NOT NULL,
	CONSTRAINT "object_people_object_id_person_id_role_pk" PRIMARY KEY("object_id","person_id","role")
);
--> statement-breakpoint
CREATE TABLE "object_tags" (
	"object_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "object_tags_object_id_tag_id_pk" PRIMARY KEY("object_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"lot_no" integer NOT NULL,
	"title" text NOT NULL,
	"kind" text,
	"silhouette" "silhouette" DEFAULT 'card' NOT NULL,
	"cut_style" "cut_style" DEFAULT 'edge' NOT NULL,
	"rotation_deg" real DEFAULT 0 NOT NULL,
	"received_at" date,
	"received_precision" date_precision DEFAULT 'day' NOT NULL,
	"place_id" uuid,
	"occasion_id" uuid,
	"story" text,
	"retention" "retention" DEFAULT 'retained' NOT NULL,
	"retained_location" text,
	"material" text,
	"width_mm" integer,
	"height_mm" integer,
	"board_x" real,
	"board_y" real,
	"board_z" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "occasions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text GENERATED ALWAYS AS (lower(name)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text GENERATED ALWAYS AS (lower(name)) STORED,
	"initials" text,
	"avatar_url" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text GENERATED ALWAYS AS (lower(name)) STORED,
	"lat" double precision,
	"lng" double precision,
	"kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"token" text NOT NULL,
	"scope" "share_scope" DEFAULT 'object' NOT NULL,
	"object_id" uuid,
	"collection_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text GENERATED ALWAYS AS (lower(name)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_objects" ADD CONSTRAINT "collection_objects_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_objects" ADD CONSTRAINT "collection_objects_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_batches" ADD CONSTRAINT "intake_batches_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_batch_id_intake_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."intake_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_faces" ADD CONSTRAINT "object_faces_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_people" ADD CONSTRAINT "object_people_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_people" ADD CONSTRAINT "object_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_tags" ADD CONSTRAINT "object_tags_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_tags" ADD CONSTRAINT "object_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objects" ADD CONSTRAINT "objects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objects" ADD CONSTRAINT "objects_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objects" ADD CONSTRAINT "objects_occasion_id_occasions_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasions" ADD CONSTRAINT "occasions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_owner_created_idx" ON "activity" USING btree ("owner_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "collection_objects_object_idx" ON "collection_objects" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "collections_owner_kind_idx" ON "collections" USING btree ("owner_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "intake_batches_owner_idx" ON "intake_batches" USING btree ("owner_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "intake_items_batch_status_idx" ON "intake_items" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "object_faces_object_idx" ON "object_faces" USING btree ("object_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "object_faces_one_recto_key" ON "object_faces" USING btree ("object_id") WHERE "object_faces"."role" = 'recto';--> statement-breakpoint
CREATE INDEX "object_people_person_idx" ON "object_people" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "object_tags_tag_idx" ON "object_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "objects_owner_lot_key" ON "objects" USING btree ("owner_id","lot_no");--> statement-breakpoint
CREATE INDEX "objects_owner_received_idx" ON "objects" USING btree ("owner_id","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "objects_owner_created_idx" ON "objects" USING btree ("owner_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "objects_place_idx" ON "objects" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "objects_occasion_idx" ON "objects" USING btree ("occasion_id");--> statement-breakpoint
CREATE INDEX "objects_title_trgm_idx" ON "objects" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "objects_story_trgm_idx" ON "objects" USING gin ("story" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "occasions_owner_name_key" ON "occasions" USING btree ("owner_id","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "people_owner_name_key" ON "people" USING btree ("owner_id","name_key");--> statement-breakpoint
CREATE INDEX "people_name_trgm_idx" ON "people" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "places_owner_name_key" ON "places" USING btree ("owner_id","name_key");--> statement-breakpoint
CREATE INDEX "places_name_trgm_idx" ON "places" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "shares_owner_idx" ON "shares" USING btree ("owner_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "tags_owner_name_key" ON "tags" USING btree ("owner_id","name_key");