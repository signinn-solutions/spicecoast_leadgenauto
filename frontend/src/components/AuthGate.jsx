import React, { useCallback, useEffect, useState } from 'react';
import LeadFinderApp from '../App.jsx';
import PlatformConsole from './PlatformConsole.jsx';
import { apiFetch, setSessionToken } from '../api.js';
export default function AuthGate() {
  const [activation, setActivation] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('activate'),
      email = params.get('email');
    if (token && email) {
      window.history.replaceState(null, '', window.location.pathname);
      return {
        token,
        email
      };
    }
    return null;
  });
  const [confirmedPassword, setConfirmedPassword] = useState('');
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
      setSession({
        enabled: true,
        authenticated: false
      });
      setError('Your session has ended. Please sign in again.');
    };
    window.addEventListener('session-expired', expire);
    window.addEventListener('subscription-blocked', check);
    return () => {window.removeEventListener('session-expired', expire);window.removeEventListener('subscription-blocked', check);};
  }, [check]);
  const login = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password
        })
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
  const activate = async event => {
    event.preventDefault();
    setError('');
    if (password !== confirmedPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...activation,
          password
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Activation failed.');
      setEmail(activation.email);
      setPassword('');
      setConfirmedPassword('');
      setActivation(null);
      await check();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    try {
      const res = await apiFetch('/api/auth/logout', {
        method: 'POST'
      });
      if (!res.ok && res.status !== 401) throw new Error('Could not sign out. Please try again.');
      setSessionToken('');
      setSession({
        enabled: true,
        authenticated: false
      });
    } catch (err) {
      window.alert(err.message);
    }
  };
  if (!activation && session?.authenticated && session.user?.role!=='super_admin' && session.user?.tenant?.subscription && !session.user.tenant.subscription.allowed) return <main className="lf-loading-screen"><section className="lf-panel lf-auth-card"><h1>{session.user.tenant.name}</h1><p role="status">{session.user.tenant.subscription.reason}</p><p>Signinn manages your subscription. Your workspace records are preserved.</p><button className="lf-btn-primary" disabled={checking} onClick={check}>Check access again</button><button className="lf-btn-secondary" onClick={logout}>Sign out</button>{error && <p role="alert">{error}</p>}</section></main>;
  if (!activation && session?.authenticated) return session.user?.role==='super_admin' ? <PlatformConsole user={session.user} onLogout={session.enabled ? logout : undefined} /> : <LeadFinderApp user={session.user} onLogout={session.enabled ? logout : undefined} />;
  return <main className="lf-loading-screen">
    <section className="lf-panel lf-auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">Signinn Leadgen</h1>
      <p>{activation ? 'Activate your account: ' + activation.email : checking ? 'Checking dashboard access…' : 'Sign in to your company workspace or platform control panel.'}</p>
      {error && <p role="alert" className="lf-auth-error">{error}</p>}
      {activation && <form onSubmit={activate} className="lf-auth-form">
        <label htmlFor="new-password">New password (14–256 characters)</label>
        <input id="new-password" type="password" minLength={14} maxLength={256} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} />
        <label htmlFor="confirm-password">Confirm password</label>
        <input id="confirm-password" type="password" minLength={14} maxLength={256} autoComplete="new-password" value={confirmedPassword} onChange={e => setConfirmedPassword(e.target.value)} required disabled={busy} />
        <button className="lf-btn-primary" disabled={busy}>{busy ? 'Activating…' : 'Set password'}</button>
        <button className="lf-btn-secondary" type="button" onClick={() => {
          setActivation(null);
          setPassword('');
        }}>Return to sign in</button>
      </form>}
      {!activation && !checking && session?.enabled && <form onSubmit={login} className="lf-auth-form">
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
