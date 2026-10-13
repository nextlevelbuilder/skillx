/**
 * Release API test harness: a migrated in-memory D1, an in-memory R2, the
 * public test-vector signing key (never a real secret), seeded publishers
 * and API keys, and an `upload` helper that drives the real ingest path.
 */
import { VECTOR_KEY_SEED_TEXT, vectorKey } from "../../../../packages/contracts/src/test-support/vector-key";
import { writeDeterministicTar } from "../../../../packages/cli/src/lib/deterministic-tar";
import type { TarFile } from "../../../../packages/cli/src/lib/deterministic-tar";
import { generateApiKey } from "~/lib/auth/api-key-utils";
import { releasePublishScope } from "~/lib/auth/api-key-scopes";
import { ingestRelease } from "~/lib/releases/ingest-release";
import type { IngestDeps } from "~/lib/releases/ingest-release";
import { FakeD1 } from "./fake-d1";
import { FakeR2 } from "./fake-r2";

export const TEST_KEY_ID = "skillx-test-vector-key";
export const NOW = new Date("2026-10-13T12:00:00Z");
const encoder = new TextEncoder();

export const file = (path: string, text: string | Uint8Array, mode: TarFile["mode"] = "100644"): TarFile => ({
  path,
  mode,
  bytes: typeof text === "string" ? encoder.encode(text) : text,
});

export const tarOf = (files: TarFile[]) => writeDeterministicTar(files);

export interface UploadOptions {
  key?: string | null;
  version?: string;
  metadata?: Record<string, unknown>;
  contentType?: string;
}

export async function createHarness() {
  const d1 = new FakeD1();
  const r2 = new FakeR2();
  const signingKey = await vectorKey(VECTOR_KEY_SEED_TEXT);
  d1.raw.exec(`
    INSERT INTO publishers (id, handle, display_name, owner_user_id, created_at, state) VALUES
      ('pub-alpha', 'alpha', 'Alpha', 'user-a', 1, 'active'),
      ('pub-beta', 'beta', 'Beta', 'user-b', 1, 'active'),
      ('pub-agentkit', 'agentkit', 'AgentKit kit content', 'user-a', 1, 'active'),
      ('pub-bestagentkits', 'bestagentkits', 'AgentKit foundation', 'user-a', 1, 'active'),
      ('pub-gone', 'gone', 'Suspended', 'user-a', 1, 'suspended');
  `);

  async function createKey(userId: string, scopes: string[] | null, revoked = false): Promise<string> {
    const { plaintext, hash, prefix } = await generateApiKey({ scoped: scopes !== null });
    d1.raw
      .prepare("INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, created_at, revoked_at, scopes) VALUES (?, ?, 'test', ?, ?, 1, ?, ?)")
      .run(`key-${hash.slice(0, 12)}`, userId, hash, prefix, revoked ? 2 : null, scopes === null ? null : JSON.stringify(scopes));
    return plaintext;
  }

  const alphaKey = await createKey("user-a", [releasePublishScope("alpha"), releasePublishScope("bestagentkits"), releasePublishScope("agentkit"), releasePublishScope("gone")]);
  const deps: IngestDeps = {
    db: d1.asD1(),
    bucket: r2.asR2(),
    loadSigner: async () => ({ keyId: TEST_KEY_ID, privateKey: signingKey.privateKey }),
    now: () => NOW,
  };

  function request(name: string, body: BodyInit | null, options: UploadOptions = {}): Request {
    const headers = new Headers({ "Content-Type": options.contentType ?? "application/x-tar" });
    const key = options.key === undefined ? alphaKey : options.key;
    if (key !== null) headers.set("Authorization", `Bearer ${key}`);
    const metadata = options.metadata ?? { version: options.version ?? "1.0.0" };
    headers.set("X-SkillX-Release", Buffer.from(JSON.stringify(metadata), "utf8").toString("base64"));
    // `duplex` lets Node accept a streamed body.
    const init = { method: "POST", headers, body, duplex: "half" } as RequestInit;
    return new Request(`https://skillx.test/api/v1/packages/${name}/releases`, init);
  }

  async function upload(name: string, body: Uint8Array | ReadableStream<Uint8Array>, options: UploadOptions = {}) {
    const [scope, slug] = name.split("/");
    const init = body instanceof ReadableStream ? body : (body as BodyInit);
    const req = request(name, init, options);
    const res = await ingestRelease(req, { scope, slug }, deps);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  }

  const releaseRows = () =>
    d1.raw
      .prepare(
        "SELECT p.name, r.version, r.release_state, r.release_digest, r.artifact_key, r.signed_manifest_key, r.file_count, r.tree_size FROM package_releases r JOIN packages p ON p.id = r.package_id ORDER BY p.name, r.version",
      )
      .all() as Array<Record<string, unknown>>;

  return { d1, r2, deps, signingKey, alphaKey, createKey, upload, request, releaseRows };
}
