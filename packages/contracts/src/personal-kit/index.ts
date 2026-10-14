/** Personal kits: overlays, exact patches, three-way rebase, revision documents and locks. */
export * from "./codes";
export { decodeBase64, encodeBase64, sha256Hex, textOf } from "./bytes";
export * from "./overlay-envelope";
export { applyPatch, formatPatch } from "./unified-patch";
export { mergeThreeWay } from "./three-way-merge";
export type { MergeConflictHunk, MergeResult } from "./three-way-merge";
export * from "./kit-tree";
export { applyOverlay, compositionDigest } from "./apply-overlay";
export { relativeLinks, treeFacts } from "./frontmatter-facts";
export type { TreeFacts } from "./frontmatter-facts";
export { overlayBetween, rebaseOverlay } from "./rebase";
export type { RebaseFinding, RebaseResult } from "./rebase";
export * from "./kit-document";
export * from "./kit-lock";