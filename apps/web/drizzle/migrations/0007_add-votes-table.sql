-- votes table: Reddit-style upvote/downvote per skill
CREATE TABLE `votes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `skill_id` text NOT NULL,
  `vote_type` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_votes_user_skill` ON `votes` (`user_id`, `skill_id`);
--> statement-breakpoint
CREATE INDEX `idx_votes_skill` ON `votes` (`skill_id`);
--> statement-breakpoint

-- precomputed vote counts on skills
ALTER TABLE `skills` ADD COLUMN `upvote_count` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `skills` ADD COLUMN `downvote_count` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `skills` ADD COLUMN `net_votes` integer DEFAULT 0;
--> statement-breakpoint
CREATE INDEX `idx_skills_net_votes` ON `skills` (`net_votes`);
