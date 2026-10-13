-- Release and publisher state transition audit (issue #54)
--
-- Strictly additive: one new table, its index and two triggers. No existing table or row
-- changes. Every transition attempt of the state API (`applied`, `stale`, `denied`, `invalid`)
-- is one row; the triggers make the table append-only (any UPDATE or DELETE aborts).
-- There are no foreign keys, so the history outlives its release or publisher.
--
-- Rollback (take a D1 time-travel bookmark first; the audit history is lost). The last
-- statement removes the wrangler bookkeeping row, so a later `migrations apply` re-applies 0013:
--   DROP TRIGGER IF EXISTS release_state_audit_no_delete;
--   DROP TRIGGER IF EXISTS release_state_audit_no_update;
--   DROP INDEX IF EXISTS idx_release_state_audit_subject;
--   DROP TABLE IF EXISTS release_state_audit;
--   DELETE FROM d1_migrations WHERE name = '0013_release_state_audit.sql';

CREATE TABLE `release_state_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_id` text NOT NULL,
	`from_state` text NOT NULL,
	`to_state` text NOT NULL,
	`outcome` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_release_state_audit_subject` ON `release_state_audit` (`subject_kind`,`subject_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS release_state_audit_no_update BEFORE UPDATE ON release_state_audit BEGIN
  SELECT RAISE(ABORT, 'release_state_audit is append-only');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS release_state_audit_no_delete BEFORE DELETE ON release_state_audit BEGIN
  SELECT RAISE(ABORT, 'release_state_audit is append-only');
END;
