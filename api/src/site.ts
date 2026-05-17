import type { HttpRequest } from '@azure/functions';
import { cleanSiteKey } from './content-store.js';

export function siteKeyFromRequest(request: HttpRequest) {
  return cleanSiteKey(request.params.site || request.query.get('site'));
}
