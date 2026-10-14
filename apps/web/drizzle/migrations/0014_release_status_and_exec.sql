-- Signed release status pointer and exec manifest summary (issue #54)
--
-- Strictly additive: two nullable columns on package_releases. Existing rows keep every value
-- and read as "no status issued yet" and "no agentkit-exec.json".
-- `status_key` is the R2 key of the latest signed skillx.release-status/v1 document, whose
-- sequence and issuedAt 0011 already records. `exec_summary_json` holds the parsed capability
-- summary of a valid agentkit-exec.json (agentkit.skill-exec/v1) checked at publish.
--
-- Rollback (SQLite/D1 support DROP COLUMN since 3.35; take a D1 time-travel bookmark first).
-- The last statement removes the wrangler bookkeeping row, so a later `migrations apply`
-- re-applies 0014 instead of skipping it:
--   ALTER TABLE package_releases DROP COLUMN exec_summary_json;
--   ALTER TABLE package_releases DROP COLUMN status_key;
--   DELETE FROM d1_migrations WHERE name = '0014_release_status_and_exec.sql';

ALTER TABLE `package_releases` ADD `status_key` text;--> statement-breakpoint
ALTER TABLE `package_releases` ADD `exec_summary_json` text;
