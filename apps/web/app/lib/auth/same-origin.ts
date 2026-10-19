/**
 * Same-origin guard for cookie-authenticated mutations. The session cookie is
 * `SameSite=Lax`, which still lets a sibling subdomain send cookie-bearing
 * requests, so a mutating request must come from this origin.
 *
 * Browsers always send `Origin` on cross-origin POST/DELETE, so a differing
 * `Origin` is refused. Without `Origin`, a `Sec-Fetch-Site` of anything but
 * `same-origin`/`none` is refused. Requests carrying neither header are not
 * from a browser, so there is no ambient cookie to ride on and they pass.
 */
export function crossOriginRefusal(request: Request): Response | null {
  const origin = request.headers.get("Origin");
  if (origin !== null) {
    return origin === new URL(request.url).origin ? null : refusal();
  }
  const site = request.headers.get("Sec-Fetch-Site");
  return site === null || site === "same-origin" || site === "none" ? null : refusal();
}

const refusal = () => Response.json({ error: "Cross-origin request refused" }, { status: 403 });
