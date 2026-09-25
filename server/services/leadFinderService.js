import config from '../config/env.js';
import {
  getTodayDateString,
  loadDailyUsage,
  saveDailyUsage,
  loadLeadsHistory,
  saveLeadsHistory,
  loadSeenPlaces,
  saveSeenPlaces,
  loadOutreachHistory,
  saveOutreachHistory,
  withStorageOperationLock,
} from './storageService.js';
import { generateColdEmail } from './deepseekService.js';

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
      'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,nextPageToken',
  };

  const newUniquePlaces = [];
  let duplicatesSkipped = 0;
  let pageToken = null;
  const MAX_PAGES = 3;

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
      });

      if (response.status === 403) {
        const errJson = await response.json().catch(() => ({}));
        const msg = errJson.error?.message || 'Permission Denied';
        console.warn(`[Google Places API Error 403]: ${msg}`);
        break;
      }

      if (!response.ok) {
        console.warn(`[Google Places API Error ${response.status}]`);
        break;
      }

      const data = await response.json();
      const places = data.places || [];
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
      break;
    }
  }

  return {
    places: newUniquePlaces.slice(0, neededCount),
    duplicatesSkipped,
  };
}

export async function findEmails(domain) {
  if (!domain || !config.HUNTER_API_KEY) return [];
  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(config.HUNTER_API_KEY)}&limit=3`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[Hunter.io domain-search status ${response.status}]`);
      return [];
    }
    const data = await response.json();
    return data.data?.emails || [];
  } catch (e) {
    console.warn(`[Hunter.io findEmails error]: ${e.message}`);
    return [];
  }
}

export async function verifyEmail(email) {
  if (!email || !config.HUNTER_API_KEY) return 'unknown';
  const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(config.HUNTER_API_KEY)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return 'unknown';
    const data = await response.json();
    return data.data?.status || 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

export async function executeLeadSearch(options) {
  return withStorageOperationLock('lead-search', () => runLeadSearch(options));
}

async function runLeadSearch({ businessType, city, country, requestedCount = 20, mode = 'auto' }) {
  const cleanType = (businessType || '').trim();
  const cleanCity = (city || '').trim();
  const cleanCountry = (country || '').trim();
  const count = requestedCount == null || requestedCount === '' ? 20 : Number(requestedCount);

  if (!cleanType || !cleanCity || !cleanCountry) {
    const err = new Error('Business type, city, and country are required.');
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isInteger(count) || count < 1 || count > 50) {
    const err = new Error('Number to find must be between 1 and 50.');
    err.statusCode = 400;
    throw err;
  }

  if (!['auto', 'live', 'simulated'].includes(mode)) {
    const err = new Error('Search mode must be auto, live, or simulated.');
    err.statusCode = 400;
    throw err;
  }

  if (mode === 'live' && (!config.GOOGLE_API_KEY || !config.HUNTER_API_KEY)) {
    const err = new Error('Live search requires Google Places and Hunter API keys.');
    err.statusCode = 503;
    throw err;
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

  const seenMap = loadSeenPlaces();
  const history = loadLeadsHistory();
  const existingLeads = history.leads || [];

  const processedLeads = [];
  let duplicatesSkipped = 0;
  let isLiveMode = false;

  // Try Live APIs if configured and requested
  if ((mode === 'live' || mode === 'auto') && config.GOOGLE_API_KEY && config.HUNTER_API_KEY) {
    try {
      const searchRes = await searchPlaces(query, fetchCount, seenMap, existingLeads);
      const places = searchRes.places || [];
      duplicatesSkipped = searchRes.duplicatesSkipped || 0;

      if (places && places.length > 0) {
        isLiveMode = true;
        for (let idx = 0; idx < places.length; idx++) {
          if (usedToday >= config.DAILY_LEAD_LIMIT) break;

          const place = places[idx];
          const placeId = place.id || `live-${Date.now()}-${idx}`;
          const name = place.displayName?.text || `${cleanCity} ${cleanType} ${idx + 1}`;
          const address = place.formattedAddress || `${cleanCity}, ${cleanCountry}`;
          const phone = place.nationalPhoneNumber || '—';
          const website = place.websiteUri || '';
          const domain = extractDomain(website);

          usedToday += 1;
          saveDailyUsage(today, usedToday);

          let email = '—';
          let emailStatus = 'not_found';

          if (domain) {
            const emails = await findEmails(domain);
            await new Promise((r) => setTimeout(r, 400));
            if (emails && emails.length > 0) {
              const bestEmail = emails[0].value;
              const status = await verifyEmail(bestEmail);
              await new Promise((r) => setTimeout(r, 400));
              email = bestEmail;
              emailStatus =
                status === 'valid' || status === 'deliverable'
                  ? 'deliverable'
                  : status === 'accept_all' || status === 'webmail'
                  ? 'risky'
                  : 'invalid';
            }
          }

          const phoneStatus = phone && phone !== '—' ? 'valid' : 'invalid';

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
          };

          // Generate AI Cold Email draft if deliverable
          if (emailStatus === 'deliverable' || emailStatus === 'valid') {
            const draft = await generateColdEmail(leadObj);
            leadObj.coldMailDraft = {
              subject: draft.subject,
              body: draft.body,
              status: 'pending_review',
              generatedAt: today,
            };
          }

          // Save to seenMap immediately
          seenMap[placeId] = {
            id: placeId,
            name,
            address,
            phone,
            website: leadObj.website,
            domain,
            email,
            emailStatus,
            foundAt: today,
          };

          processedLeads.push(leadObj);
        }
      }
    } catch (e) {
      console.warn(`[Lead Finder Live API Error]: ${e.message}`);
      if (mode === 'live') {
        const err = new Error(`Live API search error: ${e.message}`);
        err.statusCode = 500;
        throw err;
      }
      isLiveMode = false;
    }
  }

  if (mode === 'live' && processedLeads.length === 0) {
    const err = new Error('Live search returned no new leads.');
    err.statusCode = 404;
    throw err;
  }

  // Simulation fallback if live search yielded no results or mode was simulated
  if (processedLeads.length === 0) {
    const simLeads = generateSimulatedLeads(cleanType, cleanCity, cleanCountry, fetchCount, seenMap, existingLeads);
    for (const lead of simLeads) {
      if (usedToday >= config.DAILY_LEAD_LIMIT) break;
      usedToday += 1;
      saveDailyUsage(today, usedToday);

      if (lead.emailStatus === 'deliverable' || lead.emailStatus === 'valid') {
        const draft = await generateColdEmail(lead, { useAI: false });
        lead.coldMailDraft = {
          subject: draft.subject,
          body: draft.body,
          status: 'pending_review',
          generatedAt: today,
        };
      }

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

  // Persist seenPlaces
  saveSeenPlaces(seenMap);

  // Persist to history
  const updatedLeads = [...existingLeads, ...processedLeads];
  const searches = history.searches || [];
  const newSearchRecord = {
    id: Date.now(),
    query: `${cleanType} · ${cleanCity}, ${cleanCountry}`,
    count: processedLeads.length,
    duplicatesSkipped,
    date: today,
    mode: isLiveMode ? 'live' : 'simulated',
  };
  searches.unshift(newSearchRecord);
  history.leads = updatedLeads;
  history.searches = searches.slice(0, 50);
  saveLeadsHistory(history);

  // Sync any drafted cold emails to outreach history
  const outreachHistory = loadOutreachHistory();
  for (const lead of processedLeads) {
    if (lead.coldMailDraft) {
      const existingIdx = outreachHistory.findIndex((o) => o.leadId === lead.id || o.recipient === lead.email);
      const outreachRecord = {
        id: `outreach-${lead.id}`,
        leadId: lead.id,
        source: lead.source,
        leadName: lead.name,
        recipient: lead.email,
        company: lead.name,
        location: `${lead.city || cleanCity}, ${lead.country || cleanCountry}`,
        subject: lead.coldMailDraft.subject,
        body: lead.coldMailDraft.body,
        status: 'pending_review',
        createdAt: today,
      };
      if (existingIdx >= 0) {
        outreachHistory[existingIdx] = outreachRecord;
      } else {
        outreachHistory.unshift(outreachRecord);
      }
    }
  }
  saveOutreachHistory(outreachHistory);

  return {
    leads: processedLeads,
    count: processedLeads.length,
    duplicatesSkipped,
    mode: isLiveMode ? 'live' : 'simulated',
    usage: {
      date: today,
      count: usedToday,
      remaining: Math.max(0, config.DAILY_LEAD_LIMIT - usedToday),
    },
  };
}

