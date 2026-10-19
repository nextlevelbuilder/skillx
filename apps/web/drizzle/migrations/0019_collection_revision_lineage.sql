-- Collections API (issue #35): revision digests, clone lineage and immutable revisions.
--
-- Strictly additive: two nullable columns and one trigger. Existing rows keep NULL in both
-- columns (no backfill; revisions created before this migration have no digest). The
-- trigger aborts every UPDATE of a collection revision, so a stored revision can never be
-- rewritten; revisions are still removed by the ON DELETE CASCADE of their collection.
--
-- Rollback (take a D1 time-travel bookmark first). SQLite >= 3.35 drops columns in place;
-- the last statement removes the wrangler bookkeeping row so a later apply re-runs 0019:
--   DROP TRIGGER IF EXISTS collection_revisions_immutable;
--   ALTER TABLE `collection_revisions` DROP COLUMN `revision_digest`;
--   ALTER TABLE `collections` DROP COLUMN `cloned_from_revision_id`;
--   DELETE FROM d1_migrations WHERE name = '0019_collection_revision_lineage.sql';

ALTER TABLE `collection_revisions` ADD `revision_digest` text;--> statement-breakpoint
ALTER TABLE `collections` ADD `cloned_from_revision_id` text;--> statement-breakpoint
CREATE TRIGGER `collection_revisions_immutable` BEFORE UPDATE ON `collection_revisions`
BEGIN
	SELECT RAISE(ABORT, 'collection revisions are immutable');
END;
