CREATE SCHEMA IF NOT EXISTS "redsky";
--> statement-breakpoint
CREATE TABLE "redsky"."ai_action_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action_key" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"provider" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"style" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"outcome" text NOT NULL,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."dashboard_layouts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"layout" jsonb NOT NULL,
	"layout_touched" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."employee_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"preferred_name" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"office" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"monogram_tone" smallint DEFAULT 1 NOT NULL,
	"photo" "bytea",
	"photo_mime" text,
	"focus_areas" text[] DEFAULT '{}'::text[] NOT NULL,
	"directory_source" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."integration_requests" (
	"user_id" uuid NOT NULL,
	"connector_id" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_requests_user_id_connector_id_pk" PRIMARY KEY("user_id","connector_id")
);
--> statement-breakpoint
CREATE TABLE "redsky"."item_states" (
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"item_key" text NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_states_user_id_source_item_key_pk" PRIMARY KEY("user_id","source","item_key")
);
--> statement-breakpoint
CREATE TABLE "redsky"."meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."onboarding_progress" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"current_step" smallint DEFAULT 0 NOT NULL,
	"max_step" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "redsky"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"related_label" text DEFAULT '' NOT NULL,
	"related_kind" text,
	"related_id" text,
	"due_on" date,
	"priority" text DEFAULT 'med' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"source_note" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"preferences" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_provider" text NOT NULL,
	"auth_subject" text NOT NULL,
	"tenant_id" text,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"access_role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."workstyle_assessments" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_version" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_name_ciphertext" text,
	"extraction" jsonb NOT NULL,
	"draft_ciphertext" text,
	"profile_ciphertext" text,
	"reviewed_at" timestamp with time zone,
	"baseline" jsonb,
	"recommendations" jsonb,
	"sharing" jsonb DEFAULT '{"manager":false,"colleagues":false}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."workstyle_consent_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"action" text NOT NULL,
	"consent_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redsky"."workstyle_documents" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "redsky"."ai_action_executions" ADD CONSTRAINT "ai_action_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "redsky"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."employee_profiles" ADD CONSTRAINT "employee_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."integration_requests" ADD CONSTRAINT "integration_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."item_states" ADD CONSTRAINT "item_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."onboarding_progress" ADD CONSTRAINT "onboarding_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."tasks" ADD CONSTRAINT "tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."workstyle_assessments" ADD CONSTRAINT "workstyle_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."workstyle_consent_log" ADD CONSTRAINT "workstyle_consent_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redsky"."workstyle_documents" ADD CONSTRAINT "workstyle_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "redsky"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_action_executions_key_idx" ON "redsky"."ai_action_executions" USING btree ("user_id","action_key");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_idx" ON "redsky"."ai_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_idx" ON "redsky"."ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "redsky"."audit_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "redsky"."audit_events" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "redsky"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_owner_status_idx" ON "redsky"."tasks" USING btree ("owner_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_identity_idx" ON "redsky"."users" USING btree ("auth_provider","auth_subject");--> statement-breakpoint
CREATE INDEX "workstyle_consent_user_idx" ON "redsky"."workstyle_consent_log" USING btree ("user_id");