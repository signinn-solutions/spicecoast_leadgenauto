import React, { useEffect, useState } from 'react';
import { Building2, ShieldCheck, Users, Activity, KeyRound, LogOut, ArrowLeft, RefreshCw } from 'lucide-react';
import { apiFetch } from '../api.js';
import AdminView from './AdminView.jsx';
import SubscriptionPanel from './SubscriptionPanel.jsx';
import PlanManager from './PlanManager.jsx';
export default function PlatformConsole({
  user,
  onLogout
}) {
  const [tab, setTab] = useState('overview'),
    [data, setData] = useState(null),
    [admins, setAdmins] = useState([]),
    [selected, setSelected] = useState(null);
  const [plans, setPlans] = useState([]);
  const [tenantTab, setTenantTab] = useState('overview');
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [setup, setSetup] = useState(null);
  const [form, setForm] = useState({
      name: '',
      slug: '',
      ownerName: '',
      ownerEmail: ''
    }),
    [adminForm, setAdminForm] = useState({
      name: '',
      email: ''
    }),
    [name, setName] = useState('');
  async function request(path, method = 'GET', body) {
    const res = await apiFetch('/api/platform' + path, {
      method,
      ...(body ? {
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      } : {})
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Action failed.');
    return result;
  }
  async function load({
    refreshChildren = true
  } = {}) {
    const [overview, accounts, planData] = await Promise.all([request('/overview'), request('/users'), request('/plans')]);
    setData(overview);
    setAdmins(accounts.users);
    setPlans(planData.plans);
    if (refreshChildren) setRefreshKey(n => n + 1);
  }
  useEffect(() => {
    load().catch(e => setError(e.message));
  }, []);
  async function action(fn) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function activation(account, result) {
    setSetup({
      email: account.email,
      ...result,
      url: window.location.origin + '/#activate=' + result.token + '&email=' + encodeURIComponent(account.email)
    });
  }
  function open(t) {
    setTab('tenants');
    setTenantTab('overview');
    setSelected(t.id);
    setName(t.name);
  }
  const tenants = data?.tenants || [],
    tenant = tenants.find(t => t.id === selected);
  const totals = {
    tenants: tenants.length,
    active: tenants.filter(t => t.subscription.allowed).length,
    users: tenants.reduce((n, t) => n + t.users, 0),
    leads: tenants.reduce((n, t) => n + t.leads, 0),
    uncertain: tenants.reduce((n, t) => n + t.delivery.filter(d => ['unknown', 'sending'].includes(d.status)).reduce((a, d) => a + d.count, 0), 0),
    searches: tenants.reduce((n, t) => n + t.discovery.count, 0)
  };
  const tenantNavigation = [['overview', 'Workspace'], ['subscription', 'Subscription'], ['users', 'Users'], ['integrations', 'Integrations'], ['automation', 'Automation'], ['deliveries', 'Deliveries'], ['audit', 'Audit']];
  const navigation = [['overview', 'Platform overview', Activity], ['tenants', 'Tenants', Building2], ['plans', 'Subscription plans', KeyRound], ['admins', 'Platform administrators', Users], ['audit', 'Platform audit', ShieldCheck]];
  return <div className="lf-platform-shell">
  <a className="lf-platform-skip" href="#platform-content">Skip to main content</a>
  <aside className="lf-platform-nav" aria-label="Signinn platform navigation"><div className="lf-platform-brand"><ShieldCheck size={28} /><div><strong>Signinn Leadgen</strong><span>Platform administration</span></div></div><nav>{navigation.map(([id, label, Icon]) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''} onClick={() => {
          setTab(id);
          setSelected(null);
          setSetup(null);
        }}><Icon size={18} aria-hidden="true" /><span>{label}</span></button>)}</nav><div className="lf-platform-identity"><strong>{user.email}</strong><span>Platform super admin</span>{onLogout ? <button type="button" className="lf-btn-secondary sm" onClick={onLogout}><LogOut size={15} />Sign out</button> : <p className="lf-section-subtitle">Local development access. Create your first account with <code>npm run admin:setup -- admin@signinn.in</code>, then activate it and reload.</p>}</div></aside>
  <div className="lf-platform-main"><header className="lf-platform-header"><div><p className="lf-platform-eyebrow">SIGNINN CONTROL PANEL</p><h1>{tenant ? tenant.name + ' management' : navigation.find(n => n[0] === tab)?.[1]}</h1><p className="lf-section-subtitle">Manage customer workspaces, access, integrations and operational health.</p></div><button className="lf-btn-secondary" disabled={busy || !data && !error} onClick={() => action(async () => {})}><RefreshCw size={16} />Refresh</button></header>
   <main id="platform-content" tabIndex={-1} className="lf-platform-content" aria-busy={busy}>
    {error && <p className="lf-platform-alert error" role="alert">{error}</p>}{notice && <p className="lf-platform-alert success" role="status">{notice}</p>}
    {setup && <section className="lf-panel lf-admin-section"><h2>Activate {setup.email}</h2><p>Share privately. Expires {new Date(setup.expiresAt).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata'
            }) + ' IST'}. No email was sent.</p><label>One-time activation link<input className="lf-input" readOnly value={setup.url} /></label><div className="lf-admin-actions"><button className="lf-btn-secondary" onClick={async () => {
              try {
                await navigator.clipboard.writeText(setup.url);
                setNotice('Activation link copied.');
              } catch {
                setError('Copy the link from the field.');
              }
            }}>Copy link</button><button className="lf-btn-secondary" onClick={() => setSetup(null)}>Dismiss</button></div></section>}
    {!data && !error && <p role="status">Loading platform…</p>}
    {tenant ? <>
      <button className="lf-btn-secondary sm" onClick={() => {
            setTab('tenants');
            setSelected(null);
          }}><ArrowLeft size={16} />Back to tenants</button>
      <div className="lf-platform-tenant-summary"><span className={"lf-platform-status " + (tenant.subscription.allowed ? "enabled" : "blocked")}>{tenant.subscription.allowed ? "Access enabled" : "Access blocked"}</span><span>{tenant.subscription.phase.replaceAll("_", " ")} · {tenant.subscription.plan?.name || "No plan"}</span><span>{tenant.users} users · {tenant.leads} leads</span></div>
      <nav className="lf-platform-section-nav" aria-label="Tenant management sections">{tenantNavigation.map(([id, label]) => <button type="button" key={id} aria-current={tenantTab === id ? "page" : undefined} className={tenantTab === id ? "active" : ""} onClick={() => {
              setTenantTab(id);
              setSetup(null);
            }}>{label}</button>)}</nav>
      {tenantTab === 'overview' && <section className="lf-panel lf-admin-section"><div className="lf-section-header"><div><h2>Workspace details</h2><p>{tenant.active ? 'Active tenant' : 'Suspended tenant'} · {tenant.users} users · {tenant.leads} leads</p></div><button className="lf-btn-secondary" disabled={busy} onClick={() => action(async () => {
                await request('/tenants/' + tenant.id, 'PATCH', {
                  active: !tenant.active
                });
                setNotice(tenant.active ? 'Tenant suspended.' : 'Tenant access restored.');
              })}>{tenant.active ? 'Suspend tenant' : 'Restore access'}</button></div><form className="lf-admin-actions lf-admin-inline-form" onSubmit={e => {
              e.preventDefault();
              action(() => request('/tenants/' + tenant.id, 'PATCH', {
                name
              }));
            }}><label>Tenant name<input className="lf-input" disabled={busy} required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><button className="lf-btn-secondary" disabled={busy}>Save name</button></form><p>Webhook: <code>{tenant.webhookPath}</code>. Configure a separate bearer token in Integrations.</p><p>Discovery today: {tenant.discovery.count} · AI replies today: {tenant.replies.count} · Inbox records: {tenant.inbox}</p></section>}
      {tenantTab === 'subscription' && <SubscriptionPanel tenant={tenant} plans={plans} request={request} action={action} busy={busy} refreshKey={refreshKey} />}
      {!['overview', 'subscription'].includes(tenantTab) && <AdminView key={tenant.id} currentUser={user} tenantName={tenant.name} activeTab={tenantTab} showHeader={false} showNavigation={false} refreshKey={refreshKey} onChanged={() => load({
            refreshChildren: false
          })} apiBase={'/api/platform/tenants/' + tenant.id + '/admin'} />}
    </> : data && <>
      {tab === 'overview' && <><div className="lf-platform-stats">{[['Tenants', totals.tenants], ['Active tenants', totals.active], ['Tenant users', totals.users], ['Saved leads', totals.leads], ['Discovery today', totals.searches], ['Uncertain sends', totals.uncertain]].map(([label, value]) => <section className="lf-panel" key={label}><span>{label}</span><strong>{value}</strong></section>)}</div><section className="lf-panel lf-admin-section"><h2>Operational attention</h2><p>Provider configuration indicates saved keys, not connectivity. Open-ended access grants need a subscription expiry date.</p>{tenants.length ? tenants.map(t => <div className="lf-platform-attention" key={t.id}><div><strong>{t.name}</strong><p>{t.subscription.phase} · {t.subscription.openEnded ? 'No expiry set · ' : ''}{t.integrations.filter(i => i.configured).length} of {t.integrations.length} secrets configured · {t.delivery.filter(d => ['unknown', 'sending'].includes(d.status)).reduce((n, d) => n + d.count, 0)} uncertain sends</p></div><button className="lf-btn-secondary sm" onClick={() => open(t)}>Manage tenant</button></div>) : <p>No tenants yet.</p>}</section></>}
      {tab === 'tenants' && <><section className="lf-panel lf-admin-section"><h2>Create a tenant</h2><p>A new customer starts with an empty workspace and their own administrator. Provider credentials must be configured for that tenant.</p><form className="lf-admin-form" onSubmit={e => {
                e.preventDefault();
                action(async () => {
                  const result = await request('/tenants', 'POST', form);
                  activation(result.owner.user, result.owner.setup);
                  setForm({
                    name: '',
                    slug: '',
                    ownerName: '',
                    ownerEmail: ''
                  });
                  setNotice('Tenant created. Activate a subscription and configure integrations before customer access.');
                });
              }}>{[['name', 'Company / tenant name'], ['slug', 'URL slug'], ['ownerName', 'Company admin name'], ['ownerEmail', 'Company admin email']].map(([key, label]) => <label key={key}>{label}<input className="lf-input" disabled={busy} required type={key === 'ownerEmail' ? 'email' : 'text'} maxLength={key === 'slug' ? 50 : key === 'ownerEmail' ? 254 : 100} pattern={key === 'slug' ? '[a-z0-9][a-z0-9-]*' : undefined} value={form[key]} onChange={e => setForm({
                    ...form,
                    [key]: e.target.value
                  })} /></label>)}<div className="lf-admin-form-actions"><button className="lf-btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create tenant and administrator'}</button></div></form></section><div className="lf-table-container" tabIndex={0} role="region" aria-label="Scrollable management table"><table className="lf-crm-table"><thead><tr><th>Tenant</th><th>Access</th><th>Users</th><th>Leads</th><th>Discovery today</th><th>Manage</th></tr></thead><tbody>{tenants.map(t => <tr key={t.id}><td><strong>{t.name}</strong><br />{t.slug}</td><td><span className={"lf-platform-status " + (t.subscription.allowed ? "enabled" : "blocked")}>{t.subscription.allowed ? "Enabled" : "Blocked"}</span><small className="lf-platform-cell-meta">{t.subscription.phase.replaceAll("_", " ")}</small></td><td>{t.users}</td><td>{t.leads}</td><td>{t.discovery.count}</td><td><button className="lf-btn-secondary sm" onClick={() => open(t)}><KeyRound size={14} />Manage</button></td></tr>)}</tbody></table></div></>}
      {tab === 'plans' && <PlanManager plans={plans} request={request} action={action} busy={busy} />}
      {tab === 'admins' && <><section className="lf-panel lf-admin-section"><h2>Create a platform administrator</h2><p>Platform administrators can manage every tenant. Add customer staff under their tenant instead.</p><form className="lf-admin-form" onSubmit={e => {
                e.preventDefault();
                action(async () => {
                  const result = await request('/users', 'POST', adminForm);
                  activation(result.user, result.setup);
                  setAdminForm({
                    name: '',
                    email: ''
                  });
                });
              }}><label>Name<input className="lf-input" disabled={busy} required maxLength={100} value={adminForm.name} onChange={e => setAdminForm({
                    ...adminForm,
                    name: e.target.value
                  })} /></label><label>Email<input className="lf-input" disabled={busy} required type="email" value={adminForm.email} onChange={e => setAdminForm({
                    ...adminForm,
                    email: e.target.value
                  })} /></label><div className="lf-admin-form-actions"><button className="lf-btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create platform account'}</button></div></form></section><div className="lf-table-container" tabIndex={0} role="region" aria-label="Scrollable management table"><table className="lf-crm-table"><thead><tr><th>Administrator</th><th>Access</th><th>Password</th><th>Actions</th></tr></thead><tbody>{admins.map(a => <tr key={a.id}><td>{a.name}<br />{a.email}</td><td>{a.active ? 'Active' : 'Disabled'}</td><td>{a.activated ? 'Set' : 'Awaiting activation'}</td><td><div className="lf-admin-actions"><button className="lf-btn-secondary sm" disabled={busy || a.id === user.id} onClick={() => action(() => request('/users/' + a.id, 'PATCH', {
                          active: !a.active
                        }))}>{a.active ? 'Disable' : 'Enable'}</button><button className="lf-btn-secondary sm" disabled={busy} onClick={() => action(async () => {
                          const r = await request('/users/' + a.id + '/setup', 'POST');
                          activation(a, r.setup);
                        })}>Password setup</button><button className="lf-btn-secondary sm" disabled={busy || a.id === user.id} onClick={() => action(() => request('/users/' + a.id + '/revoke', 'POST'))}>Revoke sessions</button></div></td></tr>)}</tbody></table></div></>}
      {tab === 'audit' && <div className="lf-table-container" tabIndex={0} role="region" aria-label="Scrollable management table"><table className="lf-crm-table"><thead><tr><th>Time</th><th>Tenant</th><th>Actor</th><th>Action / target</th><th>Details</th></tr></thead><tbody>{(data?.events || []).map(e => <tr key={e.id}><td>{new Date(e.created_at).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata'
                    })}</td><td>{tenants.find(t => t.id === e.tenant_id)?.name || 'Platform / legacy'}</td><td>{admins.find(a => a.id === e.actor)?.email || e.actor}</td><td>{e.action}<br />{e.target}</td><td><details><summary>View details</summary><pre className="lf-platform-audit-detail">{JSON.stringify(e.detail, null, 2)}</pre></details></td></tr>)}</tbody></table></div>}
    </>}
   </main>
  </div>
 </div>;
}
