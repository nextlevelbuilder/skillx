-- Personal kits: immutable revisions, rebase conflicts and an append-only audit (issue #55)
--
-- Strictly additive: four new tables, their indexes and four triggers. No existing table or
-- row changes. `personal_kit_revisions` content columns are immutable (UPDATE OF them aborts)
-- and revisions are never deleted, so a kit's lineage cannot be rewritten; only `state`, the
-- review timestamps and `approval_json` change. `personal_kit_audit` is append-only.
--
-- Rollback (take a D1 time-travel bookmark first; personal kits and their history are lost).
-- The last statement removes the wrangler bookkeeping row, so a later `migrations apply`
-- re-applies 0015:
--   DROP TRIGGER IF EXISTS personal_kit_audit_no_delete;
--   DROP TRIGGER IF EXISTS personal_kit_audit_no_update;
--   DROP TRIGGER IF EXISTS personal_kit_revisions_no_delete;
--   DROP TRIGGER IF EXISTS personal_kit_revisions_immutable;
--   DROP TABLE IF EXISTS personal_kit_audit;
--   DROP TABLE IF EXISTS personal_kit_conflicts;
--   DROP TABLE IF EXISTS personal_kit_revisions;
--   DROP TABLE IF EXISTS personal_kits;
--   DELETE FROM d1_migrations WHERE name = '0015_personal_kits.sql';

CREATE TABLE `personal_kit_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`kit_id` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`revision_id` text,
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_personal_kit_audit_kit` ON `personal_kit_audit` (`kit_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `personal_kit_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`kit_id` text NOT NULL,
	`from_revision_id` text NOT NULL,
	`report_json` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution_json` text,
	`resolved_by` text,
	`resolved_revision_id` text,
	`reeval_required` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`kit_id`) REFERENCES `personal_kits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_personal_kit_conflicts_kit` ON `personal_kit_conflicts` (`kit_id`,`status`);--> statement-breakpoint
CREATE TABLE `personal_kit_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`kit_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`parent_revision_id` text,
	`revision_digest` text NOT NULL,
	`document_json` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`origin` text NOT NULL,
	`author_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`approval_json` text,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`activated_at` integer,
	`rejected_at` integer,
	`quarantined_at` integer,
	FOREIGN KEY (`kit_id`) REFERENCES `personal_kits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_personal_kit_revisions_number` ON `personal_kit_revisions` (`kit_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_personal_kit_revisions_idempotency` ON `personal_kit_revisions` (`kit_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_personal_kit_revisions_digest` ON `personal_kit_revisions` (`kit_id`,`revision_digest`);--> statement-breakpoint
CREATE TABLE `personal_kits` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`publisher_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`local_id` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`effective_revision_id` text,
	`latest_revision_number` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`publisher_id`) REFERENCES `publishers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_personal_kits_name` ON `personal_kits` (`name`);--> statement-breakpoint
CREATE INDEX `idx_personal_kits_owner` ON `personal_kits` (`owner_user_id`);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS personal_kit_revisions_immutable
BEFORE UPDATE OF kit_id, revision_number, parent_revision_id, revision_digest, document_json, origin, author_user_id, idempotency_key, created_at
ON personal_kit_revisions BEGIN
  SELECT RAISE(ABORT, 'personal_kit_revisions content is immutable');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS personal_kit_revisions_no_delete BEFORE DELETE ON personal_kit_revisions BEGIN
  SELECT RAISE(ABORT, 'personal_kit_revisions are never deleted');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS personal_kit_audit_no_update BEFORE UPDATE ON personal_kit_audit BEGIN
  SELECT RAISE(ABORT, 'personal_kit_audit is append-only');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS personal_kit_audit_no_delete BEFORE DELETE ON personal_kit_audit BEGIN
  SELECT RAISE(ABORT, 'personal_kit_audit is append-only');
END;