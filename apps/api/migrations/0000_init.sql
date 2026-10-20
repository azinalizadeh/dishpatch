CREATE TYPE "public"."participant_role" AS ENUM('host', 'guest');--> statement-breakpoint
CREATE TYPE "public"."slot_category" AS ENUM('main', 'side', 'salad', 'dessert', 'drinks');--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"type" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_log_event_seq_uq" UNIQUE("event_id","seq"),
	CONSTRAINT "event_log_type_check" CHECK ("event_log"."type" IN ('slot.claimed','slot.released','slot.added','slot.removed','participant.joined','event.updated','invite.rotated'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(80) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"location" varchar(120),
	"host_token_hash" "bytea" NOT NULL,
	"invite_token_hash" "bytea" NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "events_host_token_hash_unique" UNIQUE("host_token_hash"),
	CONSTRAINT "events_invite_token_hash_unique" UNIQUE("invite_token_hash"),
	CONSTRAINT "events_title_check" CHECK (char_length(trim("events"."title")) BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"display_name" varchar(40) NOT NULL,
	"dietary_needs" text[] DEFAULT '{}'::text[] NOT NULL,
	"role" "participant_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_display_name_check" CHECK (char_length(trim("participants"."display_name")) BETWEEN 1 AND 40),
	CONSTRAINT "participants_dietary_needs_check" CHECK ("participants"."dietary_needs" <@ ARRAY['vegetarian','vegan','gluten_free','dairy_free','nut_free','halal']::text[])
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"category" "slot_category" NOT NULL,
	"position" smallint NOT NULL,
	"claimed_by" uuid,
	"dish_name" varchar(60),
	"dish_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "slots_event_category_position_uq" UNIQUE("event_id","category","position"),
	CONSTRAINT "slots_position_check" CHECK ("slots"."position" BETWEEN 0 AND 11),
	CONSTRAINT "slots_dish_tags_check" CHECK ("slots"."dish_tags" <@ ARRAY['vegetarian','vegan','gluten_free','dairy_free','nut_free','halal']::text[]),
	CONSTRAINT "slots_no_half_claim" CHECK (("slots"."claimed_by" IS NULL) = ("slots"."dish_name" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_claimed_by_participants_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_expires_at_idx" ON "events" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_event_name_uq" ON "participants" USING btree ("event_id",lower("display_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "participants_one_host_uq" ON "participants" USING btree ("event_id") WHERE "participants"."role" = 'host';--> statement-breakpoint
CREATE INDEX "sessions_participant_idx" ON "sessions" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "slots_event_idx" ON "slots" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "slots_claimed_by_idx" ON "slots" USING btree ("event_id","claimed_by") WHERE "slots"."claimed_by" IS NOT NULL;