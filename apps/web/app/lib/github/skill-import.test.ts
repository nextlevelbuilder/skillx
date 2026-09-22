/**
 * Regression tests for the import confirmation contract.
 *
 * `skillx use owner/repo/skill` (three-part) and the root-skill fallback read
 * `res.skill` from `POST /api/skills/register` and print `skill.content` via
 * `displaySkill`. An earlier revision of this boundary work reduced the response
 * to `{ id, slug, name, author }`, which silently broke those CLI paths by
 * rendering `undefined` instead of the SKILL.md payload.
 *
 * These tests pin the consumer contract: a free/public listing MUST keep its
 * payload, and a protected listing must not have one echoed back.
 */

import { describe, expect, it } from "vitest";
import { importConfirmation } from "./skill-import";

const SKILL_MD = "# Review Guardrails\n\nFull SKILL.md payload.";

/** Every field `displaySkill` in the CLI reads. */
function freeRow() {
  return {
    id: "skill_1",
    slug: "zuey-review-guardrails",
    name: "Review Guardrails",
    author: "zuey",
    description: "Guardrails for code review",
    category: "code-review",
    is_paid: false,
    content: SKILL_MD,
    risk_label: "safe",
    source_url: "https://github.com/zuey/skills/tree/main/review-guardrails",
    install_command: "skillx use zuey-review-guardrails",
    avg_rating: 0,
  };
}

describe("import confirmation — the `skillx use` register contract", () => {
  it("keeps content for a free listing so the CLI can print the SKILL.md", async () => {
    const body = (await importConfirmation(freeRow(), true).json()) as {
      skill: Record<string, unknown> | null;
      created: boolean;
    };
    expect(body.created).toBe(true);
    expect(body.skill?.content).toBe(SKILL_MD);
  });

  it("keeps every field the CLI renders", async () => {
    const body = (await importConfirmation(freeRow(), false).json()) as {
      skill: Record<string, unknown> | null;
      created: boolean;
    };
    expect(body.created).toBe(false);
    for (const field of [
      "slug",
      "name",
      "description",
      "category",
      "avg_rating",
      "install_command",
      "risk_label",
      "source_url",
    ]) {
      expect(body.skill?.[field], `CLI reads skill.${field}`).toBeDefined();
    }
  });

  it("treats a null is_paid listing as public", async () => {
    const row = { ...freeRow(), is_paid: null };
    const body = (await importConfirmation(row, true).json()) as { skill: Record<string, unknown> | null };
    expect(body.skill?.content).toBe(SKILL_MD);
  });

  it("never echoes the payload for a protected listing", async () => {
    const row = { ...freeRow(), is_paid: true };
    const response = importConfirmation(row, true);
    const body = (await response.clone().json()) as { skill: Record<string, unknown> | null };
    expect(body.skill).not.toHaveProperty("content");
    // Still reports the write and the identity, just not the payload.
    expect(body.skill?.slug).toBe("zuey-review-guardrails");
    expect(await response.text()).not.toContain("Full SKILL.md payload.");
  });

  it("reports the write without a row when the post-insert re-fetch failed", async () => {
    const body = (await importConfirmation(undefined, true).json()) as {
      skill: Record<string, unknown> | null;
      created: boolean;
    };
    expect(body.skill).toBeNull();
    expect(body.created).toBe(true);
  });
});
