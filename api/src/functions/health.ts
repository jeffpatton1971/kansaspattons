import { app, type HttpRequest } from '@azure/functions';
import { contentRuntimeDiagnostics } from '../content-store.js';
import { jsonResponse, withErrors } from '../http.js';
import { siteKeyFromRequest } from '../site.js';

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
});

app.http('siteHealth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sites/{site}/health',
  handler: healthHandler,
});

async function healthHandler(request: HttpRequest) {
  return withErrors(async () => {
    return jsonResponse(
      {
        ok: true,
        content: contentRuntimeDiagnostics(siteKeyFromRequest(request)),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  });
}
