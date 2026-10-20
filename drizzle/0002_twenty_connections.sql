CREATE TABLE "redsky"."twenty_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"twenty_user_id" text NOT NULL,
	"twenty_workspace_id" text NOT NULL,
	"account" text NOT NULL,
	"access_token_ciphertext" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"refresh_token_ciphertext" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "redsky"."twenty_connections" ADD CONSTRAINT "twenty_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;