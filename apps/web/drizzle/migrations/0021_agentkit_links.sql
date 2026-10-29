-- AgentKit account links (Link with AgentKit, issue #81).
--
-- Strictly additive: one new table, no existing row is read or changed. Code that predates
-- this migration never touches it, and the identity code is off unless
-- SKILLX_AGENTKIT_IDENTITY is "1", so either deploy order works.
--
-- Rollback (take a D1 time-travel bookmark first; links are lost and users link again):
--   DROP TABLE `agentkit_links`;
--   DELETE FROM d1_migrations WHERE name = '0021_agentkit_links.sql';
CREATE TABLE `agentkit_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`agentkit_sub` text NOT NULL,
	`scopes` text NOT NULL,
	`refresh_token_enc` text,
	`linked_at` integer NOT NULL,
	`validated_at` integer NOT NULL,
	`refreshing_until` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agentkit_links_subject` ON `agentkit_links` (`issuer`,`agentkit_sub`);