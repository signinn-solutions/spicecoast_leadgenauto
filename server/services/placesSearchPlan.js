import config from '../config/env.js';
import { normalizePlacesText as normalize } from './googlePlacesClient.js';

const subdivisions = {
  india: {
    Kerala: ['Ernakulam', 'Thrissur', 'Kozhikode', 'Idukki', 'Kottayam', 'Palakkad', 'Kannur', 'Alappuzha', 'Thiruvananthapuram'],
    Maharashtra: ['Mumbai', 'Pune', 'Nashik', 'Nagpur', 'Thane'],
    Gujarat: ['Ahmedabad', 'Surat', 'Rajkot', 'Vadodara', 'Kutch'],
    'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Erode', 'Thoothukudi'],
    Karnataka: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Belagavi'],
    'Andhra Pradesh': ['Guntur', 'Visakhapatnam', 'Krishna', 'Kurnool'],
    Telangana: ['Hyderabad', 'Rangareddy', 'Warangal'],
    Rajasthan: ['Jaipur', 'Jodhpur', 'Kota', 'Udaipur'],
    Delhi: ['New Delhi', 'North Delhi', 'West Delhi'],
    'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Gautam Buddha Nagar'],
    Punjab: ['Ludhiana', 'Amritsar', 'Jalandhar'], Haryana: ['Gurugram', 'Faridabad', 'Karnal'],
    'West Bengal': ['Kolkata', 'Howrah', 'Darjeeling'], 'Madhya Pradesh': ['Indore', 'Bhopal', 'Gwalior'],
    'Bihar': ['Patna', 'Gaya', 'Muzaffarpur'], 'Odisha': ['Khordha', 'Cuttack', 'Sambalpur'],
    Assam: ['Kamrup Metropolitan', 'Jorhat', 'Dibrugarh'], Goa: ['North Goa', 'South Goa'],
    Jharkhand: ['Ranchi', 'Dhanbad'], Chhattisgarh: ['Raipur', 'Durg'], Uttarakhand: ['Dehradun', 'Haridwar'],
    'Himachal Pradesh': ['Solan', 'Shimla'], 'Jammu and Kashmir': ['Jammu', 'Srinagar'],
    Meghalaya: ['East Khasi Hills'], Manipur: ['Imphal West'], Mizoram: ['Aizawl'], Tripura: ['West Tripura'],
    Nagaland: ['Dimapur'], Sikkim: ['Gangtok'], 'Arunachal Pradesh': ['Papum Pare'],
    Puducherry: [], Chandigarh: [], Ladakh: [], Lakshadweep: [], 'Andaman and Nicobar Islands': [], 'Dadra and Nagar Haveli and Daman and Diu': [],
  },
  germany: {
    Hamburg: [], Berlin: [], Bremen: [], 'North Rhine-Westphalia': ['Cologne', 'Düsseldorf', 'Dortmund'],
    Bavaria: ['Munich', 'Nuremberg', 'Augsburg'], 'Lower Saxony': ['Hanover', 'Braunschweig', 'Oldenburg'],
    'Baden-Württemberg': ['Stuttgart', 'Mannheim', 'Karlsruhe'], Hesse: ['Frankfurt', 'Wiesbaden', 'Kassel'],
    'Schleswig-Holstein': ['Kiel', 'Lübeck'], Saxony: ['Leipzig', 'Dresden'],
    'Rhineland-Palatinate': ['Mainz', 'Ludwigshafen'], Brandenburg: ['Potsdam', 'Cottbus'],
    'Saxony-Anhalt': ['Magdeburg', 'Halle'], Thuringia: ['Erfurt', 'Jena'],
    'Mecklenburg-Western Pomerania': ['Rostock', 'Schwerin'], Saarland: ['Saarbrücken'],
  },
  netherlands: {
    'South Holland': ['Rotterdam', 'The Hague', 'Dordrecht'], 'North Holland': ['Amsterdam', 'Haarlem', 'Zaandam'],
    'North Brabant': ['Eindhoven', 'Breda', 'Tilburg'], Utrecht: ['Utrecht', 'Amersfoort'],
    Gelderland: ['Arnhem', 'Nijmegen'], Limburg: ['Venlo', 'Maastricht'], Zeeland: ['Vlissingen', 'Terneuzen'],
    Overijssel: ['Enschede', 'Zwolle'], Flevoland: ['Almere', 'Lelystad'], Groningen: [], Friesland: ['Leeuwarden'], Drenthe: ['Assen', 'Emmen'],
  },
  'united arab emirates': {
    Dubai: ['Deira', 'Al Quoz', 'Jebel Ali'], 'Abu Dhabi': ['Abu Dhabi City', 'Al Ain', 'Mussafah'],
    Sharjah: ['Industrial Area', 'Al Saja’a'], Ajman: ['Al Jurf'], 'Ras Al Khaimah': [], Fujairah: [], 'Umm Al Quwain': [],
  },
};

const smallerAreas = {
  ernakulam: ['Kochi', 'Aluva', 'Angamaly', 'Perumbavoor', 'Kalamassery', 'Muvattupuzha'],
  idukki: ['Kattappana', 'Kumily', 'Nedumkandam', 'Thodupuzha', 'Adimali'],
  thrissur: ['Thrissur City', 'Chalakudy', 'Kodungallur', 'Irinjalakuda'],
};
const countryAliases = { uae: 'united arab emirates', uk: 'united kingdom', usa: 'united states', 'united states of america': 'united states', holland: 'netherlands', deutschland: 'germany' };
const geoKey = value => normalize(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const countryKey = value => countryAliases[geoKey(value)] || geoKey(value);
const contains = (haystack, needle) => Boolean(needle && ` ${haystack} `.includes(` ${needle} `));
const phraseCache = new Map();
const planning = new Map();

function readRegions(list, depth = 0) {
  if (!Array.isArray(list) || depth > 2) return [];
  const used = new Set();
  return list.slice(0, depth === 0 ? 40 : 15).flatMap(region => {
    const name = typeof region?.name === 'string' ? region.name.trim() : '';
    const key = geoKey(name);
    if (!key || name.length > 70 || !/^[\p{L}\p{N}\p{M} .’'()-]+$/u.test(name) || used.has(key)) return [];
    used.add(key);
    return [{ name, children: readRegions(region.children, depth + 1) }];
  });
}

function phraseKey(value) {
  return [...new Set(geoKey(value).split(' ').filter(word => !['and', 'the', 'for', 'of'].includes(word)).map(word =>
    word.replace(/(?:ers?|ing|s)$/, '').replace(/e$/, '')
  ))].sort().join(' ');
}

function validatePhrases(primary, alternatives, niche) {
  const valid = value => typeof value === 'string' && value.trim().length > 2 &&
    value.length <= 120 && !/[\r\n]/.test(value);
  const main = valid(primary) ? primary.trim() : niche;
  const keywords = [main];
  const used = new Set([phraseKey(main)]);
  for (const phrase of Array.isArray(alternatives) ? alternatives.slice(0, 6) : []) {
    if (!valid(phrase)) continue;
    const key = phraseKey(phrase);
    if (!key || used.has(key)) continue;
    used.add(key);
    keywords.push(phrase.trim());
    if (keywords.length === 3) break;
  }
  return keywords;
}

function getPlannerConfig() {
  if (config.DEEPSEEK_API_KEY) {
    return {
      url: 'https://api.deepseek.com/chat/completions',
      apiKey: config.DEEPSEEK_API_KEY,
      model: config.DEEPSEEK_SEARCH_MODEL,
    };
  }
  if (config.GROQ_API_KEY) {
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: config.GROQ_API_KEY,
      model: config.GROQ_MODEL || 'openai/gpt-oss-120b',
    };
  }
  return null;
}

async function requestPlan({ niche, area, country, level, signal, planner }) {
  if (!planner) return null;
  try {
    const timeout = AbortSignal.timeout(8000);
    const response = await fetch(planner.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${planner.apiKey}`, 'Content-Type': 'application/json' },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({
        model: planner.model,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 2600,
        messages: [
          { role: 'system', content: 'Return JSON with primary, alternatives and regions. Write one strong concise Google Places business category or phrase, and at most two distinct business phrases for the same niche. Omit geography from phrases. Use only real subdivisions within the requested area. Return regions as {name, children}, where children are the next level and may be empty. At country level prioritize commercially important administrative states or regions. At state level list districts or cities. At district level list towns or commercial areas. For a city use known commercial districts only. Avoid overlapping regions and spellings of the same region.' },
          { role: 'user', content: JSON.stringify({ niche, area, country, level }) },
        ],
      }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return JSON.parse(result.choices?.[0]?.message?.content || '{}');
  } catch {
    return null;
  }
}

export async function getPlacesPlan({ niche, area, country, geographyLevel, signal, onRequest }) {
  const national = countryKey(country);
  const rootKey = geoKey(area);
  const regions = subdivisions[national] || {};
  const countrySearch = geographyLevel === 'country' || (!geographyLevel && (
    !area || countryKey(area) === national || /^(all|nationwide|all regions|entire country)$/.test(rootKey)
  ));
  const state = Object.keys(regions).find(name => geoKey(name) === rootKey);
  const district = Object.entries(regions).find(([, cities]) => cities.some(city => geoKey(city) === rootKey));
  const level = countrySearch ? 'country' : geographyLevel || (state ? 'state' : district && smallerAreas[rootKey] ? 'district' : 'city');
  const root = countrySearch ? country : area;
  const wrapTowns = towns => (towns || []).map(name => ({ name, children: [] }));
  const wrapDistricts = cities => (cities || []).map(name => ({ name, children: wrapTowns(smallerAreas[geoKey(name)]) }));
  const known = level === 'country' ? Object.entries(regions).map(([name, cities]) => ({ name, children: wrapDistricts(cities) })) :
    level === 'state' ? wrapDistricts(regions[state]) : wrapTowns(smallerAreas[rootKey]);
  const planner = getPlannerConfig();
  const key = JSON.stringify([normalize(niche), rootKey, national, level, planner?.model || '']);
  let generated = null;
  if (planner && !signal?.aborted) {
    const cached = phraseCache.get(key);
    if (cached?.expires > Date.now()) generated = cached.plan;
    else {
      if (!planning.has(key)) {
        onRequest();
        planning.set(key, requestPlan({ niche, area: root, country, level, signal, planner }).finally(() => planning.delete(key)));
      }
      generated = await planning.get(key);
      if (generated) {
        if (phraseCache.size >= 128) phraseCache.delete(phraseCache.keys().next().value);
        phraseCache.set(key, { expires: Date.now() + 86400000, plan: generated });
      }
    }
  }
  const fallback = readRegions(generated?.regions).filter(region => geoKey(region.name) !== geoKey(root) && countryKey(region.name) !== national);
  const byName = new Map(known.map(region => [geoKey(region.name), region]));
  for (const region of fallback) {
    const prior = byName.get(geoKey(region.name));
    if (!prior) {
      if (!known.length) byName.set(geoKey(region.name), region);
    } else if (!prior.children.length) prior.children = region.children;
  }
  return { root: { name: root, children: [...byName.values()] }, level,
    phrases: validatePhrases(generated?.primary, generated?.alternatives, niche) };
}

const nearbyAliases = {
  munchen: ['Munich', 'Muenchen'], munich: ['München', 'Muenchen'], cologne: ['Köln', 'Koeln'],
  koeln: ['Köln', 'Cologne'], nuremberg: ['Nürnberg'], 'the hague': ['Den Haag', 's-Gravenhage'],
  bavaria: ['Bayern'], 'north rhine westphalia': ['Nordrhein-Westfalen'], 'lower saxony': ['Niedersachsen'],
  'south holland': ['Zuid-Holland'], 'north holland': ['Noord-Holland'], 'north brabant': ['Noord-Brabant'],
  'rhineland palatinate': ['Rheinland-Pfalz'], hesse: ['Hessen'], saxony: ['Sachsen'], thuringia: ['Thüringen'],
  bengaluru: ['Bangalore'], mumbai: ['Bombay'], kochi: ['Cochin'],
};
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function matchesPlacesGeography(place, country, area, nationalSearch) {
  const components = place.addressComponents || [];
  const countryComponent = components.find(part => part.types?.includes('country'));
  const expected = countryKey(country);
  const aliases = [expected, ...Object.keys(countryAliases).filter(key => countryAliases[key] === expected)];
  const address = geoKey(place.formattedAddress);
  if (countryComponent) {
    const code = countryComponent.shortText;
    const name = /^[A-Z]{2}$/.test(code || '') ? countryNames.of(code) : '';
    if (![countryComponent.longText, code, name].some(value => countryKey(value) === expected)) return false;
  } else if (!aliases.some(alias => contains(address, alias))) return false;
  if (nationalSearch) return true;
  const areaKey = geoKey(area);
  const areaNames = [areaKey, ...(nearbyAliases[areaKey] || []).map(geoKey)];
  const areas = components.filter(part => !part.types?.includes('country')).flatMap(part => [part.longText, part.shortText]).map(geoKey);
  return areaNames.some(name => contains(address, name) || areas.includes(name));
}

export function matchesPlacesNiche(place, niche, phrase) {
  if (!place.id || !place.displayName?.text) return false;
  const text = geoKey([place.displayName.text, ...(place.types || [])].join(' '));
  const terms = [niche, phrase].map(geoKey);
  const tradeBusiness = /\b(wholesal\w*|distribut\w*|import\w*|export\w*|suppl\w*|manufactur\w*)\b/.test(text);
  const incompatible = [
    /\b(restaurant|cafe|cafeteria|meal takeaway|bar)\b/,
    /\b(school|university|library)\b/,
    /\b(gas station|car repair|car wash|parking)\b/,
    /\b(hospital|dentist|pharmacy)\b/,
    /\b(lodging|hotel|resort)\b/,
  ];
  return !incompatible.some(pattern => pattern.test(text) && !terms.some(term => pattern.test(term)) && !tradeBusiness);
}
