CREATE TABLE "redsky"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"visibility" text NOT NULL,
	"related_label" text DEFAULT '' NOT NULL,
	"no_ai" boolean DEFAULT false NOT NULL,
	"ocr_document_id" uuid,
	"status" text NOT NULL,
	"status_reason" text,
	"status_at" timestamp with time zone DEFAULT now() NOT NULL,
	"page_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."ocr_event_receipts" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "redsky"."documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "redsky"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_storage_key_idx" ON "redsky"."documents" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_ocr_document_idx" ON "redsky"."documents" USING btree ("ocr_document_id");--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "redsky"."documents" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_visibility_idx" ON "redsky"."documents" USING btree ("visibility","created_at");