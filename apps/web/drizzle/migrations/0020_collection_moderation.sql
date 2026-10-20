-- Collections moderation (issue #114): operators can hide a public or unlisted collection.
--
-- Strictly additive: one NOT NULL column with a default ('active', so every existing row stays
-- readable as before) and two nullable columns. Code that predates this migration never reads
-- them, and the collection code treats a missing `moderation_state` as 'active', so either
-- deploy order works; only the admin moderation route needs the columns.
--
-- Rollback un-hides content: code before 0020 ignores `moderation_state`, so first make every
-- hidden collection private (UPDATE collections SET visibility = 'private' WHERE
-- moderation_state = 'hidden'), then deploy the previous code.
--
-- Rollback (take a D1 time-travel bookmark first). SQLite >= 3.35 drops columns in place;
-- the last statement removes the wrangler bookkeeping row so a later apply re-runs 0020:
--   ALTER TABLE `collections` DROP COLUMN `moderated_at`;
--   ALTER TABLE `collections` DROP COLUMN `moderation_reason`;
--   ALTER TABLE `collections` DROP COLUMN `moderation_state`;
--   DELETE FROM d1_migrations WHERE name = '0020_collection_moderation.sql';

ALTER TABLE `collections` ADD `moderation_state` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `collections` ADD `moderation_reason` text;--> statement-breakpoint
ALTER TABLE `collections` ADD `moderated_at` integer;
