/**
 * Kit provenance of `skillx.release/v2` manifests.
 *
 * `skillx.release/v1` has no provider member: every v1 release is provider
 * `skillx`, so `@agentkit/*` is always reserved there. v2 adds the required,
 * closed `provenance` member: `{"provider": "skillx"}` or `{"provider":
 * "kit", "origin": "remote-signed" | "local-dev"}`. The identity must pair
 * with the provider (`@agentkit/*` only with `kit`, every other publisher only
 * with `skillx`), and a `skillx` slug must not use the `ak-` alias prefix.
 *
 * `origin` records where the kit content came from; it is a claim the
 * registry countersigns, not a kit signature. A SkillX signature never makes
 * a kit release `signed-kit`: `releaseTrust` grants that only when the caller
 * verified the AgentKit kit signature itself.
 */

import { KIT_ORIGINS, trustOf } from "@skillx/skill-tree/rules";
import type { KitOrigin, Trust } from "@skillx/skill-tree/rules";
import { isPlainObject, issue } from "./validation";
import type { ValidationIssue } from "./validation";

export { KIT_ORIGINS } from "@skillx/skill-tree/rules";
export type { KitOrigin } from "@skillx/skill-tree/rules";

/** Source providers a `skillx.release/v2` manifest may name. */
export const RELEASE_PROVIDERS = ["skillx", "kit"] as const;
export type ReleaseProvider = (typeof RELEASE_PROVIDERS)[number];

export type ReleaseProvenance = { provider: "skillx" } | { provider: "kit"; origin: KitOrigin };

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/**
 * Validates the v2 `provenance` member and returns its provider, or null
 * when the provider itself is invalid (the identity pairing is then not
 * checked). `checkFields` reports unknown and missing members with the
 * manifest schema in the message.
 */
export function validateReleaseProvenance(
  value: unknown,
  issues: ValidationIssue[],
  checkFields: (value: Record<string, unknown>, allowed: readonly string[], path: string) => void,
): ReleaseProvider | null {
  if (!isPlainObject(value)) {
    issues.push(issue("provenance", "type", "must be an object"));
    return null;
  }
  if (!oneOf(RELEASE_PROVIDERS, value.provider)) {
    checkFields(value, ["provider"], "provenance");
    issues.push(issue("provenance.provider", "unsupported_value", `must be one of: ${RELEASE_PROVIDERS.join(", ")}`));
    return null;
  }
  if (value.provider === "skillx") {
    checkFields(value, ["provider"], "provenance");
    return "skillx";
  }
  checkFields(value, ["provider", "origin"], "provenance");
  if ("origin" in value && !oneOf(KIT_ORIGINS, value.origin)) {
    issues.push(issue("provenance.origin", "unsupported_value", `must be one of: ${KIT_ORIGINS.join(", ")}`));
  }
  return "kit";
}

/** The provenance of a valid manifest; a v1 manifest is always provider `skillx`. */
export function releaseProvenanceOf(manifest: { provenance?: ReleaseProvenance }): ReleaseProvenance {
  return manifest.provenance ?? { provider: "skillx" };
}

export interface ReleaseTrustOptions {
  /**
   * True only when the caller verified the AgentKit kit signature of this
   * exact tree. The SkillX registry signature never counts.
   */
  kitSignatureVerified?: boolean;
}

/**
 * Lifecycle trust of a verified release manifest. A `skillx` release is
 * always `local-unverified` (a registry signature is not a publisher
 * signature). A `kit` release is `signed-kit` only when its origin is
 * `remote-signed` and `kitSignatureVerified` is true; otherwise it is
 * `local-unverified`, as for a `local-dev` kit.
 */
export function releaseTrust(
  manifest: { identity: string; provenance?: ReleaseProvenance },
  options: ReleaseTrustOptions = {},
): Trust {
  const provenance = releaseProvenanceOf(manifest);
  if (provenance.provider === "skillx") return trustOf(manifest.identity, { provider: "skillx", verified: true });
  const signed = provenance.origin === "remote-signed" && options.kitSignatureVerified === true;
  return trustOf(manifest.identity, { provider: "kit", origin: signed ? "remote-signed" : "local-dev" });
}
