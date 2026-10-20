import type { ApiErrorBody } from '@/lib/api/contracts';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
  }
}

type Options = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; form?: FormData; signal?: AbortSignal };

// Same-origin JSON client. A 401 means the session ended, so the page goes back to sign-in.
export async function apiFetch<TResponse>(path: string, { method = 'GET', body, form, signal }: Options = {}): Promise<TResponse> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: form ? undefined : body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    signal,
  });
  if (response.status === 401 && typeof window !== 'undefined') {
    window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
  }
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    throw new ApiError(response.status, error?.code ?? 'error', error?.message ?? 'Something went wrong. Please try again.', error?.issues ?? []);
  }
  return data as TResponse;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
