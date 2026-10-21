CREATE TABLE "redsky"."crm_connections" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"refresh_token_ciphertext" text NOT NULL,
	"access_token_ciphertext" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_connections_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "redsky"."crm_connections" ADD CONSTRAINT "crm_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;