import type { HttpResponseInit } from '@azure/functions';
import { ContentNotFoundError } from './content-store.js';

export type ApiError = {
  error: string;
  detail?: string;
};

export function jsonResponse(value: unknown, init: HttpResponseInit = {}): HttpResponseInit {
  return {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
      ...init.headers,
    },
    body: JSON.stringify(value),
  };
}

export function errorResponse(error: unknown): HttpResponseInit {
  if (error instanceof ContentNotFoundError) {
    return jsonResponse(
      {
        error: 'not_found',
        detail: error.message,
      } satisfies ApiError,
      { status: 404 },
    );
  }

  const detail = error instanceof Error ? error.message : 'Unexpected API error';

  return jsonResponse(
    {
      error: 'server_error',
      detail,
    } satisfies ApiError,
    { status: 500, headers: { 'cache-control': 'no-store' } },
  );
}

export async function withErrors(handler: () => Promise<HttpResponseInit>) {
  try {
    return await handler();
  } catch (error) {
    return errorResponse(error);
  }
}
