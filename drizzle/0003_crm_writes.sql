CREATE TABLE "redsky"."crm_writes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"kind" text NOT NULL,
	"record_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "redsky"."crm_writes" ADD CONSTRAINT "crm_writes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_writes_request_idx" ON "redsky"."crm_writes" USING btree ("user_id","request_key");