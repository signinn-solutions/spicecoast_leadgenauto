import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import config from '../config/env.js';
import { executeLeadSearch } from '../services/leadFinderService.js';
import { closeStorage } from '../services/storageService.js';

const directory = mkdtempSync(path.join(os.tmpdir(), 'spicecoast-search-benchmark-'));
const print = console.log;
console.log = console.info = () => {};
Object.assign(config, {
  GOOGLE_API_KEY: 'mock', DEEPSEEK_API_KEY: '', DAILY_LEAD_LIMIT: 2000, MAX_LEADS_PER_SEARCH: 1000,
  GOOGLE_PLACES_CRM_LICENSED: true, GOOGLE_PLACES_TEXT_PER_MINUTE: 500, GOOGLE_PLACES_TEXT_PER_DAY: 500,
  GOOGLE_PLACES_REQUESTS_PER_SEARCH: 60, GOOGLE_PLACES_TEXT_COST_MICROS: 35000,
  GOOGLE_PLACES_DAILY_COST_MICROS: 2100000, GOOGLE_PLACES_SEARCH_COST_MICROS: 2100000,
});
for (const key of ['DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE', 'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE']) {
  config[key] = path.join(directory, key);
}

try {
  for (const [sample, target] of [['dense', 20], ['dense', 60], ['dense', 120], ['dense', 500], ['dense', 1000], ['repeated', 60]]) {
    config.DB_PATH = path.join(directory, sample + target + '.sqlite');
    const counts = { textSearch: 0, details: 0, other: 0 };
    globalThis.fetch = async (url, request) => {
      if (!String(url).endsWith(':searchText')) {
        if (String(url).includes('places.googleapis.com')) counts.details++;
        else counts.other++;
        throw new Error('Only mocked Text Search is expected');
      }
      counts.textSearch++;
      const { textQuery, pageToken, pageSize } = JSON.parse(request.body);
      const region = textQuery.split(' in ').at(-1);
      const page = Number(pageToken || 0);
      const offset = sample === 'repeated' ? 0 : page * 20;
      return Response.json({
        places: Array.from({ length: pageSize }, (_, index) => {
          const id = region + ' ' + (offset + index);
          return { id, displayName: { text: 'Spice Wholesale ' + id }, formattedAddress: region, internationalPhoneNumber: '+91 9999999999' };
        }),
        ...(sample === 'repeated' ? { nextPageToken: '1' } : page < 2 ? { nextPageToken: String(page + 1) } : {}),
      });
    };
    const start = performance.now();
    let leads = 0;
    let error;
    try {
      const result = await executeLeadSearch({ businessType: 'Spice Wholesale', city: 'India', country: 'India', engine: 'scraper', requestedCount: target });
      leads = result.count;
    } catch (failure) {
      error = failure.message;
    }
    print(JSON.stringify({ sample, target, ...counts, leads, ms: Math.round(performance.now() - start), ...(error ? { error } : {}) }));
    closeStorage();
  }
} finally {
  closeStorage();
  for (const file of readdirSync(directory)) unlinkSync(path.join(directory, file));
  rmdirSync(directory);
}
