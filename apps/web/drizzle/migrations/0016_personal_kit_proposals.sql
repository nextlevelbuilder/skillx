-- Session-derived personal kit proposals: review metadata (issue #56)
--
-- Strictly additive: one new table, its index and two triggers. No existing table or row
-- changes. A proposal row holds the declared and required permissions, the optional
-- size-bounded evidence summary and scan finding codes of one `session-derived` revision;
-- never transcripts, prompts, environment or local paths. Rows are immutable.
--
-- Rollback (take a D1 time-travel bookmark first; proposal review metadata is lost, the
-- revisions themselves stay in personal_kit_revisions). The last statement removes the
-- wrangler bookkeeping row, so a later `migrations apply` re-applies 0016:
--   DROP TRIGGER IF EXISTS personal_kit_proposals_no_delete;
--   DROP TRIGGER IF EXISTS personal_kit_proposals_no_update;
--   DROP TABLE IF EXISTS personal_kit_proposals;
--   DELETE FROM d1_migrations WHERE name = '0016_personal_kit_proposals.sql';
CREATE TABLE `personal_kit_proposals` (
	`revision_id` text PRIMARY KEY NOT NULL,
	`kit_id` text NOT NULL,
	`identity` text NOT NULL,
	`declared_permissions_json` text NOT NULL,
	`required_permissions_json` text NOT NULL,
	`evidence_json` text,
	`scan_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`revision_id`) REFERENCES `personal_kit_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_personal_kit_proposals_kit` ON `personal_kit_proposals` (`kit_id`);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS personal_kit_proposals_no_update BEFORE UPDATE ON personal_kit_proposals BEGIN
  SELECT RAISE(ABORT, 'personal kit proposals are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS personal_kit_proposals_no_delete BEFORE DELETE ON personal_kit_proposals BEGIN
  SELECT RAISE(ABORT, 'personal kit proposals are never deleted');
END;