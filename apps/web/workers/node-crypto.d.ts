/**
 * The `node:crypto` surface `@skillx/skill-tree` uses for SHA-256 while it
 * reads release archives. The Worker provides it through `nodejs_compat`;
 * the Worker typecheck has no Node.js typings, so only this much is declared.
 */
declare module "node:crypto" {
  interface Hash {
    update(data: string | Uint8Array): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: "sha256"): Hash;
}
