-- Add scripts + fts_content columns to skills
ALTER TABLE skills ADD COLUMN scripts TEXT;
ALTER TABLE skills ADD COLUMN fts_content TEXT;

-- Create skill_references table
CREATE TABLE IF NOT EXISTS `skill_references` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `skill_id` TEXT NOT NULL REFERENCES `skills`(`id`) ON DELETE CASCADE,
  `title` TEXT NOT NULL,
  `filename` TEXT NOT NULL,
  `url` TEXT,
  `type` TEXT,
  `content` TEXT NOT NULL,
  `created_at` INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_skill_refs_skill` ON `skill_references`(`skill_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `idx_skill_refs_unique` ON `skill_references`(`skill_id`, `filename`);
