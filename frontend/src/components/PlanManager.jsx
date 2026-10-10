import React, { useState, useRef } from 'react';
const empty = {
  name: '',
  leadLimit: -1,
  replyLimit: 30,
  sendLimit: 50,
  seatLimit: 10
};
export default function PlanManager({
  plans,
  request,
  action,
  busy
}) {
  const nameInput = useRef(null);
  const [id, setId] = useState(null),
    [form, setForm] = useState(empty);
  return <><section className="lf-panel lf-admin-section"><h2>{id ? 'Edit plan' : 'Create plan'}</h2><p>Plan limits are shared by company users. Editing a plan changes every assigned company. Discovery: -1 means no daily cap. Zero disables a daily operation. User seats include active accounts awaiting activation.</p><form className="lf-admin-form" onSubmit={e => {
        e.preventDefault();
        action(async () => {
          await request(id ? '/plans/' + id : '/plans', id ? 'PATCH' : 'POST', form);
          setId(null);
          setForm(empty);
        });
      }}><label>Plan name<input ref={nameInput} className="lf-input" disabled={busy} required maxLength={100} value={form.name} onChange={e => setForm({
            ...form,
            name: e.target.value
          })} /></label>{[['leadLimit', 'New leads per day (-1 unlimited)'], ['replyLimit', 'AI reply drafts per day'], ['sendLimit', 'Outbound sends per day'], ['seatLimit', 'Active users']].map(([key, label]) => <label key={key}>{label}<input disabled={busy} className="lf-input" type="number" required min={key === 'seatLimit' ? 1 : key === 'leadLimit' ? -1 : 0} max={key === 'seatLimit' ? 1000 : 10000} value={form[key]} onChange={e => setForm({
            ...form,
            [key]: Number(e.target.value)
          })} /></label>)}<div className="lf-admin-actions lf-admin-form-actions"><button className="lf-btn-primary" disabled={busy}>Save plan</button>{id && <button type="button" className="lf-btn-secondary" onClick={() => {
            setId(null);
            setForm(empty);
          }}>Cancel edit</button>}</div></form></section>{!plans.length && <p className="lf-platform-empty">No subscription plans yet.</p>}<div className="lf-table-container" tabIndex={0} role="region" aria-label="Scrollable management table"><table className="lf-crm-table"><caption className="lf-sr-only">Subscription plans and daily limits</caption><thead><tr><th>Plan</th><th>Leads/day</th><th>Reply drafts/day</th><th>Sends/day</th><th>Users</th><th>Edit</th></tr></thead><tbody>{plans.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.leadLimit === -1 ? 'Unlimited' : p.leadLimit}</td><td>{p.replyLimit}</td><td>{p.sendLimit}</td><td>{p.seatLimit}</td><td><button className="lf-btn-secondary sm" disabled={busy} onClick={() => {
                setId(p.id);
                setForm(p);
                nameInput.current?.focus();
              }}>Edit plan</button></td></tr>)}</tbody></table></div></>;
}
