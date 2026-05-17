import { app, type HttpRequest } from '@azure/functions';
import { loadHomePayload } from '../home-data.js';
import { jsonResponse, withErrors } from '../http.js';
import { siteKeyFromRequest } from '../site.js';

app.http('home', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'home',
  handler: async (request) =>
    withErrors(async () => {
      return jsonResponse(await loadHomePayload(siteKeyFromRequest(request)));
    }),
});

app.http('siteHome', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sites/{site}/home',
  handler: siteHomeHandler,
});

async function siteHomeHandler(request: HttpRequest) {
  return withErrors(async () => {
    return jsonResponse(await loadHomePayload(siteKeyFromRequest(request)));
  });
}
