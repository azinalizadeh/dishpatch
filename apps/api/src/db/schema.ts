// 04-architecture.md › Data model. Run `pnpm db:generate` after editing and commit the migration.
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const slotCategory = pgEnum('slot_category', ['main', 'side', 'salad', 'dessert', 'drinks']);
export const participantRole = pgEnum('participant_role', ['host', 'guest']);

// Mirrors DIETARY in packages/shared/src/dietary.ts; db-constraints.int.test.ts keeps them in sync.
const dietaryCheck = (column: AnyPgColumn) =>
  sql`${column} <@ ARRAY['vegetarian','vegan','gluten_free','dairy_free','nut_free','halal']::text[]`;

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 80 }).notNull(),
    startsAt: tstz('starts_at').notNull(),
    location: varchar('location', { length: 120 }),
    hostTokenHash: bytea('host_token_hash').notNull().unique(),
    inviteTokenHash: bytea('invite_token_hash').notNull().unique(),
    locked: boolean('locked').notNull().default(false),
    seq: bigint('seq', { mode: 'number' }).notNull().default(0),
    createdAt: tstz('created_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
  },
  (t) => [
    check('events_title_check', sql`char_length(trim(${t.title})) BETWEEN 1 AND 80`),
    index('events_expires_at_idx').on(t.expiresAt),
  ],
);

export const participants = pgTable(
  'participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 40 }).notNull(),
    dietaryNeeds: text('dietary_needs').array().notNull().default(sql`'{}'::text[]`),
    role: participantRole('role').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check(
      'participants_display_name_check',
      sql`char_length(trim(${t.displayName})) BETWEEN 1 AND 40`,
    ),
    check('participants_dietary_needs_check', dietaryCheck(t.dietaryNeeds)),
    uniqueIndex('participants_event_name_uq').on(t.eventId, sql`lower(${t.displayName})`),
    uniqueIndex('participants_one_host_uq').on(t.eventId).where(sql`${t.role} = 'host'`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    tokenHash: bytea('token_hash').notNull().unique(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
  },
  (t) => [index('sessions_participant_idx').on(t.participantId)],
);

export const slots = pgTable(
  'slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    category: slotCategory('category').notNull(),
    position: smallint('position').notNull(),
    claimedBy: uuid('claimed_by').references(() => participants.id, { onDelete: 'set null' }),
    dishName: varchar('dish_name', { length: 60 }),
    dishTags: text('dish_tags').array().notNull().default(sql`'{}'::text[]`),
    claimedAt: tstz('claimed_at'),
  },
  (t) => [
    check('slots_position_check', sql`${t.position} BETWEEN 0 AND 11`),
    check('slots_dish_tags_check', dietaryCheck(t.dishTags)),
    check('slots_no_half_claim', sql`(${t.claimedBy} IS NULL) = (${t.dishName} IS NULL)`),
    unique('slots_event_category_position_uq').on(t.eventId, t.category, t.position),
    index('slots_event_idx').on(t.eventId),
    index('slots_claimed_by_idx').on(t.eventId, t.claimedBy).where(sql`${t.claimedBy} IS NOT NULL`),
  ],
);

export const eventLog = pgTable(
  'event_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check(
      'event_log_type_check',
      sql`${t.type} IN ('slot.claimed','slot.released','slot.added','slot.removed','participant.joined','event.updated','invite.rotated')`,
    ),
    unique('event_log_event_seq_uq').on(t.eventId, t.seq),
    // The cleanup job prunes by age across every board.
    index('event_log_created_at_idx').on(t.createdAt),
  ],
);
