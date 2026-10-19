import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCreateKeyRequest, describeKeyAccess, describeScope, toggleScopeHandle } from "~/lib/auth/api-key-form";
import { ApiKeyCreateDialog, ApiKeyRevealDialog } from "./api-key-create-dialog";
import { ApiKeysTable } from "./api-keys-table";

const noop = () => {};

describe("key form helpers", () => {
  it("defaults to an account key with no scopes field", () => {
    expect(buildCreateKeyRequest("  CLI  ", [])).toEqual({ name: "CLI" });
  });

  it("builds sorted, de-duplicated release publishing scopes from selected handles", () => {
    expect(buildCreateKeyRequest("CI", ["beta", "alpha", "beta"])).toEqual({
      name: "CI",
      scopes: ["releases:publish:@alpha", "releases:publish:@beta"],
    });
  });

  it("toggles a handle and never selects more than 8", () => {
    expect(toggleScopeHandle([], "a")).toEqual(["a"]);
    expect(toggleScopeHandle(["a", "b"], "a")).toEqual(["b"]);
    const eight = Array.from({ length: 8 }, (_, i) => `p${i}`);
    expect(toggleScopeHandle(eight, "extra")).toEqual(eight);
    expect(toggleScopeHandle(eight, "p0")).toHaveLength(7);
  });

  it("labels scopes and key access", () => {
    expect(describeScope("releases:publish:@alpha")).toBe("Publish releases for @alpha");
    expect(describeScope("future:scope")).toBe("future:scope");
    expect(describeKeyAccess(null)).toContain("Cannot publish releases");
    expect(describeKeyAccess(["releases:publish:@alpha"])).toContain("can only publish releases for @alpha");
  });
});

describe("ApiKeyCreateDialog", () => {
  const publishers = [
    { handle: "alpha", display_name: "Alpha" },
    { handle: "beta", display_name: "Beta" },
  ];

  it("lists owned publishers as unchecked scope options, defaulting to an account key", () => {
    const html = renderToStaticMarkup(createElement(ApiKeyCreateDialog, { publishers, onSubmit: noop, onCancel: noop }));
    expect(html).toContain("Release publishing (optional)");
    expect(html).toContain("releases:publish:@alpha");
    expect(html).toContain("releases:publish:@beta");
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).not.toMatch(/checked=""/);
    expect(html).toContain("Account key:");
  });

  it("shows a server error and disables Generate while a request is in flight", () => {
    const html = renderToStaticMarkup(
      createElement(ApiKeyCreateDialog, { publishers, onSubmit: noop, onCancel: noop, submitting: true, error: "You do not own an active publisher @gone" }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("You do not own an active publisher @gone");
    expect(html).toContain("Generating…");
    expect(html).toMatch(/<button type="submit" disabled=""/);
  });

  it("explains the account-key fallback when the user owns no publisher", () => {
    const html = renderToStaticMarkup(createElement(ApiKeyCreateDialog, { publishers: [], onSubmit: noop, onCancel: noop }));
    expect(html).toContain("You do not own an active publisher");
    expect(html).not.toContain('type="checkbox"');
  });
});

describe("ApiKeyRevealDialog", () => {
  it("shows the key once with its access", () => {
    const html = renderToStaticMarkup(
      createElement(ApiKeyRevealDialog, { plaintext: "sx_example", scopes: ["releases:publish:@alpha"], onClose: noop }),
    );
    expect(html).toContain("sx_example");
    expect(html).toContain("It will not be shown again");
    expect(html).toContain("@alpha");
  });
});

describe("ApiKeysTable", () => {
  it("shows each key's scopes and a revoke action, never a full key", () => {
    const html = renderToStaticMarkup(
      createElement(ApiKeysTable, {
        onRevoke: noop,
        keys: [
          { id: "k1", name: "CLI", key_masked: "sx_abcde...", created_at: new Date("2026-10-14T00:00:00Z"), scopes: null },
          { id: "k2", name: "CI", key_masked: "sx_fghij...", created_at: new Date("2026-10-14T00:00:00Z"), scopes: ["releases:publish:@alpha"] },
        ],
      }),
    );
    expect(html).toContain("Account key");
    expect(html).toContain("Publish releases for @alpha");
    expect(html).toContain('title="releases:publish:@alpha"');
    expect(html).toContain("sx_abcde...");
    expect(html).toContain('aria-label="Revoke CI"');
    expect(html).toContain("Oct 14, 2026");
  });

  it("labels a key whose stored scopes parse to an empty list as having no access", () => {
    const html = renderToStaticMarkup(
      createElement(ApiKeysTable, {
        onRevoke: noop,
        keys: [{ id: "k3", name: "Odd", key_masked: "sx_zzzzz...", created_at: new Date("2026-10-14T00:00:00Z"), scopes: [] }],
      }),
    );
    expect(html).toContain("No access");
    expect(html).not.toContain("Account key");
  });

  it("renders an empty state", () => {
    const html = renderToStaticMarkup(createElement(ApiKeysTable, { keys: [], onRevoke: noop }));
    expect(html).toContain("No API keys yet");
  });
});
