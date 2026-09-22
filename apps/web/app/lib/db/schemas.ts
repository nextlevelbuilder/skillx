/**
 * Runtime schema barrel for the drizzle client.
 *
 * Kept separate from `drizzle.config.ts` on purpose: the migration generator
 * lists schema files explicitly so that the hand-written `skill_references`
 * migration is not re-emitted. See docs/legacy-listing-migration-plan.md.
 */
export * from "./schema";
export * from "./skill-references-schema";
export * from "./registry-schema";
export * from "./entitlements-schema";
export * from "./collections-schema";
