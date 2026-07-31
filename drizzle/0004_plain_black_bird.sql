CREATE TABLE "api_usage" (
	"owner_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"window" integer NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_owner_id_endpoint_window_pk" PRIMARY KEY("owner_id","endpoint","window")
);
--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;