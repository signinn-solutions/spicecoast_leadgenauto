import React, { useState, useRef } from 'react';
import useDialogFocus from '../hooks/useDialogFocus.js';

export default function DataResetControl({ databasePath, onComplete, onNotify }) {
  const [scope, setScope] = useState(null);
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  useDialogFocus(Boolean(scope), dialog, () => { if (!pending) setScope(null); }, '.lf-reset-confirmation');
  const phrase = scope === 'all' ? 'RESET DATA' : 'RESET LEADS';
  const open = value => { setScope(value); setConfirmation(''); setError(''); };
  const reset = async () => {
    if (pending || confirmation !== phrase) return;
    setPending(true);
    try {
      const response = await fetch('/api/admin/system/reset-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, confirmation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Reset failed.');
      setScope(null);
      onNotify?.({ type: 'success', title: 'Data Reset', text: `Data cleared. Accounts and settings retained. Backup: ${result.backupFile}` });
      onComplete?.();
    } catch (error) { setError(error.message); }
    finally { setPending(false); }
  };
  return <div className="lf-panel" style={{ padding: 20, gridColumn: '1 / -1' }}>
    <div style={{ fontSize: 12, overflowWrap: 'anywhere', marginBottom: 12 }}>Database file: <code>{databasePath || 'Loading...'}</code></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" className="lf-btn-secondary sm" onClick={() => open('leads')}>Reset discovered leads</button>
      <button type="button" className="lf-btn-secondary sm" onClick={() => open('all')}>Reset all operational data</button>
    </div>
    {scope && <div className="lf-modal-overlay"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="data-reset-title" tabIndex={-1} className="lf-modal-card" style={{ maxWidth: 480 }}>
      <h3 id="data-reset-title">{scope === 'all' ? 'Reset operational data?' : 'Reset discovered leads?'}</h3>
      <p>Deletes all discovered leads, search history, duplicate tracking, outreach drafts and sent outreach history, and resets discovery usage.{scope === 'all' ? ' Also deletes mailbox history and resets reply usage.' : ' Mailbox history is retained.'}</p>
      <p>Accounts, settings and security audit logs remain. Sent emails cannot be recalled. A backup is required and created automatically before deletion.</p>
      <label>Type <strong>{phrase}</strong> to confirm<input className="lf-input lf-reset-confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending} autoComplete="off" /></label>
      {error && <p role="alert">{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button type="button" className="lf-btn-secondary" disabled={pending} onClick={() => setScope(null)}>Cancel</button>
        <button type="button" className="lf-btn-primary" disabled={pending || confirmation !== phrase} onClick={reset}>{pending ? 'Backing up and resetting...' : 'Confirm reset'}</button>
      </div>
    </div></div>}
  </div>;
}
