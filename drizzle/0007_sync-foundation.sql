CREATE TABLE "sync_client_ids" (
	"owner_id" text NOT NULL,
	"entity" text NOT NULL,
	"client_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_client_ids_owner_id_entity_client_id_pk" PRIMARY KEY("owner_id","entity","client_id")
);
--> statement-breakpoint
CREATE TABLE "sync_entities" (
	"owner_id" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_entities_owner_id_entity_entity_id_pk" PRIMARY KEY("owner_id","entity","entity_id")
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"owner_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_operations_owner_id_operation_id_pk" PRIMARY KEY("owner_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "sync_client_ids" ADD CONSTRAINT "sync_client_ids_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_entities" ADD CONSTRAINT "sync_entities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;