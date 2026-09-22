-- Canonical skill identity + alias layer (issue #25)
--
-- Adds the source identity columns used to tell apart two skills that share a display
-- name, and the alias table that keeps legacy slugs (including the mangled `-ill-md`
-- ones) resolving to the same skill row.
--
-- NOTE: drizzle-kit generated this file with the whole snapshot delta (it also re-created
-- `votes` and re-added columns that 0007/0008 had already added by hand, because those
-- migrations were authored without matching snapshots). Those statements were removed
-- here; applying them would fail with "table already exists" / "duplicate column name".

CREATE TABLE `skill_aliases` (
	`slug` text PRIMARY KEY NOT NULL,
	`skill_id` text NOT NULL,
	`reason` text DEFAULT 'legacy' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_skill_aliases_skill` ON `skill_aliases` (`skill_id`);--> statement-breakpoint
ALTER TABLE `skills` ADD `source_repo` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `source_path` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_skills_source_identity` ON `skills` (`source_repo`,`source_path`) WHERE source_repo IS NOT NULL;

-- Rollback (SQLite/D1 support DROP COLUMN since 3.35):
--   DROP INDEX IF EXISTS idx_skills_source_identity;
--   ALTER TABLE skills DROP COLUMN source_path;
--   ALTER TABLE skills DROP COLUMN source_repo;
--   DROP INDEX IF EXISTS idx_skill_aliases_skill;
--   DROP TABLE IF EXISTS skill_aliases;
--
-- Data backfill (slug rewrite + alias rows) is a separate, reviewable step:
--   node scripts/backfill-skill-identities.mjs --sql
-- It writes a JSON backup of every affected row before any UPDATE.
