import config from '../config/env.js';
import { closeStorage } from '../services/storageService.js';
import { checkProvider, loadProviderSettings } from '../services/integrationService.js';
loadProviderSettings();
const results = {
  checkedAt: new Date().toISOString()
};
for (const provider of ['hunter', 'deepseek', 'hostinger']) results[provider] = await checkProvider(provider);
try {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': config.GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName'
    },
    body: JSON.stringify({
      textQuery: 'Spice Importer in Hamburg, Germany',
      pageSize: 1
    }),
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => ({}));
  results.google = {
    ok: response.ok,
    httpStatus: response.status,
    returned: Array.isArray(data.places) ? data.places.length : 0,
    code: data.error?.status
  };
} catch {
  results.google = {
    ok: false,
    reason: 'Provider connection failed.'
  };
}
console.log(JSON.stringify(results, null, 2));
closeStorage();
