/**
 * `@skillx/contracts` — the framework-free SkillX domain contract surface.
 *
 * Routes, CLI commands, and MCP tools are adapters over these contracts. No
 * adapter may redefine a status, a reason code, or a payload decision.
 */

export * from "./validation";
export * from "./semver-range";
export * from "./verification-evidence";
export * from "./compatibility";
export * from "./package-manifest";
export * from "./canonical-json";
export * from "./release-manifest";
export * from "./release-provenance";
export * from "./release-status";
export * from "./strict-json";
export * from "./exec-capabilities";
export * from "./exec-manifest";
export * from "./exec-summary";
export * from "./collections";
export * from "./ingestion";
export * from "./dto";
export * from "./payload-access";
export * from "./fixtures";
export * from "./personal-kit";
