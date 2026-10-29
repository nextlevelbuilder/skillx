import { afterEach, describe, expect, it, vi } from "vitest";
import { kitActionUrl, packageActionUrl, postOwnerAction, releaseStateUrl } from "~/components/dashboard/use-owner-action";

/** The dashboard's request helper reports success only for a 2xx JSON answer. */
afterEach(() => vi.unstubAllGlobals());

const respond = (response: Response | Error) => {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("postOwnerAction", () => {
  it("returns the data of a 2xx JSON answer and sends a same-origin JSON POST", async () => {
    const fetchMock = respond(Response.json({ visibility: "private" }));
    expect(await postOwnerAction("/api/v1/packages/@alpha/demo/visibility", { from: "public", to: "private" })).toEqual({ ok: true, data: { visibility: "private" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/packages/@alpha/demo/visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: '{"from":"public","to":"private"}',
    });
  });

  it("reports an API error with its message and code", async () => {
    respond(Response.json({ error: { code: "visibility_conflict", message: "@alpha/demo is no longer public" } }, { status: 409 }));
    expect(await postOwnerAction("/x", {})).toEqual({ ok: false, message: "@alpha/demo is no longer public (visibility_conflict)" });
  });

  it("never reports success for a non-JSON answer, a non-2xx answer or a network failure", async () => {
    respond(new Response("<html>", { status: 200 }));
    expect((await postOwnerAction("/x", {})).ok).toBe(false);
    respond(new Response("bad gateway", { status: 502 }));
    expect(await postOwnerAction("/x", {})).toEqual({ ok: false, message: "HTTP 502" });
    respond(new TypeError("offline"));
    expect(await postOwnerAction("/x", {})).toEqual({ ok: false, message: "Network error: the change was not applied." });
  });
});

describe("dashboard action URLs", () => {
  it("builds the management, state and kit URLs", () => {
    expect(packageActionUrl("@alpha/demo", "delete")).toBe("/api/v1/packages/@alpha/demo/delete");
    expect(releaseStateUrl("@alpha/demo", "1.0.0-beta.1")).toBe("/api/v1/packages/@alpha/demo/releases/1.0.0-beta.1/state");
    expect(kitActionUrl("@alpha/my-kit", "restore")).toBe("/api/v1/kits/@alpha/my-kit/restore");
  });
});
