import config from '../config/env.js';
import {assertTenantActive} from './tenantService.js';
import { crawlWebsiteContacts } from './contactCrawlerService.js';
import { userUsage, consumeUserLead, audit, findUser, publicUser } from './accessService.js';
import { getTodayDateString, loadDailyUsage, saveDailyUsage, loadLeadsHistory, saveLeadsHistory, loadSeenPlaces, saveSeenPlaces, loadOutreachHistory, saveOutreachHistory, withStorageOperationLock, withOutreachHistoryLock } from './storageService.js';
import { generateColdEmail } from './deepseekService.js';
const PREFIXES = ['Global', 'Royal', 'Apex', 'Pinnacle', 'Aroma', 'Golden', 'Pacific', 'Atlantic', 'Orient', 'Crown', 'Sterling', 'Continental', 'Prime', 'Star', 'Sun', 'Vanguard', 'Heritage', 'Direct', 'United', 'Universal', 'Everest', 'Summit', 'Zenith', 'Crest', 'Bayside', 'Harbor', 'Central', 'Metro', 'Federal', 'Imperial'];
const SUFFIXES = ['Traders', 'Exports', 'Imports', '& Sons', 'Spice Co.', 'Trading House', 'International', 'Merchants', 'Global', 'Enterprises', 'Holdings', 'Logistics', 'Supplies', 'Commodities', 'Partners', 'Distribution', 'Agro', 'Foods', 'Spices', 'Flavors', 'Network', 'Ventures', 'Group', 'Syndicate', 'Solutions', 'Corp', 'LLC', 'GmbH', 'Co. KG', 'Ltd.'];
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
  const address = (place.formattedAddress || place.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sameName = (other, otherId, otherDomain) => {
    const otherName = (other.displayName?.text || other.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanName || cleanName !== otherName) return false;
    const otherAddress = (other.formattedAddress || other.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (address && otherAddress) return address === otherAddress;
    return !(placeId && otherId) && !(domain && otherDomain);
  };
  if (!domain && !cleanName && !placeId) return false;

  // Check against seenPlaces
  for (const [id, details] of Object.entries(seenMap)) {
    if (placeId && id === placeId) return true;
    if (domain && details.domain && details.domain.toLowerCase() === domain.toLowerCase()) return true;
    if (sameName(details, details.id || id, details.domain)) return true;
  }

  // Check against existing leads history
  for (const lead of existingLeads) {
    if (lead.id && placeId && lead.id === placeId) return true;
    const leadDomain = extractDomain(lead.website);
    if (domain && leadDomain && leadDomain.toLowerCase() === domain.toLowerCase()) return true;
    if (sameName(lead, lead.id, leadDomain)) return true;
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
      website: `https://${dom}`
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
      phone: pValid ? `+91 ${Math.floor(70000 + Math.random() * 29999)} ${Math.floor(10000 + Math.random() * 79999)}` : '—',
      phoneStatus: pValid ? 'valid' : 'invalid',
      email: eStat !== 'not_found' ? `contact@${dom}` : '—',
      emailStatus: eStat,
      website: `https://${dom}`,
      foundAt: today,
      source: 'simulated'
    });
  }
  return simulated;
}
function googleConnectionFailure(error) {
  const codes = [error?.code, error?.cause?.code, ...(error?.cause?.errors || []).map(item=>item.code)];
  if (codes.some(code=>['EACCES','EPERM'].includes(code))) return 'Google Places connection blocked: the server is denied outbound HTTPS access. Check its execution environment or firewall.';
  if (codes.some(code=>['ENOTFOUND','EAI_AGAIN'].includes(code))) return 'Google Places connection failed: the server could not resolve places.googleapis.com. Check DNS and network access.';
  if (error?.name === 'TimeoutError' || codes.some(code=>['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(code))) return 'Google Places connection timed out. Check server internet access to places.googleapis.com on HTTPS port 443.';
  return 'Google Places connection failed before a response was received. Check server network access; API authentication has not been confirmed.';
}
export async function searchPlaces(query, neededCount = 20, seenMap = {}, existingLeads = []) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': config.GOOGLE_API_KEY,
    'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,nextPageToken'
  };
  const newUniquePlaces = [];
  let duplicatesSkipped = 0;
  let providerError = null;
  let pageToken = null;
  let pagesFetched = 0;
  let candidatesReturned = 0;
  const MAX_PAGES = 3;
  for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
    if (newUniquePlaces.length >= neededCount) break;
    const body = {
      textQuery: query,
      pageSize: 20
    };
    if (pageToken) {
      body.pageToken = pageToken;
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
      });
      if (response.status === 403) {
        const errJson = await response.json().catch(() => ({}));
        const msg = errJson.error?.message || 'Permission Denied';
        console.warn("[Google Places API denied the request]");
        providerError = `Google Places denied the request: ${msg}`;
        break;
      }
      if (!response.ok) {
        console.warn(`[Google Places API Error ${response.status}]`);
        providerError = `Google Places returned HTTP ${response.status}`;
        break;
      }
      const data = await response.json();
      pagesFetched++;
      const places = Array.isArray(data.places) ? data.places : [];
      candidatesReturned += places.length;
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
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      providerError = googleConnectionFailure(e);
      console.warn('[Google Places connection error]: ' + providerError);
      break;
    }
  }
  return {
    places: newUniquePlaces.slice(0, neededCount),
    duplicatesSkipped,
    providerError,
    pagesFetched,
    candidatesReturned
  };
}
const SOCIAL_AND_DIRECTORY_DOMAINS = new Set(['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'yelp.com', 'tripadvisor.com', 'google.com', 'maps.google.com', 'linktr.ee', 'ubereats.com', 'doordash.com', 'grubhub.com', 'deliveroo.com', 'zomato.com', 'swiggy.com', 'apple.com', 'whatsapp.com']);
export function isSocialOrDirectoryDomain(domain) {
  if (!domain || typeof domain !== 'string') return false;
  const d = domain.toLowerCase().replace(/^www\./, '').trim();
  for (const s of SOCIAL_AND_DIRECTORY_DOMAINS) {
    if (d === s || d.endsWith(`.${s}`)) return true;
  }
  return false;
}
const hunterCooldowns = new Map();
export function isHunterQuotaExceeded() {return (hunterCooldowns.get(config.HUNTER_API_KEY) || 0)>Date.now();}
export function resetHunterQuotaState() {hunterCooldowns.clear();}
function pauseHunter(key, status) {hunterCooldowns.set(key,Date.now()+(status===402?3600000:60000));}
export function isHunterEnabled() { return config.HUNTER_ENABLED === true && Boolean(config.HUNTER_API_KEY); }
export async function findEmails(domain) {
  const key=config.HUNTER_API_KEY;

  if (!domain || !isHunterEnabled()) return [];
  if (isSocialOrDirectoryDomain(domain)) return [];
  if (isHunterQuotaExceeded()) return [];
  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(config.HUNTER_API_KEY)}&limit=3`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });
    if ([402,429].includes(response.status)) {
      pauseHunter(key,response.status);
      console.warn('[Hunter.io rate limited]: pausing Hunter requests; website discovery remains active.');
      return [];
    }
    if (!response.ok) {
      console.warn(`[Hunter.io domain-search status ${response.status}]`);
      return [];
    }
    const data = await response.json();
    return Array.isArray(data.data?.emails) ? data.data.emails : [];
  } catch (e) {
    console.warn(`[Hunter.io findEmails error]: ${e.message}`);
    return [];
  }
}
export async function verifyEmail(email) {
  const key=config.HUNTER_API_KEY;

  if (!email || !isHunterEnabled() || isHunterQuotaExceeded()) return 'unknown';
  const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(config.HUNTER_API_KEY)}`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });
    if (response.status === 429) {
      pauseHunter(key);
      return 'unknown';
    }
    if (!response.ok) return 'unknown';
    const data = await response.json();
    return typeof data.data?.status === 'string' ? data.data.status : 'unknown';
  } catch (e) {
    return 'unknown';
  }
}
export async function scrapeEmailsFromWebsite(websiteUrl, domain, options = {}) {
  const targetDomain = domain || extractDomain(websiteUrl);
  if (isSocialOrDirectoryDomain(targetDomain) || !websiteUrl && !targetDomain) return [];
  // Legacy fetchPage injection remains available to isolated tests.
  const crawlOptions = options.fetchPage ? {useCache:false,delayMs:0,fetchResource:async url=>url.endsWith('/robots.txt')?{status:404,body:''}:{status:200,body:await options.fetchPage(url),url,type:'text/html'}} : options;
  const report = await crawlWebsiteContacts(websiteUrl || 'https://'+targetDomain, crawlOptions);
  return report.emails;
}
export async function executeLeadSearch(options) {
  return withStorageOperationLock('lead-search', () => runLeadSearch(options));
}
async function runLeadSearch({
  businessType,
  city,
  country,
  requestedCount = 20,
  mode = 'live',
  actor = null,
  autoDraft = false,
  onProgress = () => {}
}) {
  const {cleanType,cleanCity,cleanCountry,count}=validateSearchInput({businessType,city,country,requestedCount,mode,autoDraft});
  if (actor && !['legacy-admin', 'local-development'].includes(actor.id)) {
    const current = findUser(actor.id);
    if (!current?.active || !publicUser(current).permissions.includes('discover')) throw Object.assign(new Error('Discovery access was revoked.'), {
      statusCode: 403
    });
    actor = publicUser(current);
  }
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

  // Google discovers businesses; website email discovery does not require Hunter.
  if (mode === 'live') {
    if (!config.GOOGLE_API_KEY) {
      const err = new Error('Google Places API key is not configured.');
      err.statusCode = 503;
      throw err;
    }

  }
  const {
    date: today,
    count: usedTodayInit
  } = loadDailyUsage();
  let usedToday = usedTodayInit;
  assertTenantActive();
  const remaining = config.DAILY_LEAD_LIMIT === -1 ? Infinity : Math.max(0, config.DAILY_LEAD_LIMIT - usedToday);
  if (remaining <= 0) {
    const err = new Error(`Daily limit of ${config.DAILY_LEAD_LIMIT} reached for today.`);
    err.statusCode = 429;
    throw err;
  }
  const userRemaining = actor && !['legacy-admin', 'local-development'].includes(actor.id) ? actor.dailyLeadLimit === -1 ? Infinity : Math.max(0, actor.dailyLeadLimit - userUsage(actor.id)) : remaining;
  if (userRemaining <= 0) throw Object.assign(new Error('Your daily discovery quota is exhausted.'), {
    statusCode: 429
  });
  const fetchCount = Math.min(count, remaining, userRemaining);
  const warnings = [];
  if (fetchCount < count) warnings.push('Request reduced to ' + fetchCount + ' by the remaining workspace or account quota.');
  let pagesFetched = 0,
    candidatesReturned = 0;
  const query = `${cleanType} in ${cleanCity}, ${cleanCountry}`;
  const seenMap = loadSeenPlaces();
  const history = loadLeadsHistory();
  const existingLeads = history.leads || [];
  const processedLeads = [];
  let duplicatesSkipped = 0;
  onProgress({
    stage: 'searching',
    processed: 0,
    target: fetchCount,
    query
  });
  const consumeQuota = () => {
    const usage = loadDailyUsage();
    assertTenantActive();
    if (config.DAILY_LEAD_LIMIT !== -1 && usage.count >= config.DAILY_LEAD_LIMIT) return false;
    if (actor && !['legacy-admin', 'local-development'].includes(actor.id)) {
      const current = findUser(actor.id);
      if (!current?.active || !publicUser(current).permissions.includes('discover')) throw Object.assign(new Error('Discovery access was revoked. Completed leads remain saved.'), {
        statusCode: 403
      });
      if (current.daily_lead_limit !== -1 && userUsage(actor.id) >= current.daily_lead_limit) return false;
    }
    saveDailyUsage(usage.date, usage.count + 1);
    consumeUserLead(actor?.id);
    usedToday = usage.count + 1;
    return true;
  };
  // Execute Live APIs
  if (mode === 'live') {
    const searchRes = await searchPlaces(query, fetchCount, seenMap, existingLeads);
    if (searchRes.providerError && searchRes.places.length === 0) {
      const err = new Error(searchRes.providerError);
      err.statusCode = 502;
      throw err;
    }
    if (searchRes.providerError) warnings.push(searchRes.providerError);
    pagesFetched = searchRes.pagesFetched;
    candidatesReturned = searchRes.candidatesReturned;
    const places = searchRes.places || [];
    duplicatesSkipped = searchRes.duplicatesSkipped || 0;
    if (places && places.length > 0) {
      for (let idx = 0; idx < places.length; idx++) {
        if (!consumeQuota()) {
          warnings.push("Discovery stopped at the current quota.");
          break;
        }
        const place = places[idx];
        const placeId = place.id || `live-${Date.now()}-${idx}`;
        const name = place.displayName?.text || `${cleanCity} ${cleanType} ${idx + 1}`;
        const address = place.formattedAddress || `${cleanCity}, ${cleanCountry}`;
        const phone = place.nationalPhoneNumber || '—';
        const website = place.websiteUri || '';
        const domain = extractDomain(website);
        let email = '—';
        let emailStatus = 'not_found';
        let emailCandidates = [];
        if (domain || website) {
          let emails = await scrapeEmailsFromWebsite(website, domain);
          if (!emails.length && domain && !isSocialOrDirectoryDomain(domain)) {
            emails = (await findEmails(domain)).map(item=>({...item,source:'hunter'}));
          }
          emailCandidates = emails.slice(0,20);
          const bestEmailItem = emails.find(item => typeof item?.value === 'string' && item.value.includes('@'));
          const bestEmail = bestEmailItem?.value;
          if (bestEmail) {
            const status = await verifyEmail(bestEmail);
            email = bestEmail;
            emailStatus = status === 'valid' || status === 'deliverable' ? 'deliverable' : ['accept_all', 'webmail', 'risky'].includes(status) ? 'risky' : status === 'invalid' ? 'invalid' : 'unknown';
          }
        }
        const phoneStatus = phone && phone !== '—' ? 'listed' : 'not_found';
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
          emailCandidates,
          emailDiscovery: emailCandidates.find(item=>item.value===email) || null,
          website: website || (domain ? `https://${domain}` : '#'),
          foundAt: today,
          source: 'live',
          discoveredBy: actor?.id || null,
          emailVerification: emailStatus === 'deliverable' ? {
            provider: 'hunter',
            status: 'valid',
            verifiedAt: new Date().toISOString()
          } : null
        };

        // Generate AI Cold Email draft if deliverable
        if (autoDraft && (emailStatus === 'deliverable' || emailStatus === 'valid')) {
          const draft = await generateColdEmail(leadObj);
          leadObj.coldMailDraft = {
            subject: draft.subject,
            body: draft.body,
            status: 'pending_review',
            generatedAt: today
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
          foundAt: today
        };
        processedLeads.push(leadObj);
        // Persist each completed lead so a long batch survives request disconnects or restart.
        saveLeadsHistory({
          ...loadLeadsHistory(),
          leads: [...loadLeadsHistory().leads, leadObj]
        });
        saveSeenPlaces(seenMap);
        onProgress({
          stage: 'enriching',
          processed: processedLeads.length,
          target: fetchCount,
          query
        });
      }
    }
  }

  // Explicit dev-gated simulation execution if mode is simulated
  if (mode === 'simulated') {
    const simLeads = generateSimulatedLeads(cleanType, cleanCity, cleanCountry, fetchCount, seenMap, existingLeads);
    for (const lead of simLeads) {
      if (!consumeQuota()) break;
      if (lead.emailStatus === 'deliverable' || lead.emailStatus === 'valid') {
        const draft = await generateColdEmail(lead, {
          useAI: false
        });
        lead.coldMailDraft = {
          subject: draft.subject,
          body: draft.body,
          status: 'pending_review',
          generatedAt: today
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
        foundAt: today
      };
      processedLeads.push(lead);
    }
  }
  const unverifiedCount = processedLeads.filter(lead=>lead.source==='live' && lead.email?.includes('@') && lead.emailStatus==='unknown').length;
  if (unverifiedCount) warnings.push(unverifiedCount+' email address(es) remain unverified. They can be reviewed and exported; cold outreach requires verification.');
  if (processedLeads.length < fetchCount && mode === 'live') warnings.push('Google returned fewer new businesses than requested; duplicates and provider result limits can reduce the batch.');

  // Persist seenPlaces
  saveSeenPlaces(seenMap);

  // Persist to history
  const currentHistory = loadLeadsHistory();
  const updatedLeads = [...new Map([...currentHistory.leads, ...processedLeads].map(lead => [lead.id, lead])).values()];
  const searches = currentHistory.searches || [];
  const newSearchRecord = {
    id: Date.now(),
    query: `${cleanType} · ${cleanCity}, ${cleanCountry}`,
    count: processedLeads.length,
    duplicatesSkipped,
    requestedCount: count,
    pagesFetched,
    candidatesReturned,
    warnings,
    businessType: cleanType,
    city: cleanCity,
    country: cleanCountry,
    actor: actor?.id || null,
    date: today,
    mode
  };
  searches.unshift(newSearchRecord);
  history.leads = updatedLeads;
  history.searches = searches.slice(0, 50);
  saveLeadsHistory(history);

  // Sync any drafted cold emails to outreach history
  await withOutreachHistoryLock(() => {
    const outreachHistory = loadOutreachHistory();
    for (const lead of processedLeads) {
      if (lead.coldMailDraft) {
        const existingIdx = outreachHistory.findIndex(o => o.leadId === lead.id || o.recipient === lead.email);
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
          createdAt: today
        };
        if (existingIdx >= 0) {
          // A concurrent review or send must never be reset to pending.
          if (outreachHistory[existingIdx].status === 'pending_review') outreachHistory[existingIdx] = outreachRecord;
        } else {
          outreachHistory.unshift(outreachRecord);
        }
      }
    }
    saveOutreachHistory(outreachHistory);
  });
  audit(actor?.id, 'leads.searched', query, {
    requested: count,
    saved: processedLeads.length,
    mode,
    pagesFetched,
    duplicatesSkipped
  });
  return {
    requestedCount: count,
    effectiveCount: fetchCount,
    pagesFetched,
    candidatesReturned,
    warnings,
    leads: processedLeads,
    count: processedLeads.length,
    duplicatesSkipped,
    mode,
    usage: {
      ...loadDailyUsage(),
      limit: config.DAILY_LEAD_LIMIT,
      unlimited: config.DAILY_LEAD_LIMIT === -1,
      remaining: config.DAILY_LEAD_LIMIT === -1 ? null : Math.max(0, config.DAILY_LEAD_LIMIT - loadDailyUsage().count)
    }
  };
}

export function validateSearchInput({businessType,city,country,requestedCount=20,mode='live',autoDraft=false}={}) {
  for (const [label, value] of Object.entries({
    businessType,
    city,
    country
  })) {
    if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f]/.test(value)) throw Object.assign(new Error(label + ' must be text up to 200 characters.'), {
      statusCode: 400
    });
  }
  if (typeof autoDraft !== 'boolean') throw Object.assign(new Error('autoDraft must be boolean.'), {
    statusCode: 400
  });
  const cleanType = businessType.trim();
  const cleanCity = city.trim();
  const cleanCountry = country.trim();
  const count = requestedCount == null || requestedCount === '' ? 20 : Number(requestedCount);
  if (!cleanType || !cleanCity || !cleanCountry) {
    const err = new Error('Business type, city, and country are required.');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(count) || count < 1 || count > 60) {
    const err = new Error('Number to find must be between 1 and 60.');
    err.statusCode = 400;
    throw err;
  }
  if (!['live', 'simulated'].includes(mode)) {
    const err = new Error('Search mode must be live or simulated.');
    err.statusCode = 400;
    throw err;
  }

return {cleanType,cleanCity,cleanCountry,count};
}
