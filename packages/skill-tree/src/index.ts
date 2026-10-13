/**
 * `@skillx/skill-tree`: the TypeScript implementation of AgentKit's
 * `agentkit.skill-tree/v1` canonical tree digest, its tar and zip readers,
 * package identity and alias rules, and frontmatter exposure. It must agree
 * with the AgentKit conformance vectors vendored in `fixtures/vectors`.
 */
export { ERROR_CODES, SkillTreeError, isSkillTreeError } from "./errors";
export type { SkillTreeErrorCode } from "./errors";

export {
  MODE_EXECUTABLE,
  MODE_REGULAR,
  MODE_SOURCE_ASSUMED,
  MODE_SOURCE_RECORDED,
  TREE_SCHEMA,
  compareUtf8,
  serializeTree,
  treeDigest,
} from "./serialize";
export type { FileMode, ModeSource, TreeFile, TreeManifest } from "./serialize";

export { LIMITS, buildTree, headerMode } from "./tree";
export type { BuildOptions, EntryKind, TreeEntry } from "./tree";

export { isNoisePath, validatePath } from "./path-rules";
export { foldKey } from "./collision";
export { UNICODE_VERSION } from "./unicode-15";

export type { ByteSource } from "./byte-source";
export { readTarTree, tarEntryKind } from "./tar-reader";
export type { TarReadOptions } from "./tar-reader";
export { readZipTree } from "./zip-reader";
export type { ZipReadOptions } from "./zip-reader";
export type { RandomAccessSource } from "./zip-records";

export {
  IDENTITY_PATTERN,
  RESERVED_PUBLISHER,
  checkAlias,
  checkDirectoryAlias,
  checkPublisher,
  directoryAliasKey,
  kitIdentity,
  trustOf,
  validateIdentity,
} from "./identity";
export type { KitOrigin, Provenance, Provider, Trust } from "./identity";

export { frontmatterExposure, skillFileExposure } from "./exposure";
export type { Exposure, ExposureResult } from "./exposure";
