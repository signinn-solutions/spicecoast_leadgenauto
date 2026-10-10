import React, { useEffect, useState } from 'react';
const dateInput = value => value ? new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date(value)) : '';
const timestamp = (value, end = false) => value ? new Date(value + (end ? 'T23:59:59.999' : 'T00:00:00') + '+05:30').toISOString() : null;
export default function SubscriptionPanel({
  tenant,
  plans,
  request,
  action,
  busy,
  refreshKey = 0
}) {
  const subscription = tenant.subscription;
  const [form, setForm] = useState(() => ({
      planId: subscription.plan?.id || 'standard',
      status: subscription.status,
      startsAt: dateInput(subscription.startsAt),
      endsAt: dateInput(subscription.endsAt),
      graceUntil: dateInput(subscription.graceUntil),
      openEnded: subscription.status === 'active' && subscription.openEnded,
      note: ''
    })),
    [events, setEvents] = useState([]),
    [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const revision = JSON.stringify(subscription);
  useEffect(() => {
    setForm({
      planId: subscription.plan?.id || 'standard',
      status: subscription.status,
      startsAt: dateInput(subscription.startsAt),
      endsAt: dateInput(subscription.endsAt),
      graceUntil: dateInput(subscription.graceUntil),
      openEnded: subscription.status === 'active' && subscription.openEnded,
      note: ''
    });
    let live = true;
    setLoading(true);
    setError('');
    request('/tenants/' + tenant.id + '/subscription').then(d => {
      if (live) {
        setEvents(d.events);
        setLoading(false);
      }
    }).catch(e => {
      if (live) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [tenant.id, revision, refreshKey]);
  const update = (key, value) => setForm(p => ({
    ...p,
    [key]: value
  }));
  const save = kind => action(async () => {
    await request('/tenants/' + tenant.id + '/subscription', 'PUT', {
      ...form,
      startsAt: timestamp(form.startsAt),
      endsAt: form.openEnded ? null : timestamp(form.endsAt, true),
      graceUntil: form.openEnded ? null : timestamp(form.graceUntil, true),
      action: kind
    });
  });
  return <section className="lf-panel lf-admin-section"><div className="lf-section-header"><div><h2>Subscription and access</h2><p>Access: <strong>{subscription.allowed ? 'Enabled' : 'Blocked'}</strong> · {subscription.phase.replace('_', ' ')} · {subscription.plan?.name || 'No plan'}</p></div></div>
 {subscription.reason && <p role="status">{subscription.reason}</p>}{subscription.openEnded && <p className="lf-subscription-warning">No expiry is configured. This is an open-ended manual access grant, not a dated subscription.</p>}
 <div className="lf-platform-plan-summary">{subscription.plan && <span>{subscription.plan.leadLimit === -1 ? 'Unlimited daily discovery' : subscription.plan.leadLimit + ' leads/day'} · {subscription.plan.replyLimit} reply drafts/day · {subscription.plan.sendLimit} sends/day · {subscription.plan.seatLimit} user seats</span>}</div>
 <p>Signinn records payment externally, then activates or renews access here. No automatic payment collection.</p>{error && <p role="alert">{error}</p>}
 <form className="lf-admin-form" onSubmit={e => {
      e.preventDefault();
      save('update');
    }}>
 <label>Plan<select className="lf-select" disabled={busy} value={form.planId || ''} onChange={e => update('planId', e.target.value)}>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label>Subscription status<select className="lf-select" disabled={busy} value={form.status || 'pending'} onChange={e => setForm(p => ({
          ...p,
          status: e.target.value,
          openEnded: e.target.value === 'active' && p.openEnded
        }))}>{['pending', 'trial', 'active', 'past_due', 'cancelled'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></label>
 <label>Start date (IST)<input className="lf-input" type="date" disabled={busy} value={form.startsAt || ''} onChange={e => update('startsAt', e.target.value)} /></label>
 <label>Last active date (IST)<input className="lf-input" type="date" disabled={busy || form.openEnded} required={!form.openEnded && ['active', 'trial', 'past_due'].includes(form.status)} value={form.endsAt || ''} onChange={e => update('endsAt', e.target.value)} /></label>
 <label>Grace ends on (IST)<input className="lf-input" type="date" required={form.status === 'past_due'} disabled={busy || form.openEnded} value={form.graceUntil || ''} onChange={e => update('graceUntil', e.target.value)} /></label>
 <label className="lf-admin-check"><input type="checkbox" checked={Boolean(form.openEnded)} disabled={busy || form.status !== 'active'} onChange={e => update('openEnded', e.target.checked)} />Explicit open-ended manual access</label>
 <label className="lf-admin-form-wide">Payment reference / internal note<input className="lf-input" disabled={busy} maxLength={500} value={form.note || ''} onChange={e => update('note', e.target.value)} /></label>
 <div className="lf-admin-actions lf-admin-form-actions"><button className="lf-btn-primary" disabled={busy}>Save subscription</button><button type="button" className="lf-btn-secondary" disabled={busy || form.status !== 'active' || form.openEnded || !form.endsAt} onClick={e => {
          if (e.currentTarget.form.reportValidity()) save('renew');
        }}>Record renewal</button></div>
 </form><p>Expiry is enforced on API requests, webhook processing and each new search/send operation. Renewal preserves leads, mailbox and usage. Tenant suspension overrides subscription status.</p>
 <h3>Subscription history</h3>{loading ? <p role="status">Loading subscription history…</p> : events.length ? <div className="lf-table-container" tabIndex={0} role="region" aria-label="Scrollable management table"><table className="lf-crm-table"><thead><tr><th>Time</th><th>Action</th><th>Status / plan</th><th>End date</th><th>Note</th></tr></thead><tbody>{events.map(e => <tr key={e.id}><td>{new Date(e.created_at).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata'
              })}</td><td>{e.action}</td><td>{e.after.status} / {e.after.plan?.name}</td><td>{dateInput(e.after.endsAt) || 'Open-ended'}</td><td>{e.note || '—'}</td></tr>)}</tbody></table></div> : !error && <p>No subscription changes recorded yet.</p>}
 </section>;
}
