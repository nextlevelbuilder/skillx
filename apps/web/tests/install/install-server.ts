/**
 * The installer's end-to-end server: the CLI registry client's `fetch` is
 * routed straight into the real route loaders (release read API, personal
 * kits, collections) over the in-memory D1/R2 of the kit harness. Machines
 * are temp directories that stand in for HOME/USERPROFILE, CODEX_HOME and
 * SKILLX_HOME; nothing reaches the real user profile.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInstallContext } from "../../../../packages/cli/src/lib/install/install-context";
import type { ContextOptions } from "../../../../packages/cli/src/lib/install/install-context";
import { createRegistry } from "../../../../packages/cli/src/lib/install/registry-client";
import { action as collectionsAction, loader as collectionsLoader } from "~/routes/api.v1.collections";
import { loader as kitsLoader } from "~/routes/api.v1.kits";
import { loader as releaseListLoader } from "~/routes/api.v1.package-releases";
import { loader as fileLoader } from "~/routes/api.v1.release-file";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { createKitHarness } from "../personal-kits/kit-harness";
import { FakeRateLimiter } from "../releases/fake-rate-limiter";
import { TEST_KEY_ID } from "../releases/release-harness";

type Loader = (args: never) => Promise<Response> | Response;

const ROUTES: Array<[RegExp, Loader, (m: RegExpExecArray) => Record<string, string>]> = [
  [/^\/api\/v1\/releases\/([^/]+)\/manifest$/, manifestLoader as Loader, (m) => ({ digest: m[1]! })],
  [/^\/api\/v1\/releases\/([^/]+)\/files\/(.+)$/, fileLoader as Loader, (m) => ({ digest: m[1]!, "*": m[2]! })],
  [/^\/api\/v1\/packages\/(@[^/]+)\/([^/]+)\/releases$/, releaseListLoader as Loader, (m) => ({ scope: m[1]!, slug: m[2]! })],
  [/^\/api\/v1\/kits\/(@[^/]+)\/([^/]+)(?:\/(.+))?$/, kitsLoader as Loader, (m) => ({ scope: m[1]!, name: m[2]!, ...(m[3] ? { "*": m[3] } : {}) })],
  [/^\/api\/v1\/collections(?:\/([^/]+))?(?:\/(.+))?$/, collectionsLoader as Loader, (m) => ({ ...(m[1] ? { id: m[1] } : {}), ...(m[2] ? { "*": m[2] } : {}) })],
];

export async function createInstallServer() {
  const k = await createKitHarness();
  const requests: string[] = [];
  /** Test hook to tamper with responses (e.g. flip a byte of a file). */
  let rewrite: ((path: string, res: Response) => Promise<Response>) | null = null;

  const serverFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    requests.push(`${url.pathname}${url.search}`);
    for (const [pattern, loader, params] of ROUTES) {
      const m = pattern.exec(url.pathname);
      if (!m) continue;
      const handler = request.method !== "GET" && loader === collectionsLoader ? (collectionsAction as Loader) : loader;
      const res = await handler({ request, params: params(m), context: { cloudflare: { env: envOf() } } } as never);
      return rewrite ? rewrite(url.pathname, res) : res;
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const envOf = () => ({
    SKILLX_RELEASES_API: "1",
    SKILLX_PERSONAL_KITS_API: "1",
    SKILLX_COLLECTIONS_API: "1",
    DB: k.h.deps.db,
    R2: k.h.deps.bucket,
    RELEASE_READ_LIMITER: new FakeRateLimiter(100_000),
    RELEASE_WRITE_LIMITER: new FakeRateLimiter(100_000),
  });

  const keys = new Map([[TEST_KEY_ID, k.h.signingKey.publicKey]]);
  const roots: string[] = [];

  /** A fresh machine: temp HOME/USERPROFILE with CODEX_HOME and SKILLX_HOME inside it. */
  function machine(name: string) {
    const root = mkdtempSync(join(tmpdir(), `skillx-${name}-`));
    roots.push(root);
    const env = { HOME: root, USERPROFILE: root, CODEX_HOME: join(root, ".codex"), SKILLX_HOME: join(root, ".skillx") };
    const context = (options: Partial<ContextOptions> = {}) =>
      createInstallContext({ registry: createRegistry({ baseUrl: "https://skillx.test", apiKey: k.ownerKey, fetch: serverFetch }), env, keys, ...options });
    return { root, env, context };
  }

  const cleanup = () => roots.forEach((r) => rmSync(r, { recursive: true, force: true }));
  const setRewrite = (fn: typeof rewrite) => {
    rewrite = fn;
  };
  return { k, keys, requests, serverFetch, machine, cleanup, setRewrite };
}
