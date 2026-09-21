import { describe, expect, it } from "vitest";
import {
  COLLECTION_VISIBILITIES,
  ENTITLEMENT_SOURCES,
  entitlementGrantsAccess,
  isRevisionImmutable,
  validateCollectionMember,
  validateEntitlement,
} from "./collections";
import type { CollectionRevision, Entitlement } from "./collections";
import { INGESTION_MODES, isIngestionMode, isPublishableState, validateListingImport, validateReleasePublish } from "./ingestion";
import { PAYLOAD_DENIAL_REASONS, decidePayloadAccess } from "./payload-access";
import { FIXTURE_DIGEST } from "./fixtures";
import { ENTITLEMENT_FIXTURES } from "./fixtures";

const PURCHASE_ENTITLEMENT: Entitlement = {
  id: "ent_1",
  subjectId: "user_1",
  packageName: "@zuey/work",
  source: "purchase",
  orderId: "order_1",
  grantedAt: "2026-09-15T10:00:00.000Z",
};

const BASE_REVISION: CollectionRevision = {
  id: "rev_1",
  collectionId: "col_1",
  revisionNumber: 1,
  members: [{ packageName: "@zuey/work", version: "1.2.3", digest: FIXTURE_DIGEST }],
  config: { targetHarness: "claude-code", scope: "project" },
  createdAt: "2026-09-15T10:00:00.000Z",
};

describe("collection, offer and entitlement contracts", () => {
  it("closes the visibility and source vocabularies", () => {
    expect([...COLLECTION_VISIBILITIES]).toEqual(["private", "unlisted", "public"]);
    expect([...ENTITLEMENT_SOURCES]).toEqual(["purchase", "grant", "import"]);
  });

  it("treats every collection revision as immutable", () => {
    expect(isRevisionImmutable(BASE_REVISION)).toBe(true);
  });

  it("allows non-secret configuration keys", () => {
    expect(validateCollectionMember({ packageName: "@zuey/work", version: "1.2.3" }).valid).toBe(true);
    expect(Object.keys(BASE_REVISION.config)).toEqual(["targetHarness", "scope"]);
  });

  it("requires an order only for purchased entitlements", () => {
    expect(validateEntitlement(PURCHASE_ENTITLEMENT).valid).toBe(true);
    expect(validateEntitlement({ ...PURCHASE_ENTITLEMENT, orderId: undefined }).valid).toBe(false);
    expect(validateEntitlement({ ...PURCHASE_ENTITLEMENT, source: "grant", orderId: undefined }).valid).toBe(true);
  });

  it("never treats an install record or empty entitlement as access", () => {
    expect(entitlementGrantsAccess(null, { packageName: "@zuey/work" })).toBe(false);
    expect(entitlementGrantsAccess(undefined, { packageName: "@zuey/work" })).toBe(false);
  });

  it("scopes entitlement access to the package and optional release", () => {
    expect(entitlementGrantsAccess(PURCHASE_ENTITLEMENT, { packageName: "@zuey/work" })).toBe(true);
    expect(entitlementGrantsAccess(PURCHASE_ENTITLEMENT, { packageName: "@other/pkg" })).toBe(false);
    const pinned: Entitlement = { ...PURCHASE_ENTITLEMENT, releaseId: "rel_2" };
    expect(entitlementGrantsAccess(pinned, { packageName: "@zuey/work", releaseId: "rel_1" })).toBe(false);
    expect(entitlementGrantsAccess(pinned, { packageName: "@zuey/work", releaseId: "rel_2" })).toBe(true);
  });

  it("revoked entitlements grant nothing", () => {
    expect(entitlementGrantsAccess({ ...PURCHASE_ENTITLEMENT, revokedAt: "2026-09-16T00:00:00.000Z" }, { packageName: "@zuey/work" })).toBe(false);
  });

  it("validates the shared entitlement fixtures", () => {
    for (const fixture of ENTITLEMENT_FIXTURES) {
      expect(validateEntitlement(fixture.value).valid, fixture.name).toBe(fixture.expectedValid);
    }
  });
});

describe("import versus publish", () => {
  it("closes the ingestion vocabulary to import and publish", () => {
    expect([...INGESTION_MODES]).toEqual(["import", "publish"]);
    expect(isIngestionMode("import")).toBe(true);
    expect(isIngestionMode("register")).toBe(false);
  });

  it("imports carry a remote source and never a digest requirement", () => {
    expect(validateListingImport({ mode: "import", sourceUrl: "https://github.com/o/r/tree/main/s", fetchedAt: "2026-09-15T10:00:00.000Z" }).valid).toBe(true);
    expect(validateListingImport({ mode: "import", fetchedAt: "2026-09-15T10:00:00.000Z" }).valid).toBe(false);
  });

  it("publishes always carry an immutable digest", () => {
    const publish = {
      mode: "publish",
      packageName: "@agentkit/engineer",
      version: "1.2.3",
      kind: "skill",
      channel: "beta",
      releaseState: "quarantined",
      releaseDigest: FIXTURE_DIGEST,
      artifactSize: 2048,
    };
    expect(validateReleasePublish(publish).valid).toBe(true);
    expect(validateReleasePublish({ ...publish, releaseDigest: undefined }).valid).toBe(false);
    expect(validateReleasePublish({ ...publish, version: "1.2" }).valid).toBe(false);
  });

  it("only draft and quarantined releases are publishable outputs", () => {
    expect(isPublishableState("draft")).toBe(true);
    expect(isPublishableState("quarantined")).toBe(true);
    expect(isPublishableState("published")).toBe(false);
    expect(isPublishableState("yanked")).toBe(false);
  });
});

describe("protected payload access decisions", () => {
  it("grants public unprotected listings to anonymous viewers", () => {
    const decision = decidePayloadAccess({ slug: "free-skill", isProtected: false }, {}, () => "SKILL.md body");
    expect(decision.granted).toBe(true);
    if (decision.granted) expect(decision.payload).toBe("SKILL.md body");
  });

  it("denies protected listings without an entitlement", () => {
    const decision = decidePayloadAccess({ slug: "paid-skill", isProtected: true }, {}, () => "secret");
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.reason).toBe("entitlement_required");
  });

  it("grants protected listings when an entitlement was resolved", () => {
    const decision = decidePayloadAccess({ slug: "paid-skill", isProtected: true }, { userId: "user_1", hasEntitlement: true }, () => "secret");
    expect(decision.granted).toBe(true);
  });

  it("denies yanked and unpublished listings even for entitled viewers", () => {
    const yanked = decidePayloadAccess({ slug: "gone", isProtected: false, state: "yanked" }, { hasEntitlement: true }, () => "body");
    expect(yanked.granted).toBe(false);
    if (!yanked.granted) expect(yanked.reason).toBe("listing_yanked");

    const draft = decidePayloadAccess({ slug: "new", isProtected: false, state: "quarantined" }, { hasEntitlement: true }, () => "body");
    expect(draft.granted).toBe(false);
    if (!draft.granted) expect(draft.reason).toBe("listing_not_published");
  });

  it("never calls the payload loader when access is denied", () => {
    let loaded = false;
    decidePayloadAccess({ slug: "paid-skill", isProtected: true }, {}, () => {
      loaded = true;
      return "secret";
    });
    expect(loaded).toBe(false);
  });

  it("exposes a closed set of denial reasons", () => {
    expect([...PAYLOAD_DENIAL_REASONS]).toEqual(["entitlement_required", "listing_not_published", "listing_yanked"]);
  });
});
