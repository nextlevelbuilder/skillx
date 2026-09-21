-- Phase 0 — foundations: immutable registry, entitlements, and collection revisions.
--
-- NOTE ON ORDER: `packages`/`publishers` are created before their dependants so
-- foreign keys resolve on a fresh database.
--
-- NOTE ON DRIFT: the concurrent `drizzle-kit generate` output also contained
-- `CREATE TABLE votes`, its two indexes, `ALTER TABLE skills ADD COLUMN
-- upvote_count|downvote_count|net_votes|scripts|fts_content`, and
-- `CREATE INDEX idx_skills_net_votes`. Those objects were already created by the
-- hand-written migrations 0007_add-votes-table and 0008_add-skill-references, so
-- re-emitting them here would fail on any database that already applied them.
-- They are removed from this migration; the 0009 snapshot still records them,
-- which is what permanently realigns the generator baseline.

CREATE TABLE `publishers` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`owner_user_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publishers_handle_unique` ON `publishers` (`handle`);--> statement-breakpoint
CREATE INDEX `idx_publishers_owner` ON `publishers` (`owner_user_id`);--> statement-breakpoint

CREATE TABLE `packages` (
	`id` text PRIMARY KEY NOT NULL,
	`publisher_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`publisher_id`) REFERENCES `publishers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_packages_name` ON `packages` (`name`);--> statement-breakpoint
CREATE INDEX `idx_packages_publisher` ON `packages` (`publisher_id`);--> statement-breakpoint

CREATE TABLE `package_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`version` text NOT NULL,
	`channel` text DEFAULT 'stable' NOT NULL,
	`release_state` text DEFAULT 'draft' NOT NULL,
	`manifest_schema_version` text NOT NULL,
	`artifact_key` text,
	`artifact_digest` text,
	`artifact_size` integer,
	`source_provenance` text,
	`compatibility_json` text,
	`created_at` integer NOT NULL,
	`published_at` integer,
	`yanked_at` integer,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_package_releases_version` ON `package_releases` (`package_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_package_releases_state` ON `package_releases` (`release_state`);--> statement-breakpoint

CREATE TABLE `release_verification_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`release_digest` text NOT NULL,
	`harness` text NOT NULL,
	`harness_version` text NOT NULL,
	`os` text,
	`probe_id` text NOT NULL,
	`verified_at` integer NOT NULL,
	`verifier` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `package_releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_release_evidence_release` ON `release_verification_evidence` (`release_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_release_evidence_probe` ON `release_verification_evidence` (`release_id`,`harness`,`probe_id`);--> statement-breakpoint

CREATE TABLE `entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`package_id` text NOT NULL,
	`release_id` text,
	`source` text NOT NULL,
	`order_id` text,
	`granted_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `package_releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_entitlements_subject` ON `entitlements` (`subject_id`);--> statement-breakpoint
CREATE INDEX `idx_entitlements_package` ON `entitlements` (`package_id`);--> statement-breakpoint

CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`latest_revision_number` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_collections_owner_slug` ON `collections` (`owner_id`,`slug`);--> statement-breakpoint

CREATE TABLE `collection_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`members_json` text NOT NULL,
	`config_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_collection_revisions_number` ON `collection_revisions` (`collection_id`,`revision_number`);--> statement-breakpoint
CREATE INDEX `idx_collection_revisions_collection` ON `collection_revisions` (`collection_id`);
