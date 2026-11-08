-- Paid AgentKit kit entitlements through a linked AgentKit account.
--
-- `packages.kit` names the AgentKit kit an `@agentkit/*` kit release comes from (from its signed
-- source path `kits/<kit>/skills/<dir>`), and `agentkit_links.kits` holds the paid kits the linked
-- account owns, a JSON array from the `agentkit_kits` claim of the last token SkillX's own grant
-- received. Every read path grants a package's private releases to a linked account whose kits
-- name the package's kit (app/lib/releases/kit-entitlement-sql.ts), next to `entitlements`. An
-- unlinked or revoked link (row deleted) grants nothing.
--
-- Strictly additive: two columns (NULL and '[]' grant nothing) and one index. The backfill only
-- sets `kit` on `@agentkit/*` packages that already have a kit release with a kit source path.
-- Code that predates this migration never reads them; the new code does, so apply this migration
-- before deploying it.
--
-- Rollback (take a D1 time-travel bookmark first; kit owners lose read access to private
-- `@agentkit/*` releases until it is reapplied). SQLite >= 3.35 drops columns in place:
--   DROP INDEX IF EXISTS idx_packages_kit;
--   ALTER TABLE `agentkit_links` DROP COLUMN `kits`;
--   ALTER TABLE `packages` DROP COLUMN `kit`;
--   DELETE FROM d1_migrations WHERE name = '0023_agentkit_kit_entitlements.sql';
ALTER TABLE `packages` ADD `kit` text;--> statement-breakpoint
CREATE INDEX `idx_packages_kit` ON `packages` (`kit`);--> statement-breakpoint
ALTER TABLE `agentkit_links` ADD `kits` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `packages` SET `kit` = (
  SELECT k FROM (
    SELECT sp, substr(sp, 6, instr(substr(sp, 6), '/') - 1) AS k FROM (
      SELECT json_extract(r.source_provenance, '$.path') AS sp
        FROM package_releases r
       WHERE r.package_id = packages.id AND r.manifest_schema_version = 'skillx.release/v2'
         AND r.source_provenance IS NOT NULL
       ORDER BY r.created_at DESC LIMIT 1))
   WHERE sp GLOB 'kits/?*/skills/?*' AND k GLOB '[a-z0-9]*' AND NOT k GLOB '*[^a-z0-9-]*'
     AND substr(sp, length(k) + 6, 8) = '/skills/' AND instr(substr(sp, length(k) + 14), '/') = 0)
 WHERE `name` LIKE '@agentkit/%';
