import config from '../config/env.js';
import { requestHunter, resetHunterRequestQuota } from './hunterClient.js';
import {
  getTodayDateString,
  loadDailyUsage,
  saveDailyUsage,
  loadLeadsHistory,
  saveLeadsHistory,
  insertLeadsBatch,
  loadSeenPlaces,
  saveSeenPlaces,
  loadHunterSetting,
  withStorageOperationLock,
} from './storageService.js';
import { scrapeEmailsForWebsite } from './emailScraper.js';

const PREFIXES = [
  'Global', 'Royal', 'Apex', 'Pinnacle', 'Aroma', 'Golden', 'Pacific', 'Atlantic',
  'Orient', 'Crown', 'Sterling', 'Continental', 'Prime', 'Star', 'Sun', 'Vanguard',
  'Heritage', 'Direct', 'United', 'Universal', 'Everest', 'Summit', 'Zenith', 'Crest',
  'Bayside', 'Harbor', 'Central', 'Metro', 'Federal', 'Imperial'
];

const SUFFIXES = [
  'Traders', 'Exports', 'Imports', '& Sons', 'Spice Co.', 'Trading House',
  'International', 'Merchants', 'Global', 'Enterprises', 'Holdings', 'Logistics',
  'Supplies', 'Commodities', 'Partners', 'Distribution', 'Agro', 'Foods',
  'Spices', 'Flavors', 'Network', 'Ventures', 'Group', 'Syndicate', 'Solutions',
  'Corp', 'LLC', 'GmbH', 'Co. KG', 'Ltd.'
];

export function extractDomain(websiteUrl) {
  if (!websiteUrl || typeof websiteUrl !== 'string') return null;
  try {
    const parsed = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    let host = parsed.hostname || parsed.host || websiteUrl;
    host = host.split(':')[0];
    return host.replace(/^www\./i, '').trim();
  } catch (e) {
    let clean = websiteUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    clean = clean.split('/')[0].split(':')[0].trim();
    return clean || null;
  }
}

/**
 * Checks if a business place or lead is already in seenPlaces, existing leads history, or current batch.
 */
export function isPlaceDuplicate(place, seenMap = {}, existingLeads = [], currentBatch = []) {
  const placeId = place.id || place.place_id;
  if (placeId && seenMap[placeId]) {
    return true;
  }

  const website = place.websiteUri || place.website;
  const domain = extractDomain(website);
  const cleanName = (place.displayName?.text || place.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!domain && !cleanName && !placeId) return false;

  // Check against seenPlaces
  for (const [id, details] of Object.entries(seenMap)) {
    if (placeId && id === placeId) return true;
    if (domain && details.domain && details.domain.toLowerCase() === domain.toLowerCase()) return true;
    if (cleanName && details.name && details.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName) return true;
  }

  // Check against existing leads history
  for (const lead of existingLeads) {
    if (lead.id && placeId && lead.id === placeId) return true;
    const leadDomain = extractDomain(lead.website);
    if (domain && leadDomain && leadDomain.toLowerCase() === domain.toLowerCase()) return true;
    if (cleanName && lead.name && lead.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName) return true;
  }

  // Check against current batch
  for (const lead of currentBatch) {
    if (lead.id && placeId && lead.id === placeId) return true;
    const leadDomain = extractDomain(lead.websiteUri || lead.website);
    if (domain && leadDomain && leadDomain.toLowerCase() === domain.toLowerCase()) return true;
    const leadName = (lead.displayName?.text || lead.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanName && leadName && leadName === cleanName) return true;
  }

  return false;
}

export function generateSimulatedLeads(businessType, city, country, count, seenMap = {}, existingLeads = []) {
  const firstWord = businessType ? businessType.split(' ')[0] : 'Spice';
  const capFirstWord = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
  const capCity = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
  const capCountry = country.charAt(0).toUpperCase() + country.slice(1).toLowerCase();
  const today = getTodayDateString();

  const simulated = [];
  let attempts = 0;

  while (simulated.length < count && attempts < count * 20) {
    attempts++;
    const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
    const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];

    let compName = `${capCity} ${capFirstWord} ${suffix}`;
    if (attempts > 15) {
      compName = `${prefix} ${capCity} ${capFirstWord} ${suffix}`;
    }
    if (attempts > 60) {
      compName = `${prefix} ${capCity} ${capFirstWord} ${suffix} ${Math.floor(attempts / 2)}`;
    }

    const cleanName = compName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const dom = `${cleanName}.com`;

    const candidate = {
      id: `sim-${cleanName}`,
      name: compName,
      website: `https://${dom}`,
    };

    if (isPlaceDuplicate(candidate, seenMap, existingLeads, simulated)) {
      continue;
    }

    const pValid = Math.random() < 0.8;
    const rMail = Math.random();
    const eStat = rMail < 0.65 ? 'deliverable' : rMail < 0.85 ? 'risky' : 'not_found';
    const index = simulated.length + 1;

    simulated.push({
      id: `sim-${cleanName}`,
      name: compName,
      address: `${100 + index * 14} ${capCity} Trade Avenue, ${capCity}, ${capCountry}`,
      city: capCity,
      country: capCountry,
      businessType: businessType || 'Spice Importer',
      phone: pValid
        ? `+91 ${Math.floor(70000 + Math.random() * 29999)} ${Math.floor(10000 + Math.random() * 79999)}`
        : '—',
      phoneStatus: pValid ? 'valid' : 'invalid',
      email: eStat !== 'not_found' ? `contact@${dom}` : '—',
      emailStatus: eStat,
      website: `https://${dom}`,
      foundAt: today,
      source: 'simulated',
    });
  }
  return simulated;
}

export async function searchPlaces(query, neededCount = 20, seenMap = {}, existingLeads = []) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': config.GOOGLE_API_KEY,
    'X-Goog-FieldMask':
      'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,nextPageToken',
  };

  const newUniquePlaces = [];
  let duplicatesSkipped = 0;
  let providerError = null;
  let pageToken = null;
  const MAX_PAGES = Math.max(10, Math.ceil(neededCount / 20));

  for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
    if (newUniquePlaces.length >= neededCount) break;

    const body = {
      textQuery: query,
      pageSize: 20,
    };
    if (pageToken) {
      body.pageToken = pageToken;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (response.status === 403) {
        const errJson = await response.json().catch(() => ({}));
        const msg = errJson.error?.message || 'Permission Denied';
        console.warn(`[Google Places API Error 403]: ${msg}`);
        providerError = `Google Places denied the request: ${msg}`;
        break;
      }

      if (!response.ok) {
        console.warn(`[Google Places API Error ${response.status}]`);
        providerError = `Google Places returned HTTP ${response.status}`;
        break;
      }

      const data = await response.json();
      const places = Array.isArray(data.places) ? data.places : [];
      if (places.length === 0) break;

      for (const place of places) {
        if (isPlaceDuplicate(place, seenMap, existingLeads, newUniquePlaces)) {
          duplicatesSkipped++;
        } else {
          newUniquePlaces.push(place);
          if (newUniquePlaces.length >= neededCount) break;
        }
      }

      pageToken = data.nextPageToken;
      if (!pageToken || newUniquePlaces.length >= neededCount) break;

      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.warn(`[Google Places API Request Error]: ${e.message}`);
      providerError = `Google Places request failed: ${e.message}`;
      break;
    }
  }

  return {
    places: newUniquePlaces.slice(0, neededCount),
    duplicatesSkipped,
    providerError,
  };
}

const SOCIAL_AND_DIRECTORY_DOMAINS = new Set([
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'youtube.com',
  'tiktok.com',
  'yelp.com',
  'tripadvisor.com',
  'google.com',
  'maps.google.com',
  'linktr.ee',
  'ubereats.com',
  'doordash.com',
  'grubhub.com',
  'deliveroo.com',
  'zomato.com',
  'swiggy.com',
  'apple.com',
  'whatsapp.com',
]);

export function isSocialOrDirectoryDomain(domain) {
  if (!domain || typeof domain !== 'string') return false;
  const d = domain.toLowerCase().replace(/^www\./, '').trim();
  for (const s of SOCIAL_AND_DIRECTORY_DOMAINS) {
    if (d === s || d.endsWith(`.${s}`)) return true;
  }
  return false;
}

let hunterQuotaExceeded = false;

export function isHunterQuotaExceeded() {
  return hunterQuotaExceeded;
}

export function resetHunterQuotaState() {
  hunterQuotaExceeded = false;
  resetHunterRequestQuota();
}

export function setHunterQuotaExceeded(exceeded = true) {
  hunterQuotaExceeded = Boolean(exceeded);
}

/**
 * Discovers companies directly using Hunter.io's native discovery engine
 * (Hunter Discover / Domain Search) without using Google Places as starting point.
 */
export async function searchHunterCompanies({ businessType, city, country, neededCount = 20, seenMap = {}, existingLeads = [] }) {
  if (!config.HUNTER_API_KEY || hunterQuotaExceeded) return { companies: [], duplicatesSkipped: 0, providerError: !config.HUNTER_API_KEY ? 'Hunter API key is not configured.' : 'Hunter quota is exhausted. Admin must restore quota or select scraper.' };
  const companies = [];
  const warnings = [];
  let duplicatesSkipped = 0;
  let providerError = null;
  let filters = null;
  let previousPage = '';
  for (let offset = 0; offset < 1000 && companies.length < neededCount; offset += 100) {
    const result = await requestHunter('discover', { body: {
      ...(offset > 0 && filters ? filters : { query: `${businessType} in ${city}, ${country}` }),
      ...(offset > 0 ? { offset } : {}),
    } });
    if (result.quotaExceeded) hunterQuotaExceeded = true;
    if (!result.ok) {
      const ids = result.errors.map(error => error.id).filter(Boolean).join(', ');
      const error = `Hunter Discover failed (HTTP ${result.status}${ids ? `: ${ids}` : ''}).`;
      if (offset > 0) warnings.push(error + ' Pagination may require a Premium plan.');
      else providerError = error;
      break;
    }
    filters ||= result.meta?.filters;
    const raw = Array.isArray(result.data) ? result.data : result.data?.companies || [];
    const pageSignature = JSON.stringify(raw.map(company => company.domain || company.organization || company.name));
    if (offset > 0 && pageSignature === previousPage) { warnings.push('Hunter repeated a results page; pagination stopped.'); break; }
    previousPage = pageSignature;
    for (const company of raw) {
      const domain = company.domain || extractDomain(company.website);
      const name = company.name || company.organization || domain;
      if (!name) continue;
      const candidate = {
        id: `hunter-${(domain || name).toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        name, domain, website: company.website || (domain ? `https://${domain}` : ''),
        address: [company.street, company.city, company.country].filter(Boolean).join(', '),
        city: company.city || '', country: company.country || '',
        targetCity: city, targetCountry: country,
        phone: company.phone_number || company.phone || '',
        businessType: company.industry || businessType,
        emails: Array.isArray(company.emails) ? company.emails : company.email ? [company.email] : [],
      };
      if (isPlaceDuplicate(candidate, seenMap, existingLeads, companies)) duplicatesSkipped++;
      else companies.push(candidate);
      if (companies.length >= neededCount) break;
    }
    if (raw.length < 100) break;
  }
  return { companies: companies.slice(0, neededCount), duplicatesSkipped, providerError, warnings };
}

export async function processHunterCompany(company, idx, { cleanCity, cleanCountry, cleanType, today }) {
  const domain = company.domain || extractDomain(company.website);
  let emails = (company.emails || []).map(item => typeof item === 'string' ? { value: item } : item);
  let warning = '';
  if (!emails.length && domain) {
    try { emails = await findEmails(domain, { strict: true }); }
    catch (error) { warning = `${company.name || domain}: ${error.message}`; }
  }
  emails = emails.filter(item => typeof (item?.value || item?.email) === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.value || item.email));
  const priority = item => (item.verification?.status === 'valid' ? 1000 : 0) + (/procurement|purchasing|sales|export/i.test(`${item.department || ''} ${item.value || item.email}`) ? 100 : 0) + (Number(item.confidence) || 0);
  emails.sort((a, b) => priority(b) - priority(a));
  let selected = null;
  let emailStatus = 'not_found';
  const rank = { deliverable: 4, risky: 3, unknown: 2, invalid: 1 };
  for (const candidate of emails.slice(0, 3)) {
    const status = await verifyEmail(candidate.value || candidate.email);
    const mapped = ['valid', 'deliverable'].includes(status) ? 'deliverable' : ['accept_all', 'webmail', 'disposable'].includes(status) ? 'risky' : status === 'invalid' ? 'invalid' : 'unknown';
    if (!selected || rank[mapped] > rank[emailStatus]) { selected = candidate; emailStatus = mapped; }
    if (mapped === 'deliverable') break;
  }
  const publishedPhone = value => typeof value === 'string' && value.replace(/\D/g, '').length >= 6;
  const phone = publishedPhone(company.phone) ? company.phone : (publishedPhone(selected?.phone_number) ? selected.phone_number : emails.find(item => publishedPhone(item.phone_number))?.phone_number || '—');
  return { domain, warning, leadObj: {
    id: company.id || `hunter-${Date.now()}-${idx}`,
    name: company.name || domain || 'Unknown company',
    address: company.address || '', city: company.city || '', country: company.country || '',
    targetCity: company.targetCity || cleanCity, targetCountry: company.targetCountry || cleanCountry,
    businessType: company.businessType || cleanType,
    phone, phoneStatus: publishedPhone(phone) ? 'valid' : 'invalid',
    email: selected?.value || selected?.email || '—', emailStatus,
    contactName: selected ? [selected.first_name, selected.last_name].filter(Boolean).join(' ') : '',
    website: company.website || (domain ? `https://${domain}` : ''),
    foundAt: today, source: 'live', discoveryEngine: 'hunter', emailVerification: 'hunter_verifier',
  } };
}

export async function findEmails(domain, { strict = false } = {}) {
  if (!domain || !loadHunterSetting() || hunterQuotaExceeded || isSocialOrDirectoryDomain(domain)) return [];
  const result = await requestHunter('domain-search', { params: { domain, limit: 10 } });
  if (result.quotaExceeded) hunterQuotaExceeded = true;
  if (!result.ok) {
    if (result.quotaExceeded) return [];
    if (strict) throw new Error(`Hunter Domain Search failed (HTTP ${result.status}).`);
    return [];
  }
  return Array.isArray(result.data?.emails) ? result.data.emails : [];
}

export async function verifyEmail(email) {
  if (!email || !loadHunterSetting() || hunterQuotaExceeded) return 'unknown';
  const result = await requestHunter('email-verifier', { params: { email } });
  if (result.quotaExceeded) hunterQuotaExceeded = true;
  return result.ok && typeof result.data?.status === 'string' ? result.data.status : 'unknown';
}

export async function scrapeWebsiteContacts(websiteUrl, domain) {
  const targetDomain = domain || extractDomain(websiteUrl);
  if (isSocialOrDirectoryDomain(targetDomain)) return { emails: [], phones: [], status: 'not_a_business_site' };
  const baseUrl = websiteUrl || (targetDomain ? `https://${targetDomain}` : '');
  if (!baseUrl) return { emails: [], phones: [], status: 'missing_website' };
  try {
    const result = await scrapeEmailsForWebsite(baseUrl);
    return {
      emails: (result.emails || []).map(candidate => ({ ...candidate, value: candidate.email, source: 'website' })),
      phones: result.phones || [],
      status: result.status,
      failure: result.failure,
    };
  } catch {
    return { emails: [], phones: [], status: 'unreachable' };
  }
}

export async function scrapeEmailsFromWebsite(websiteUrl, domain) {
  return (await scrapeWebsiteContacts(websiteUrl, domain)).emails;
}

/**
 * Executes async tasks over an array with bounded concurrency.
 * Preserves the original order of items.
 */
export async function mapConcurrent(items, concurrency, asyncFn) {
  if (!items || items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await asyncFn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
}

async function processLivePlace(place, idx, { cleanCity, cleanCountry, cleanType, today, hunterEnabled }) {
  const placeId = place.id || `live-${Date.now()}-${idx}`;
  const name = place.displayName?.text || `${cleanCity} ${cleanType} ${idx + 1}`;
  const address = place.formattedAddress || `${cleanCity}, ${cleanCountry}`;
  let phone = place.nationalPhoneNumber || place.internationalPhoneNumber || '—';
  const website = place.websiteUri || '';
  const domain = extractDomain(website);

  let email = '—';
  let emailStatus = 'not_found';

  let contactDiscovery = { status: 'missing_website' };
  if (domain || website) {
    contactDiscovery = await scrapeWebsiteContacts(website, domain);
    if (!phone || phone === '—') phone = contactDiscovery.phones?.[0] || phone;
    const candidates = contactDiscovery.emails || [];
    const best = candidates.find(item => item.hasMx !== false) || candidates[0];
    if (best) {
      email = best.value;
      emailStatus = best.hasMx === true ? 'mx_valid' : best.hasMx === false ? 'invalid' : 'unknown';
    }
  }

  const phoneStatus = typeof phone === 'string' && phone.replace(/\D/g, '').length >= 6 ? 'valid' : 'invalid';

  const leadObj = {
    id: placeId,
    name,
    address,
    city: cleanCity,
    country: cleanCountry,
    businessType: cleanType,
    phone,
    phoneStatus,
    email,
    emailStatus,
    website: website || (domain ? `https://${domain}` : '#'),
    foundAt: today,
    source: 'live',
    emailVerification: 'domain_mx',
    contactDiscoveryStatus: contactDiscovery.status,
  };

  return { leadObj, domain };
}

export function hasPublishedContact(lead) {
  const email = typeof lead.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim());
  const phone = typeof lead.phone === 'string' && lead.phone.replace(/\D/g, '').length >= 6;
  return Boolean(email || phone);
}

export async function executeLeadSearch(options, onProgress = () => {}) {
  return withStorageOperationLock('lead-search', () => runLeadSearch(options, onProgress));
}

async function runLeadSearch({ businessType, city, country, requestedCount = 20, mode = 'live', engine, ownerUserId }, onProgress = () => {}) {
  const cleanType = (businessType || '').trim();
  const cleanCity = (city || '').trim();
  const cleanCountry = (country || '').trim();
  const count = requestedCount == null || requestedCount === '' ? 20 : Number(requestedCount);

  if (!cleanType || !cleanCity || !cleanCountry) {
    const err = new Error('Business type, city, and country are required.');
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isInteger(count) || count < 1 || count > 200) {
    const err = new Error('Number to find must be between 1 and 200.');
    err.statusCode = 400;
    throw err;
  }

  if (!['live', 'simulated'].includes(mode)) {
    const err = new Error('Search mode must be live or simulated.');
    err.statusCode = 400;
    throw err;
  }

  const hunterSetting = loadHunterSetting();
  if (engine && !['hunter', 'scraper'].includes(engine)) {
    const err = new Error('Discovery engine must be hunter or scraper.');
    err.statusCode = 400;
    throw err;
  }
  const selectedEngine = engine || (hunterSetting ? 'hunter' : 'scraper');
  const isHunterEngine = selectedEngine === 'hunter';

  // Simulation mode is strictly gated to development/test environment or explicit SIMULATION_MODE=true
  if (mode === 'simulated') {
    const env = process.env.NODE_ENV || config.NODE_ENV || 'development';
    const isAllowed = env === 'development' || env === 'test' || process.env.SIMULATION_MODE === 'true';
    if (!isAllowed) {
      const err = new Error('Simulation mode is disabled in production.');
      err.statusCode = 403;
      throw err;
    }
  }

  // Live search validation: verify keys based on chosen discovery engine
  if (mode === 'live') {
    if (isHunterEngine) {
      if (!config.HUNTER_API_KEY) {
        const err = new Error('Hunter.io API key is not configured for Hunter Native Discovery.');
        err.statusCode = 503;
        throw err;
      }
    } else {
      if (!config.GOOGLE_API_KEY) {
        const err = new Error('Google Places API key is not configured for Scraper Discovery.');
        err.statusCode = 503;
        throw err;
      }
    }
  }

  const { date: today, count: usedTodayInit } = loadDailyUsage();
  let usedToday = usedTodayInit;
  const remaining = Math.max(0, config.DAILY_LEAD_LIMIT - usedToday);

  if (remaining <= 0) {
    const err = new Error(`Daily limit of ${config.DAILY_LEAD_LIMIT} reached for today.`);
    err.statusCode = 429;
    throw err;
  }

  const fetchCount = Math.min(count, remaining);
  const query = `${cleanType} in ${cleanCity}, ${cleanCountry}`;

  onProgress({
    step: 'start',
    message: isHunterEngine
      ? `Querying Hunter.io Native Discover for "${cleanType}" in ${cleanCity}, ${cleanCountry}...`
      : `Searching Google Places for "${cleanType}" in ${cleanCity}, ${cleanCountry}...`,
    current: 0,
    total: fetchCount,
    percent: 5,
  });

  const seenMap = loadSeenPlaces();
  const history = loadLeadsHistory();
  const existingLeads = history.leads || [];

  const processedLeads = [];
  let duplicatesSkipped = 0;
  let contactsMissing = 0;
  const warnings = [];
  let unreadableSites = 0;

  // Execute Live APIs
  if (mode === 'live') {
    if (isHunterEngine) {
      // 1. HUNTER.IO NATIVE DISCOVERY MODE
      const hunterRes = await searchHunterCompanies({
        businessType: cleanType,
        city: cleanCity,
        country: cleanCountry,
        neededCount: fetchCount,
        seenMap,
        existingLeads,
      });

      if (hunterRes.providerError && hunterRes.companies.length === 0) {
        const err = new Error(hunterRes.providerError);
        err.statusCode = 502;
        throw err;
      }

      warnings.push(...(hunterRes.warnings || []));
      const companies = hunterRes.companies || [];
      duplicatesSkipped = hunterRes.duplicatesSkipped || 0;

      if (companies && companies.length > 0) {
        const maxToProcess = Math.min(companies.length, remaining);
        const companiesToProcess = companies.slice(0, maxToProcess);

        onProgress({
          step: 'places_found',
          message: `Discovered ${companies.length} corporate profiles from Hunter.io (${duplicatesSkipped} duplicates skipped). Verifying contact emails...`,
          current: 0,
          total: companiesToProcess.length,
          percent: 20,
        });

        let finishedWorkers = 0;
        const CONCURRENCY_LIMIT = 4;
        const results = await mapConcurrent(companiesToProcess, CONCURRENCY_LIMIT, async (company, idx) => {
          const compName = company.name || `Company #${idx + 1}`;
          onProgress({
            step: 'scraping_place',
            message: `Verifying Hunter emails for ${compName}...`,
            current: finishedWorkers,
            total: companiesToProcess.length,
            percent: 20 + Math.round((finishedWorkers / companiesToProcess.length) * 70),
          });

          const res = await processHunterCompany(company, idx, { cleanCity, cleanCountry, cleanType, today });
          finishedWorkers++;

          const emailInfo = res?.leadObj?.email && res.leadObj.email !== '—'
            ? `found contact ${res.leadObj.email}`
            : 'no email published';
          onProgress({
            step: 'place_enriched',
            message: `${compName}: ${emailInfo}`,
            current: finishedWorkers,
            total: companiesToProcess.length,
            percent: 20 + Math.round((finishedWorkers / companiesToProcess.length) * 70),
          });

          return res;
        });

        for (const res of results) {
          if (!res?.leadObj) continue;
          if (res.warning) warnings.push(res.warning);
          if (!hasPublishedContact(res.leadObj)) { contactsMissing += 1; continue; }
          const { leadObj, domain } = res;
          usedToday += 1;

          seenMap[leadObj.id] = {
            id: leadObj.id,
            name: leadObj.name,
            address: leadObj.address,
            phone: leadObj.phone,
            website: leadObj.website,
            domain,
            email: leadObj.email,
            emailStatus: leadObj.emailStatus,
            foundAt: today,
          };

          processedLeads.push(leadObj);
        }
      }
    } else {
      // 2. GOOGLE PLACES + INBUILT MAIL SCRAPER MODE
      const searchRes = await searchPlaces(query, fetchCount, seenMap, existingLeads);
      if (searchRes.providerError && searchRes.places.length === 0) {
        const err = new Error(searchRes.providerError);
        err.statusCode = 502;
        throw err;
      }
      const places = searchRes.places || [];
      duplicatesSkipped = searchRes.duplicatesSkipped || 0;

      if (places && places.length > 0) {
        const maxToProcess = Math.min(places.length, remaining);
        const placesToProcess = places.slice(0, maxToProcess);

        onProgress({
          step: 'places_found',
          message: `Found ${places.length} business locations from Google Places (${duplicatesSkipped} duplicates skipped). Deep-crawling websites...`,
          current: 0,
          total: placesToProcess.length,
          percent: 15,
        });

        // Concurrency Pool: process up to 4 places simultaneously
        let finishedWorkers = 0;
        const CONCURRENCY_LIMIT = 4;
        const results = await mapConcurrent(placesToProcess, CONCURRENCY_LIMIT, async (place, idx) => {
          const placeName = place.displayName?.text || `Business #${idx + 1}`;
          onProgress({
            step: 'scraping_place',
            message: `Crawling website & MX records for ${placeName}...`,
            current: finishedWorkers,
            total: placesToProcess.length,
            percent: 15 + Math.round((finishedWorkers / placesToProcess.length) * 75),
          });

          // In scraper mode, hunterEnabled is false to use inbuilt scraper & MX verification with zero Hunter API credit usage
          const res = await processLivePlace(place, idx, { cleanCity, cleanCountry, cleanType, today, hunterEnabled: false });
          finishedWorkers++;

          const emailInfo = res?.leadObj?.email && res.leadObj.email !== '—'
            ? `extracted ${res.leadObj.email}`
            : 'no email published';
          onProgress({
            step: 'place_enriched',
            message: `${placeName}: ${emailInfo}`,
            current: finishedWorkers,
            total: placesToProcess.length,
            percent: 15 + Math.round((finishedWorkers / placesToProcess.length) * 75),
          });

          return res;
        });

        for (const res of results) {
          if (!res?.leadObj) continue;
          if (["blocked_by_site", "robots_disallowed", "unreachable", "rejected_address", "js_rendered"].includes(res.leadObj.contactDiscoveryStatus)) unreadableSites += 1;
          if (res.warning) warnings.push(res.warning);
          if (!hasPublishedContact(res.leadObj)) { contactsMissing += 1; continue; }
          const { leadObj, domain } = res;
          leadObj.discoveryEngine = 'scraper';
          usedToday += 1;

          seenMap[leadObj.id] = {
            id: leadObj.id,
            name: leadObj.name,
            address: leadObj.address,
            phone: leadObj.phone,
            website: leadObj.website,
            domain,
            email: leadObj.email,
            emailStatus: leadObj.emailStatus,
            foundAt: today,
          };

          processedLeads.push(leadObj);
        }
      }
    }
  }

  // Explicit dev-gated simulation execution if mode is simulated
  if (mode === 'simulated') {
    const simLeads = generateSimulatedLeads(cleanType, cleanCity, cleanCountry, fetchCount, seenMap, existingLeads);
    for (const lead of simLeads) {
      if (usedToday >= config.DAILY_LEAD_LIMIT) break;
      usedToday += 1;

      seenMap[lead.id] = {
        id: lead.id,
        name: lead.name,
        address: lead.address,
        phone: lead.phone,
        website: lead.website,
        domain: extractDomain(lead.website),
        email: lead.email,
        emailStatus: lead.emailStatus,
        foundAt: today,
      };

      processedLeads.push(lead);
    }
  }

  if (selectedEngine === 'hunter' && hunterQuotaExceeded) warnings.push('Hunter usage credits are exhausted. Remaining email lookups were stopped; available contacts were retained. Admin can restore Hunter credits and retry, or manually select scraper.');
  if (unreadableSites) warnings.push(`Website contacts could not be read for ${unreadableSites} businesses. Available phone numbers were retained.`);

  // Atomic Batch Transaction: write all discovered leads, update daily usage, record search, and update seen places
  const newSearchRecord = {
    id: Date.now(),
    query: `${cleanType} · ${cleanCity}, ${cleanCountry}`,
    count: processedLeads.length,
    duplicatesSkipped,
    date: today,
    mode,
  };

  insertLeadsBatch(processedLeads, {
    ownerUserId,
    today,
    totalDailyCount: usedToday,
    searchRecord: newSearchRecord,
    seenPlaces: seenMap,
  });

  onProgress({
    step: 'completed',
    message: `Discovery finished! Harvested ${processedLeads.length} leads.`,
    current: processedLeads.length,
    total: processedLeads.length,
    percent: 100,
  });

  return {
    leads: processedLeads,
    count: processedLeads.length,
    duplicatesSkipped,
    contactsMissing,
    warnings,
    mode,
    usage: {
      date: today,
      count: usedToday,
      remaining: Math.max(0, config.DAILY_LEAD_LIMIT - usedToday),
    },
  };
}

