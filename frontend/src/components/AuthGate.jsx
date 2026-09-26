import React, { useCallback, useEffect, useState } from 'react';
import LeadFinderApp from '../App.jsx';
import { apiFetch, setSessionToken } from '../api.js';

export default function AuthGate() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const check = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/session');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to check dashboard access.');
      setSessionToken(data.csrfToken);
      setSession(data);
    } catch (err) { setError(err.message); } finally { setChecking(false); }
  }, []);
  useEffect(() => {
    check();
    const expire = () => { setSessionToken(''); setSession({ enabled: true, authenticated: false }); setError('Your session has ended. Please sign in again.'); };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, [check]);
  const login = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await apiFetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to sign in.');
      setSessionToken(data.csrfToken); setSession(data); setPassword('');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const logout = async () => {
    try {
      const res = await apiFetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok && res.status !== 401) throw new Error('Could not sign out. Please try again.');
      setSessionToken(''); setSession({ enabled: true, authenticated: false });
    } catch (err) { window.alert(err.message); }
  };
  if (session?.authenticated) return <LeadFinderApp onLogout={session.enabled ? logout : undefined} />;
  return <main className="lf-loading-screen">
    <section className="lf-panel lf-auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">SpiceCoast</h1>
      <p>{checking ? 'Checking dashboard access…' : 'Sign in to your lead operations dashboard.'}</p>
      {error && <p role="alert" className="lf-auth-error">{error}</p>}
      {!checking && session?.enabled && <form onSubmit={login} className="lf-auth-form">
        <label htmlFor="admin-email">Email</label>
        <input id="admin-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} />
        <label htmlFor="admin-password">Password</label>
        <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} />
        <button className="lf-btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>}
      {!checking && !session && <button className="lf-btn-secondary" onClick={check}>Retry connection</button>}
    </section>
  </main>;
}
