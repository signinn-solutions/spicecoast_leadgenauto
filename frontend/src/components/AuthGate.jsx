import React, { useCallback, useEffect, useState } from 'react';
import LeadFinderApp from '../App.jsx';
import { apiFetch, setSessionToken } from '../api.js';
import { Sprout, Lock, Loader2 } from 'lucide-react';

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
      if (data.csrfToken) setSessionToken(data.csrfToken);
      setSession(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const expire = () => {
      setSessionToken('');
      setSession({ enabled: true, authenticated: false });
      setError('Your session has ended. Please sign in again.');
    };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, [check]);

  const loginWithCreds = async (targetEmail, targetPassword) => {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password: targetPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to sign in.');
      setSessionToken(data.csrfToken);
      setSession(data);
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const login = async (event) => {
    event.preventDefault();
    await loginWithCreds(email, password);
  };

  const logout = async () => {
    try {
      const res = await apiFetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok && res.status !== 401) throw new Error('Could not sign out. Please try again.');
      setSessionToken('');
      setSession({ enabled: true, authenticated: false });
    } catch (err) {
      window.alert(err.message);
    }
  };

  if (session?.authenticated) {
    return (
      <LeadFinderApp
        onLogout={logout}
        currentUser={session.user || { email: session.email, role: 'superadmin', name: 'SuperAdmin' }}
      />
    );
  }

  return (
    <main className="lf-loading-screen" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'var(--bg-main)' }}>
      <section className="lf-panel lf-auth-card" aria-labelledby="auth-title" style={{ width: '100%', maxWidth: '460px', padding: '32px 28px', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-card)', background: 'var(--bg-surface-1)' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'linear-gradient(135deg, #d97706, #7c3aed)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', marginBottom: '14px', boxShadow: '0 8px 16px rgba(217, 119, 6, 0.25)' }}>
            <Sprout size={28} />
          </div>
          <h1 id="auth-title" style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 6px 0', color: 'var(--text-main)', letterSpacing: '-0.5px' }}>
            SpiceCoast Operations
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {checking ? 'Connecting to security gateway…' : 'Sign in to access lead prospecting or system administration.'}
          </p>
        </div>

        {error && (
          <div role="alert" className="lf-auth-error" style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={15} />
            <span>{error}</span>
          </div>
        )}

        {!checking && (
          <form onSubmit={login} className="lf-auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="lf-form-field">
                <label htmlFor="admin-email">Corporate Email Address</label>
                <input
                  id="admin-email"
                  type="email"
                  className="lf-input"
                  placeholder="name@domain.com"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>

              <div className="lf-form-field">
                <label htmlFor="admin-password">Password</label>
                <input
                  id="admin-password"
                  type="password"
                  className="lf-input"
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>

              <button
                type="submit"
                className="lf-btn-primary"
                disabled={busy}
                style={{ marginTop: '8px', padding: '12px', fontSize: '14px', fontWeight: '600', justifyContent: 'center' }}
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <span>Sign In to Dashboard</span>
                )}
              </button>
            </form>
        )}

        {!checking && !session && (
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button type="button" className="lf-btn-secondary sm" onClick={check}>
              Retry Connection
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
