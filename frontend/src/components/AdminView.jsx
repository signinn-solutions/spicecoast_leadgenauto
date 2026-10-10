import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
const roles = ['company_admin', 'viewer'];
const emptyUser = {
  name: '',
  email: '',
  role: 'company_admin',
  dailyLeadLimit: -1
};
export default function AdminView({
  currentUser,
  apiBase = '/api/admin',
  tenantName = currentUser.tenant?.name || 'Workspace',
  activeTab,
  showHeader = true,
  showNavigation = true,
  refreshKey = 0,
  onChanged
}) {
  const [internalTab, setTab] = useState('users'),
    [users, setUsers] = useState([]),
    [settings, setSettings] = useState(null),
    [audit, setAudit] = useState([]),
    [deliveries, setDeliveries] = useState([]),
    [suppressions, setSuppressions] = useState([]);
  const [form, setForm] = useState(emptyUser),
    [patch, setPatch] = useState({}),
    [setup, setSetup] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [checks, setChecks] = useState({});
  const tab = activeTab ?? internalTab;
  const [loading, setLoading] = useState(true);
  const request = async (path, method = 'GET', body) => {
    const res = await apiFetch(apiBase + path, {
      method,
      ...(body ? {
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      } : {})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Action failed.');
    return data;
  };
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [u, s, a, d] = await Promise.all([request('/users'), request('/integrations'), request('/audit'), request('/deliveries')]);
      setUsers(u.users);
      setSettings(s);
      setAudit(a.events);
      setDeliveries(d.deliveries);
      setSuppressions(d.suppressions);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [apiBase, refreshKey]);
  const action = async fn => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
      await onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const activation = (email, result) => setSetup({
    email,
    ...result,
    url: window.location.origin + '/#activate=' + result.token + '&email=' + encodeURIComponent(email)
  });
  return <div className="lf-view-container lf-admin-view">
    {showHeader && <div className="lf-section-header"><div><h2 className="lf-section-title">{tenantName} administration</h2><p className="lf-section-subtitle">Signinn-managed company access, integrations and mail operations. Signed in as {currentUser.email}.</p></div><button className="lf-btn-secondary sm" onClick={() => action(async () => {})} disabled={busy || loading}>Refresh</button></div>}
    {showHeader && <p className="lf-section-subtitle">Signinn manages access, subscription limits and provider keys. Company admins discover, draft and send. Viewers can read and export.</p>}
    {showNavigation && <nav className="lf-scope-tabs" aria-label="Company administration sections">{['users', 'integrations', 'automation', 'deliveries', 'audit'].map(t => <button key={t} aria-current={tab === t ? 'page' : undefined} className={'lf-scope-tab ' + (tab === t ? 'active' : '')} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</nav>}
    {error && <p role="alert" className="lf-platform-alert error">{error}</p>}{notice && <p className="lf-platform-alert success" role="status">{notice}</p>}
    {loading && <p className="lf-platform-loading" role="status">Loading company settings…</p>}
    {setup && <section className="lf-panel lf-admin-section"><h2>One-time account activation</h2><p>Share this link privately with {setup.email}. It expires {new Date(setup.expiresAt).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata'
        }) + ' IST'} and can be used once. No email was sent.</p><label htmlFor="activation-link">Activation link</label><input id="activation-link" className="lf-input" readOnly value={setup.url} /><div className="lf-admin-actions"><button className="lf-btn-secondary sm" onClick={async () => {
          try {
            await navigator.clipboard.writeText(setup.url);
            setNotice('Activation link copied.');
          } catch {
            setError('Copy the link from the field.');
          }
        }}>Copy link</button><button className="lf-btn-secondary sm" onClick={() => setSetup(null)}>Dismiss</button></div></section>}
    {tab === 'users' && <>
      {!loading && !users.length && <p className="lf-platform-empty">No company users yet. Create an account below.</p>}
      <section className="lf-panel lf-admin-section"><h2>Create a user</h2><form className="lf-admin-form" onSubmit={e => {
          e.preventDefault();
          action(async () => {
            const data = await request('/users', 'POST', form);
            activation(data.user.email, data.setup);
            setForm(emptyUser);
          });
        }}>
        <label>Name<input className="lf-input" disabled={busy || loading} required maxLength={100} value={form.name} onChange={e => setForm({
              ...form,
              name: e.target.value
            })} /></label>
        <label>Email<input className="lf-input" required type="email" value={form.email} onChange={e => setForm({
              ...form,
              email: e.target.value
            })} /></label>
        <label>Role<select disabled={busy || loading} className="lf-select" value={form.role} onChange={e => setForm({
              ...form,
              role: e.target.value
            })}>{roles.map(r => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}</select></label>
        <label>Daily discoveries (-1 unlimited)<input className="lf-input" disabled={busy || loading} type="number" min={-1} max={10000} required value={form.dailyLeadLimit} onChange={e => setForm({
              ...form,
              dailyLeadLimit: Number(e.target.value)
            })} /></label>
        <div className="lf-admin-form-actions"><button className="lf-btn-primary" disabled={busy || loading}>{busy ? 'Creating…' : 'Create account'}</button></div>
      </form></section>
      <div className="lf-table-container" tabIndex={0} role="region" aria-label="Scrollable management table"><table className="lf-crm-table"><thead><tr><th>Account</th><th>Role</th><th>Daily limit / used</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map(u => <UserRow key={u.id} user={u} currentId={currentUser.id} busy={busy || loading} onSave={value => action(async () => {
              await request('/users/' + u.id, 'PATCH', value);
              setNotice('Account updated. Existing sessions revoked.');
            })} onSetup={() => action(async () => {
              const data = await request('/users/' + u.id + '/setup', 'POST', {});
              activation(u.email, data.setup);
            })} onRevoke={() => action(async () => {
              await request('/users/' + u.id + '/revoke', 'POST', {});
              setNotice('Existing sessions revoked.');
            })} />)}</tbody></table></div>
    </>}
    {tab === 'integrations' && settings && <section className="lf-panel lf-admin-section"><h2>Shared provider settings</h2><p>Keys apply to all users in this workspace. Stored values are encrypted; saved secrets are never returned. Blank secret fields keep the current value. Clear explicitly to remove it.</p>{!settings.encryptionReady && <p role="alert">Set SETTINGS_ENCRYPTION_KEY on the server before saving.</p>}
      <form onSubmit={e => {
        e.preventDefault();
        action(async () => {
          await request('/integrations', 'PUT', patch);
          setPatch({});
          setNotice('Provider settings updated.');
        });
      }}><div className="lf-admin-form">{settings.fields.map(f => <label key={f.key}>{f.label}{f.secret && <span className="lf-section-subtitle"> — {f.configured ? 'configured' : 'missing'}</span>}{f.boolean ? <select disabled={busy || loading} className="lf-select" value={String(patch[f.key] ?? f.value)} onChange={e => setPatch({
              ...patch,
              [f.key]: e.target.value === 'true'
            })}><option value="true">{f.key === 'HUNTER_ENABLED' ? 'Enabled (uses credits)' : 'Yes'}</option><option value="false">{f.key === 'SMTP_SECURE' ? 'No (STARTTLS)' : 'Disabled'}</option></select> : <input disabled={busy || loading} className="lf-input" type={f.secret ? 'password' : f.number ? 'number' : 'text'} autoComplete="off" min={f.min} max={f.max} value={patch[f.key] ?? (f.secret ? '' : f.value ?? '')} placeholder={f.secret ? 'Enter a replacement key' : ''} onChange={e => setPatch(prev => {
              const next = {
                ...prev
              };
              if (f.secret && !e.target.value) delete next[f.key];else next[f.key] = f.number ? Number(e.target.value) : e.target.value;
              return next;
            })} />} {f.secret && <button className="lf-btn-ghost-sm" type="button" disabled={busy} onClick={() => setPatch({
              ...patch,
              [f.key]: ''
            })}>Clear saved key</button>}</label>)}</div><button className="lf-btn-primary" disabled={busy || !settings.encryptionReady || !Object.keys(patch).length}>Save settings</button></form>
      <h3>Connection checks</h3><p>Checks use saved settings and do not send mail. Google requires an actual search and may incur charges.</p><div className="lf-admin-actions">{['hunter', 'deepseek', 'hostinger', 'google'].map(provider => <button key={provider} className="lf-btn-secondary sm" disabled={busy} onClick={() => action(async () => {
          const data = await request('/integrations/check', 'POST', {
            provider
          });
          setChecks(prev => ({
            ...prev,
            [provider]: data
          }));
        })}>Check {provider}</button>)}</div>{Object.entries(checks).map(([p, c]) => <div key={p} role="status"><strong>{p}: {c.ok ? 'Connected' : 'Needs attention'}</strong>{c.reason && <p>{c.reason}</p>}{c.mailboxes && <><p>Accessible mailboxes: {c.mailboxes.map(m => m.address + ' (' + m.resourceId + ')').join(', ') || 'none'}</p><p>Saved sender and resource ID match: {c.senderAccessible ? 'yes' : 'no'}</p></>}</div>)}
    </section>}
    {tab === 'automation' && <AutomationSettings key={refreshKey} request={request} action={action} busy={busy} />}
    {tab === 'deliveries' && <><section className="lf-panel lf-admin-section"><h2>Outbound delivery ledger</h2><p>Sent means accepted by the provider. It does not prove inbox delivery. For uncertain sends, inspect the provider’s Sent folder before reconciling.</p></section>{!loading && !deliveries.length && <p className="lf-platform-empty">No outbound deliveries recorded.</p>}<div className="lf-table-container" tabIndex={0} role="region" aria-label="Scrollable management table"><table className="lf-crm-table"><thead><tr><th>Recipient / subject</th><th>Status</th><th>Time</th><th>Resolution</th></tr></thead><tbody>{deliveries.map(d => <tr key={d.id}><td>{d.recipient}<br />{d.subject}</td><td>{d.status}{d.error && <p>{d.error}</p>}</td><td>{new Date(d.created_at).toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata'
                })}</td><td>{['sending', 'unknown'].includes(d.status) && <div className="lf-admin-actions">{[true, false].map(accepted => <button key={String(accepted)} className="lf-btn-secondary sm" disabled={busy} onClick={() => {
                    if (window.confirm(accepted ? 'Confirm you verified this message was accepted in the provider.' : 'Confirm you verified this message was NOT accepted. This enables retry and may cause duplicates if incorrect.')) action(async () => {
                      await request('/deliveries/' + encodeURIComponent(d.id) + '/reconcile', 'POST', {
                        accepted
                      });
                      setNotice('Delivery reconciled.');
                    });
                  }}>{accepted ? 'Confirmed accepted' : 'Confirmed not sent'}</button>)}</div>}</td></tr>)}</tbody></table></div><section className="lf-panel lf-admin-section"><h2>Do-not-contact list</h2><form className="lf-admin-actions lf-admin-inline-form" onSubmit={e => {
          e.preventDefault();
          const email = new FormData(e.currentTarget).get('email');
          action(async () => {
            await request('/suppressions', 'POST', {
              email
            });
            setNotice('Recipient blocked from all outbound mail.');
          });
        }}><label>Email<input className="lf-input" type="email" name="email" required /></label><button className="lf-btn-secondary sm" disabled={busy}>Block recipient</button></form>{suppressions.map(s => <p key={s.email}>{s.email} — {s.reason}</p>)}</section></>}
    {tab === 'audit' && !loading && !audit.length && <p className="lf-platform-empty">No company audit events yet.</p>}
    {tab === 'audit' && <div className="lf-table-container" tabIndex={0} role="region" aria-label="Scrollable management table"><table className="lf-crm-table"><thead><tr><th>Time</th><th>Actor</th><th>Action / target</th><th>Details</th></tr></thead><tbody>{audit.map(e => <tr key={e.id}><td>{new Date(e.created_at).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata'
              })}</td><td>{users.find(u => u.id === e.actor)?.email || e.actor}</td><td>{e.action}<br />{e.target}</td><td><details><summary>View details</summary><pre className="lf-platform-audit-detail">{JSON.stringify(e.detail, null, 2)}</pre></details></td></tr>)}</tbody></table></div>}
  </div>;
}
function UserRow({
  user,
  currentId,
  busy,
  onSave,
  onSetup,
  onRevoke
}) {
  const [role, setRole] = useState(user.role),
    [limit, setLimit] = useState(user.dailyLeadLimit),
    [active, setActive] = useState(user.active);
  useEffect(() => {
    setRole(user.role);
    setLimit(user.dailyLeadLimit);
    setActive(user.active);
  }, [user.role, user.dailyLeadLimit, user.active]);
  return <tr><td>{user.name}<br />{user.email}{user.id === currentId && ' (you)'}</td><td><select aria-label={'Role for ' + user.email} className="lf-select" value={role} disabled={busy || user.id === currentId} onChange={e => setRole(e.target.value)}>{roles.map(r => <option key={r} value={r}>{r}</option>)}</select></td><td><input aria-label={'Daily discovery limit for ' + user.email + ' (-1 unlimited)'} className="lf-input lf-small-input" type="number" min={0} max={10000} value={limit} disabled={busy} onChange={e => setLimit(Number(e.target.value))} /> / {user.usedToday}</td><td><label><input type="checkbox" checked={active} disabled={busy || user.id === currentId} onChange={e => setActive(e.target.checked)} /> Enabled</label><br />{user.activated ? 'Activated' : 'Awaiting activation'}</td><td><div className="lf-admin-actions"><button className="lf-btn-secondary sm" disabled={busy || role === user.role && limit === user.dailyLeadLimit && active === user.active} onClick={() => onSave({
          role,
          dailyLeadLimit: limit,
          active
        })}>Save</button><button className="lf-btn-secondary sm" disabled={busy} onClick={onSetup}>Password setup</button><button className="lf-btn-secondary sm" disabled={busy} onClick={onRevoke}>Revoke sessions</button></div></td></tr>;
}
function AutomationSettings({
  request,
  action,
  busy
}) {
  const [enabled, setEnabled] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    request('/automation').then(d => {
      if (live) setEnabled(d.auto_send);
    }).catch(e => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, []);
  return <section className="lf-panel lf-admin-section"><h2>Inbound reply automation</h2><p>When enabled, eligible incoming messages can receive an AI reply without review. Cold outreach and follow-ups still require review. Suspension blocks tenant webhook processing and sends.</p>{error && <p role="alert">{error}</p>}<p>Status: {enabled === null ? 'Loading…' : enabled ? 'Enabled' : 'Disabled'}</p><button className="lf-btn-secondary" disabled={busy || enabled === null} onClick={() => action(async () => {
      const d = await request('/automation', 'POST', {
        auto_send: !enabled
      });
      setEnabled(d.auto_send);
    })}>{enabled ? 'Disable automatic replies' : 'Enable automatic replies'}</button></section>;
}
