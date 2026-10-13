-- Release tree digest, signed manifest pointer, publisher state and package visibility (issue #54)
--
-- Strictly additive: nullable columns, or NOT NULL columns with a default, plus one index.
-- Existing rows keep every value; `publishers.state` becomes 'active' and
-- `packages.visibility` becomes 'public'. `release_digest` is the
-- agentkit.skill-tree/v1 tree digest named by the signed skillx.release/v1 manifest.
-- `status_sequence` and `status_issued_at` record the last signed skillx.release-status/v1
-- document, whose sequence must strictly increase.
--
-- NOTE ON DRIFT: `drizzle-kit generate` emitted CREATE TABLE for all seven registry tables
-- (publishers, packages, package_releases, release_verification_evidence, entitlements,
-- collections, collection_revisions), because the 0010 snapshot omits them although 0009
-- created them. Those statements were removed here; applying them would fail with "table
-- already exists". The 0011 snapshot records the full schema, which realigns the generator.
--
-- Rollback (SQLite/D1 support DROP COLUMN since 3.35; take a D1 time-travel bookmark first):
--   DROP INDEX IF EXISTS idx_package_releases_digest;
--   ALTER TABLE package_releases DROP COLUMN status_issued_at;
--   ALTER TABLE package_releases DROP COLUMN status_sequence;
--   ALTER TABLE package_releases DROP COLUMN quarantined_at;
--   ALTER TABLE package_releases DROP COLUMN signed_manifest_key;
--   ALTER TABLE package_releases DROP COLUMN tree_size;
--   ALTER TABLE package_releases DROP COLUMN file_count;
--   ALTER TABLE package_releases DROP COLUMN release_digest;
--   ALTER TABLE packages DROP COLUMN visibility;
--   ALTER TABLE publishers DROP COLUMN state;

ALTER TABLE `publishers` ADD `state` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `packages` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `package_releases` ADD `release_digest` text;--> statement-breakpoint
ALTER TABLE `package_releases` ADD `file_count` integer;--> statement-breakpoint
ALTER TABLE `package_releases` ADD `tree_size` integer;--> statement-breakpoint
ALTER TABLE `package_releases` ADD `signed_manifest_key` text;--> statement-breakpoint
ALTER TABLE `package_releases` ADD `quarantined_at` integer;--> statement-breakpoint
ALTER TABLE `package_releases` ADD `status_sequence` integer;--> statement-breakpoint
ALTER TABLE `package_releases` ADD `status_issued_at` integer;--> statement-breakpoint
CREATE INDEX `idx_package_releases_digest` ON `package_releases` (`release_digest`);
