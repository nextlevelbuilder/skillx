import { describe, expect, it } from "vitest";
import { RELEASE_MANIFEST_FIXTURE } from "./fixtures/release-fixtures";
import {
  RELEASE_MANIFEST_V2_KIT_FIXTURE,
  RELEASE_MANIFEST_V2_LOCAL_KIT_FIXTURE,
  RELEASE_MANIFEST_V2_SKILLX_FIXTURE,
} from "./fixtures/release-v2-fixtures";
import { releaseProvenanceOf, releaseTrust } from "./release-provenance";

describe("releaseTrust", () => {
  const kit = RELEASE_MANIFEST_V2_KIT_FIXTURE;

  it("grants signed-kit only for a remote-signed kit release whose own tree had its kit signature verified", () => {
    expect(releaseTrust(kit)).toBe("local-unverified");
    expect(releaseTrust(kit, { kitVerifiedReleaseDigest: kit.releaseDigest })).toBe("signed-kit");
    expect(releaseTrust(kit, { kitVerifiedReleaseDigest: RELEASE_MANIFEST_V2_LOCAL_KIT_FIXTURE.releaseDigest })).toBe("local-unverified");
  });

  it("never grants signed-kit to a local-dev kit, a skillx v2 or a v1 release", () => {
    for (const manifest of [RELEASE_MANIFEST_V2_LOCAL_KIT_FIXTURE, RELEASE_MANIFEST_V2_SKILLX_FIXTURE, RELEASE_MANIFEST_FIXTURE]) {
      expect(releaseTrust(manifest, { kitVerifiedReleaseDigest: manifest.releaseDigest })).toBe("local-unverified");
    }
  });

  it("reads a v1 manifest as provider skillx", () => {
    expect(releaseProvenanceOf(RELEASE_MANIFEST_FIXTURE)).toEqual({ provider: "skillx" });
    expect(releaseProvenanceOf(kit)).toEqual({ provider: "kit", origin: "remote-signed" });
  });
});
