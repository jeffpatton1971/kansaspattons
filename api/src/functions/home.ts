import { app } from '@azure/functions';
import { loadHomePayload } from '../home-data.js';
import { jsonResponse, withErrors } from '../http.js';

app.http('home', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'home',
  handler: async () =>
    withErrors(async () => {
      return jsonResponse(await loadHomePayload());
    }),
});
