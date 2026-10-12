import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function WebhookConfiguration({ configured, onCopyWebhook }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/webhook`;

  const handleCopy = async () => {
    if (!(await onCopyWebhook(url))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="lf-panel" aria-labelledby="admin-webhook-title">
      <div className="lf-panel-header">
        <div>
          <h3 className="lf-panel-title" id="admin-webhook-title">Inbound webhook</h3>
          <p className="lf-panel-desc">Forward incoming inquiries from your mail server or forms.</p>
        </div>
        <span className={`lf-badge-pill ${configured ? "green" : "gold"}`}>
          {configured ? "Configured" : "Token required"}
        </span>
      </div>
      <div className="lf-webhook-url-bar">
        <span className="lf-webhook-url-val lf-mono">{url}</span>
        <button type="button" className="lf-btn-secondary sm" onClick={handleCopy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy URL"}</span>
        </button>
      </div>
      <div className="lf-webhook-specs">
        <div className="lf-spec-item"><span className="lf-spec-label">Method:</span><span className="lf-mono">POST</span></div>
        <div className="lf-spec-item"><span className="lf-spec-label">Content-Type:</span><span className="lf-mono">application/json</span></div>
        <div className="lf-spec-item"><span className="lf-spec-label">Authorization:</span><span className="lf-mono">Bearer &lt;TOKEN&gt;</span></div>
      </div>
    </section>
  );
}
