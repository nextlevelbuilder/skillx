-- Creator dashboard: soft delete of packages and personal kits, and the owner management
-- audit.
--
-- Strictly additive: one new table with its index and two triggers, and one nullable column on
-- `packages` and on `personal_kits`. Existing rows keep NULL `deleted_at` (not deleted), so
-- every read stays as before. The triggers make `package_audit` append-only (any UPDATE or
-- DELETE aborts). There are no foreign keys, so the history outlives its package or kit.
-- Code that predates this migration never reads the new column or table; the new code needs
-- them, so apply this migration before deploying it.
--
-- Rollback un-deletes content: code before 0022 ignores `deleted_at`, so a deleted package or
-- kit becomes readable again. Take a D1 time-travel bookmark first. To keep deleted subjects
-- hidden, make them private first:
--   UPDATE packages SET visibility = 'private' WHERE deleted_at IS NOT NULL;
--   UPDATE personal_kits SET visibility = 'private' WHERE deleted_at IS NOT NULL;
-- Code before 0022 treats `unlisted` as private (fails closed). SQLite >= 3.35 drops columns
-- in place; the last statement removes the wrangler bookkeeping row so a later apply re-runs
-- 0022:
--   DROP TRIGGER IF EXISTS package_audit_no_delete;
--   DROP TRIGGER IF EXISTS package_audit_no_update;
--   DROP INDEX IF EXISTS idx_package_audit_subject;
--   DROP TABLE IF EXISTS package_audit;
--   ALTER TABLE `personal_kits` DROP COLUMN `deleted_at`;
--   ALTER TABLE `packages` DROP COLUMN `deleted_at`;
--   DELETE FROM d1_migrations WHERE name = '0022_creator_dashboard.sql';

CREATE TABLE `package_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`subject_name` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_package_audit_subject` ON `package_audit` (`subject_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `packages` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `personal_kits` ADD `deleted_at` integer;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS package_audit_no_update BEFORE UPDATE ON package_audit BEGIN
  SELECT RAISE(ABORT, 'package_audit is append-only');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS package_audit_no_delete BEFORE DELETE ON package_audit BEGIN
  SELECT RAISE(ABORT, 'package_audit is append-only');
END;
