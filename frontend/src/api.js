let csrfToken = '';
export function setSessionToken(value) { csrfToken = value || ''; }
export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  if (csrfToken && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) headers.set('X-CSRF-Token', csrfToken);
  const response = await window.fetch(url, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401 && !url.includes('/auth/')) window.dispatchEvent(new Event('session-expired'));
  return response;
}
