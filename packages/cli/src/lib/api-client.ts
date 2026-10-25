import { getApiKey, getBaseUrl } from '../utils/config-store.js';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body = '') {
    super(message);
    this.name = 'ApiError';
  }

  /** The `error.code` of a JSON error body, or null. */
  get code(): string | null {
    try {
      const code = (JSON.parse(this.body) as { error?: { code?: unknown } })?.error?.code;
      return typeof code === 'string' ? code : null;
    } catch {
      return null;
    }
  }
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${getBaseUrl()}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, `API error ${res.status}: ${body}`, body);
  }

  return res.json() as Promise<T>;
}
