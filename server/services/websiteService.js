import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19));
  }
  // Only globally routed unicast IPv6; reject mapped IPv4, NAT64, local and multicast.
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0):/i.test(address) && !/^2002:/i.test(address);
  return false;
}
export async function resolvePublicUrl(input, resolver = lookup) {
  const url = new URL(input);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)) throw new Error('Website URL is not allowed.');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') && !isIP(host)) throw new Error('Private website address is blocked.');
  const addresses = isIP(host) ? [{
    address: host,
    family: isIP(host)
  }] : await resolver(host, {
    all: true
  });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Private website address is blocked.');
  return {
    url,
    address: addresses[0]
  };
}
export async function fetchWebsitePage(input, redirects = 0) {
  const {
    url,
    address
  } = await resolvePublicUrl(input);
  const result = await new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'SpiceCoast contact discovery',
        'Accept': 'text/html,application/xhtml+xml'
      },
      lookup: (_host, options, callback) => callback(null, options?.all ? [address] : address.address, address.family)
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        return resolve({
          location: res.headers.location
        });
      }
      const type = res.headers['content-type'] || '';
      if (res.statusCode !== 200 || !/(text\/html|application\/xhtml)/i.test(type)) {
        res.resume();
        return resolve(null);
      }
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 1024 * 1024) {
          req.destroy(new Error('Website response is too large.'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({
        html: Buffer.concat(chunks).toString('utf8')
      }));
    });
    const timer = setTimeout(() => req.destroy(new Error('Website timed out.')), 5000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
  });
  if (result?.location) {
    if (redirects >= 3) throw new Error('Too many website redirects.');
    return fetchWebsitePage(new URL(result.location, url).href, redirects + 1);
  }
  return result?.html || '';
}
