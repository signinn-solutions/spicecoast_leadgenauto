import React, { useState } from 'react';
export default function InboxView({
  messages,
  canSend,
  canDraft,
  onSendReply,
  onDraftReply,
  isSendingReplyId
}) {
  const [selected, setSelected] = useState(null),
    [edits, setEdits] = useState({}),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [drafting, setDrafting] = useState(false);
  const filtered = messages.filter(m => (m.sender + ' ' + m.subject + ' ' + m.status).toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 20)),
    current = Math.min(page, pages),
    visible = filtered.slice((current - 1) * 20, current * 20);
  const message = messages.find(m => m.id === selected) || visible[0];
  const edit = message ? edits[message.id] || {} : {};
  const draft = edit.reply ?? message?.draftReply ?? '',
    subject = edit.subject ?? message?.subject ?? '';
  const change = (field, value) => setEdits(prev => ({
    ...prev,
    [message.id]: {
      ...prev[message.id],
      [field]: value
    }
  }));
  return <section><label>Search inbox<input className="lf-input" value={query} onChange={e => {
        setQuery(e.target.value);
        setPage(1);
        setSelected(null);
      }} placeholder="Sender, subject or status" /></label>
    <div className="lf-mail-inbox"><div className="lf-inbox-list">{visible.map(m => <button key={m.id} className={'lf-btn-secondary ' + (m.id === message?.id ? 'active' : '')} onClick={() => setSelected(m.id)} aria-pressed={m.id === message?.id}><strong>{m.subject}</strong><br />{m.sender}<br />{m.status}{m.source === 'simulated' ? ' · demo' : ''}</button>)}{!visible.length && <p>No messages match.</p>}</div>
    {message && <article className="lf-panel lf-inbox-detail"><h3>{message.subject}</h3><p>{message.sender} → {message.receiver}</p><p>{message.receivedAt} · {message.status}</p>{message.error && <p role="status">{message.error}</p>}<pre>{message.body}</pre>
      {['drafted', 'send_failed'].includes(message.status) ? <><label>Reply subject<input className="lf-input" value={subject} maxLength={500} disabled={!canDraft} onChange={e => change('subject', e.target.value)} /></label><label>Reply body<textarea className="lf-textarea" rows={10} value={draft} disabled={!canDraft} onChange={e => change('reply', e.target.value)} /></label><p>Review product claims and pricing before sending.</p><button className="lf-btn-primary" disabled={!canSend || message.source === 'simulated' || !draft.trim() || isSendingReplyId === message.id} onClick={() => onSendReply({
            ...message,
            subject,
            draftReply: draft
          })}>{isSendingReplyId === message.id ? 'Sending…' : message.source === 'simulated' ? 'Demo — sending disabled' : 'Approve & send reply'}</button></> : ['received', 'ignored'].includes(message.status) ? <button className="lf-btn-secondary" disabled={!canDraft || drafting} onClick={async () => {
          setDrafting(true);
          try {
            await onDraftReply(message);
          } finally {
            setDrafting(false);
          }
        }}>{drafting ? 'Drafting…' : 'Prepare reply draft'}</button> : message.status === 'sent' ? <><h4>Sent reply</h4><pre>{message.sentReply?.body || message.draftReply}</pre></> : <p>Sending is unavailable for this message.</p>}
    </article>}</div>
    <div className="lf-pagination"><span>{filtered.length} messages · page {current} / {pages}</span><div className="lf-admin-actions"><button className="lf-btn-secondary sm" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><button className="lf-btn-secondary sm" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div></div>
  </section>;
}
