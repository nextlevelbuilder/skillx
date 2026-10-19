-- Release publishing: idempotency keys, operator review, GitHub OIDC trusted publishing (issues #34, #54)
--
-- Strictly additive: four new tables, their indexes and two triggers. No existing table or row
-- changes. Numbered 0018 because the drizzle journal already holds 18 entries (0010_greedy_famine
-- was journaled last, with snapshot 0017).
--
-- - release_publish_idempotency: one row per (publisher, Idempotency-Key) of a release upload.
-- - release_reviews: operator approve/reject decisions on quarantined releases; append-only.
-- - trusted_publishers: repository + workflow (+ ref, environment) allowed to exchange a GitHub
--   Actions OIDC token for a short-lived releases:publish:@handle token.
-- - oidc_token_exchanges: one row per accepted exchange; its jti primary key refuses replays.
--
-- Rollback (take a D1 time-travel bookmark first; review and exchange history is lost). The last
-- statement removes the wrangler bookkeeping row, so a later `migrations apply` re-applies 0018:
--   DROP TRIGGER IF EXISTS release_reviews_no_delete;
--   DROP TRIGGER IF EXISTS release_reviews_no_update;
--   DROP INDEX IF EXISTS idx_trusted_publishers_publisher;
--   DROP TABLE IF EXISTS trusted_publishers;
--   DROP INDEX IF EXISTS idx_release_reviews_release;
--   DROP TABLE IF EXISTS release_reviews;
--   DROP TABLE IF EXISTS release_publish_idempotency;
--   DROP INDEX IF EXISTS idx_oidc_token_exchanges_trusted;
--   DROP TABLE IF EXISTS oidc_token_exchanges;
--   DELETE FROM d1_migrations WHERE name = '0018_registry_publishing.sql';
CREATE TABLE `oidc_token_exchanges` (
	`jti` text PRIMARY KEY NOT NULL,
	`trusted_publisher_id` text NOT NULL,
	`publisher_id` text NOT NULL,
	`repository` text NOT NULL,
	`workflow_ref` text NOT NULL,
	`run_id` text,
	`created_at` integer NOT NULL,
	`token_expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_oidc_token_exchanges_trusted` ON `oidc_token_exchanges` (`trusted_publisher_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `release_publish_idempotency` (
	`publisher_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`response_status` integer,
	`response_body` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`publisher_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `release_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`release_digest` text,
	`decision` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_id` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_release_reviews_release` ON `release_reviews` (`release_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `trusted_publishers` (
	`id` text PRIMARY KEY NOT NULL,
	`publisher_id` text NOT NULL,
	`provider` text NOT NULL,
	`repository` text NOT NULL,
	`repository_id` text NOT NULL,
	`workflow_path` text NOT NULL,
	`ref` text,
	`environment` text,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_trusted_publishers_publisher` ON `trusted_publishers` (`publisher_id`);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS release_reviews_no_update BEFORE UPDATE ON release_reviews BEGIN
  SELECT RAISE(ABORT, 'release_reviews is append-only');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS release_reviews_no_delete BEFORE DELETE ON release_reviews BEGIN
  SELECT RAISE(ABORT, 'release_reviews is append-only');
END;