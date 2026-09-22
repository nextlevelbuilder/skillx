/**
 * Query parameters of an incoming request.
 *
 * Request URLs are absolute in the Workers runtime, so this normally cannot fail. A synthetic or
 * otherwise malformed `Request` would make `new URL()` throw, though, and failing a whole search
 * handler over unparsable query parameters is worse than treating the request as unfiltered.
 */
export function requestSearchParams(request: Request): URLSearchParams {
  try {
    return new URL(request.url).searchParams;
  } catch {
    return new URLSearchParams();
  }
}
