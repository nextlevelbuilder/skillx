/**
 * `get_kit` must hide exactly what the personal kit API hides: a stranger sees
 * a kit only when it is public and its effective revision was authored public,
 * reviewed and activated; everything else looks like a kit that does not exist.
 * The owner reads their own kit whatever its visibility.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ kit: null as Record<string, unknown> | null, revision: null as Record<string, unknown> | null }));

vi.mock("~/lib/personal-kits/kit-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/personal-kits/kit-store")>();
  return {
    ...actual,
    findKit: async () => h.kit,
    getRevision: async () => h.revision,
  };
});

import { callTool } from "./tools";

const ENV = { SKILLX_PERSONAL_KITS_API: "1", DB: {} } as never;
const OWNER = "user_owner";

function kitRow(visibility: string, effective: string | null = "rev_1") {
  return {
    id: "kit_1",
    name: "@alpha/kit",
    publisher_id: "pub_1",
    owner_user_id: OWNER,
    local_id: "local-1",
    visibility,
    generation: 3,
    effective_revision_id: effective,
    latest_revision_number: 1,
    created_at: 0,
    updated_at: 0,
  };
}

function revisionRow(state: string, docVisibility: string, activated = true) {
  return {
    id: "rev_1",
    kit_id: "kit_1",
    revision_number: 1,
    parent_revision_id: null,
    revision_digest: "sha256:abc",
    document_json: JSON.stringify({ schema: "skillx.personal-kit/v1", kit: "@alpha/kit", visibility: docVisibility, skills: [] }),
    state,
    origin: "manual",
    author_user_id: OWNER,
    idempotency_key: "k",
    approval_json: null,
    created_at: 0,
    reviewed_at: 0,
    activated_at: activated ? 0 : null,
    rejected_at: null,
    quarantined_at: null,
  };
}

async function getKit(userId: string | null, env = ENV, kit: unknown = "@alpha/kit") {
  const result = await callTool("get_kit", { kit }, { env, userId });
  return { isError: result.isError === true, body: JSON.parse(result.content[0].text) as Record<string, any> };
}

beforeEach(() => {
  h.kit = null;
  h.revision = null;
});

describe("get_kit", () => {
  it("fails with feature_disabled while personal kits are off", async () => {
    const { isError, body } = await getKit(null, { DB: {} } as never);
    expect(isError).toBe(true);
    expect(body.details.code).toBe("feature_disabled");
  });

  it("rejects a malformed kit name as invalid arguments", async () => {
    const { isError, body } = await getKit(null, ENV, "not a kit");
    expect(isError).toBe(true);
    expect(body.details.code).toBe("invalid_arguments");
  });

  it("returns a public, activated kit to anyone, with its document but without owner bookkeeping", async () => {
    h.kit = kitRow("public");
    h.revision = revisionRow("reviewed", "public");
    const { body } = await getKit(null);
    expect(body).toMatchObject({ found: true, viewer: "public", kit: { kit: "@alpha/kit", visibility: "public" } });
    expect(body.kit).not.toHaveProperty("localId");
    expect(body.effectiveRevision.document.visibility).toBe("public");
  });

  it.each([
    ["an unknown kit", null, null],
    ["a private kit", kitRow("private"), revisionRow("reviewed", "private")],
    ["a public kit with no effective revision", kitRow("public", null), null],
    ["a public kit whose revision was authored private", kitRow("public"), revisionRow("reviewed", "private")],
    ["a public kit whose revision is not reviewed", kitRow("public"), revisionRow("draft", "public")],
    ["a public kit whose revision was never activated", kitRow("public"), revisionRow("reviewed", "public", false)],
  ])("answers not_found to a stranger for %s", async (_label, kit, revision) => {
    h.kit = kit;
    h.revision = revision;
    const { isError, body } = await getKit("someone_else");
    expect(isError).toBe(false);
    expect(body).toEqual({ found: false, code: "not_found", kit: "@alpha/kit" });
  });

  it("lets the owner read their own private kit", async () => {
    h.kit = kitRow("private");
    h.revision = revisionRow("reviewed", "private");
    const { body } = await getKit(OWNER);
    expect(body).toMatchObject({ found: true, viewer: "owner", kit: { visibility: "private", localId: "local-1", generation: 3 } });
    expect(body.effectiveRevision.digest).toBe("sha256:abc");
  });
});
