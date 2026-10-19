import { beforeEach, describe, expect, it } from "vitest";
import { IDEMPOTENCY_TTL_MS, publishRelease } from "~/lib/releases/release-idempotency";
import { NOW, createHarness, file, tarOf } from "./release-harness";
import type { UploadOptions } from "./release-harness";

type Harness = Awaited<ReturnType<typeof createHarness>>;
let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

const skill = (body = "# Demo\n") => tarOf([file("SKILL.md", `---\nname: demo\ndescription: Demo\n---\n${body}`)]);

async function send(key: string | null, bytes: Uint8Array, options: UploadOptions = {}, now = NOW) {
  const req = h.request("@alpha/demo", bytes as BodyInit, options);
  if (key !== null) req.headers.set("Idempotency-Key", key);
  const res = await publishRelease(req, { scope: "@alpha", slug: "demo" }, { ...h.deps, now: () => now });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

const rows = () => h.d1.raw.prepare("SELECT idempotency_key, status, response_status FROM release_publish_idempotency").all() as Array<Record<string, unknown>>;

describe("release publish Idempotency-Key", () => {
  it("replays the exact stored answer for the same key and request", async () => {
    const first = await send("run-1", skill());
    expect(first.status).toBe(200);
    expect(JSON.parse(first.text).created).toBe(true);
    const again = await send("run-1", skill());
    expect(again.status).toBe(200);
    expect(again.text).toBe(first.text);
    expect(again.headers.get("Idempotent-Replayed")).toBe("true");
    expect(h.releaseRows()).toHaveLength(1);
    expect(rows()).toEqual([{ idempotency_key: "run-1", status: "complete", response_status: 200 }]);
  });

  it("refuses the same key with another body or other metadata (422) and writes nothing", async () => {
    await send("run-1", skill());
    const otherBody = await send("run-1", skill("# Changed\n"));
    expect(otherBody.status).toBe(422);
    expect(JSON.parse(otherBody.text).error.code).toBe("idempotency.key_reused");
    const otherVersion = await send("run-1", skill(), { version: "1.0.1" });
    expect(otherVersion.status).toBe(422);
    expect(h.releaseRows()).toHaveLength(1);
  });

  it("answers 409 while the first request with the key is still pending", async () => {
    await send("run-1", skill());
    h.d1.raw.prepare("UPDATE release_publish_idempotency SET status = 'pending', response_status = NULL, response_body = NULL, created_at = ?").run(NOW.getTime());
    const res = await send("run-1", skill());
    expect(res.status).toBe(409);
    expect(JSON.parse(res.text).error.code).toBe("idempotency.in_progress");
  });

  it("lets the same request take over a stale pending claim, and any request reuse an expired key", async () => {
    await send("run-1", skill());
    h.d1.raw.prepare("UPDATE release_publish_idempotency SET status = 'pending', created_at = ?").run(NOW.getTime() - 6 * 60_000);
    const takeover = await send("run-1", skill());
    expect(takeover.status).toBe(200);
    expect(JSON.parse(takeover.text).created).toBe(false);
    const later = new Date(NOW.getTime() + IDEMPOTENCY_TTL_MS + 1);
    const reused = await send("run-1", skill("# Next\n"), { version: "1.1.0" }, later);
    expect(reused.status).toBe(200);
    expect(JSON.parse(reused.text).version).toBe("1.1.0");
  });

  it("stores deterministic 4xx answers, but never claims a key for a rejected credential", async () => {
    const conflict = await send("v-reuse", skill("# A\n"));
    expect(conflict.status).toBe(200);
    const clash = await send("v-clash", skill("# B\n"));
    expect(clash.status).toBe(409);
    expect((await send("v-clash", skill("# B\n"))).text).toBe(clash.text);
    const noAuth = await send("v-anon", skill(), { key: null });
    expect(noAuth.status).toBe(401);
    expect(rows().map((r) => r.idempotency_key)).not.toContain("v-anon");
  });

  it("rejects a malformed key (400) and keeps the keys of two publishers apart", async () => {
    const bad = await send("has space", skill());
    expect(bad.status).toBe(400);
    expect(JSON.parse(bad.text).error.code).toBe("idempotency.invalid_key");
    expect((await send(null, skill())).status).toBe(200);
    const req = h.request("@bestagentkits/demo", skill() as BodyInit);
    req.headers.set("Idempotency-Key", "run-1");
    await send("run-1", skill());
    const res = await publishRelease(req, { scope: "@bestagentkits", slug: "demo" }, h.deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Idempotent-Replayed")).toBeNull();
  });
});
