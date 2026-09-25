import React from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Database,
  Globe,
  Bot,
  Mail,
  Zap,
  Server,
  Key,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";

export default function SystemHealthView({
  serverStatus = {},
  mailboxStatus = {},
  allLeads = [],
  outreachList = [],
  mailboxMessages = [],
  onCopyWebhook,
}) {
  const [copied, setCopied] = React.useState(false);

  const integrations = [
    {
      name: "Google Places API (New)",
      role: "Geospatial Entity Discovery & Geocoding",
      active: serverStatus.has_google_key,
      details: serverStatus.has_google_key
        ? "Active API Key Configured"
        : "Missing key (falls back to simulation)",
    },
    {
      name: "Hunter.io API",
      role: "Domain Executive Email Enrichment & MX Verification",
      active: serverStatus.has_hunter_key,
      details: serverStatus.has_hunter_key
        ? "Active API Key Configured"
        : "Missing key (falls back to simulation)",
    },
    {
      name: `DeepSeek AI (${mailboxStatus.deepseek_model || "deepseek-chat"})`,
      role: "Autonomous Proposal Synthesis & Procurement Triage",
      active: mailboxStatus.has_deepseek_key,
      details: mailboxStatus.has_deepseek_key
        ? "Active DeepSeek API Token"
        : "Missing key (uses built-in export templates)",
    },
    {
      name: "Hostinger Agentic Mailbox API",
      role: "Live B2B Email Sending & Mailbox Dispatch",
      active: mailboxStatus.has_hostinger_token,
      details: mailboxStatus.has_hostinger_token
        ? `Bound to ${mailboxStatus.mailbox}`
        : "No token configured (dispatches blocked/simulated)",
    },
    {
      name: "Inbound Webhook Listener",
      role: "Real-time Inquiry Ingestion & Autoresponder",
      active: mailboxStatus.has_webhook_token,
      details: mailboxStatus.has_webhook_token
        ? "Bearer token auth active"
        : "Unauthenticated (testing mode)",
    },
  ];

  const handleCopy = async () => {
    const url = `${window.location.origin}/webhook`;
    await onCopyWebhook(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="lf-view-container lf-animate-fade">
      {/* Top Banner */}
      <div className="lf-section-header">
        <div>
          <h2 className="lf-section-title">System Health & API Integrations</h2>
          <p className="lf-section-subtitle">
            Diagnostics for external search, enrichment, AI reasoning, and mailbox transport layers.
          </p>
        </div>
      </div>

      {/* Integration Status Cards */}
      <div className="lf-integration-grid">
        {integrations.map((item, idx) => (
          <div key={idx} className="lf-panel lf-integration-card">
            <div className="lf-integration-header">
              <div className="lf-integration-title-box">
                <span className="lf-integration-name">{item.name}</span>
                <span className="lf-integration-role">{item.role}</span>
              </div>
              <span
                className={`lf-badge-pill ${
                  item.active ? "green" : "gold"
                }`}
              >
                {item.active ? (
                  <>
                    <CheckCircle2 size={11} /> Connected
                  </>
                ) : (
                  <>
                    <AlertCircle size={11} /> Offline / Fallback
                  </>
                )}
              </span>
            </div>
            <div className="lf-integration-detail lf-mono">{item.details}</div>
          </div>
        ))}
      </div>

      {/* Database & Storage Stats */}
      <div className="lf-dashboard-grid-2" style={{ marginTop: 24 }}>
        <section className="lf-panel">
          <div className="lf-panel-header">
            <div>
              <h3 className="lf-panel-title">SQLite Database Persistence</h3>
              <p className="lf-panel-desc">Atomic write-safe storage with WAL mode enabled</p>
            </div>
            <Database size={18} className="text-amber" />
          </div>

          <div className="lf-storage-stats-list">
            <div className="lf-storage-item">
              <span>Saved B2B Lead Records</span>
              <span className="lf-mono text-white bold">{allLeads.length}</span>
            </div>
            <div className="lf-storage-item">
              <span>Personalized Cold Outreach Drafts</span>
              <span className="lf-mono text-amber bold">{outreachList.length}</span>
            </div>
            <div className="lf-storage-item">
              <span>Inbound Webhook Messages</span>
              <span className="lf-mono text-emerald bold">{mailboxMessages.length}</span>
            </div>
            <div className="lf-storage-item">
              <span>Concurrency Lock Engine</span>
              <span className="lf-badge-pill green sm">Active (In-Memory Queue)</span>
            </div>
            <div className="lf-storage-item">
              <span>Database Journal Mode</span>
              <span className="lf-badge-pill blue sm">WAL Mode</span>
            </div>
          </div>
        </section>

        {/* Webhook Configuration Guide */}
        <section className="lf-panel">
          <div className="lf-panel-header">
            <div>
              <h3 className="lf-panel-title">Inbound Webhook Deployment</h3>
              <p className="lf-panel-desc">Configure your mail server or form triggers to forward here</p>
            </div>
            <Zap size={18} className="text-emerald" />
          </div>

          <div className="lf-webhook-guide-box">
            <p className="lf-webhook-guide-text">
              Target endpoint for Hostinger mail webhooks, Cloudflare Workers, or CRM Zapier triggers:
            </p>
            <div className="lf-webhook-url-bar">
              <span className="lf-webhook-url-val lf-mono">
                {window.location.origin}/webhook
              </span>
              <button
                type="button"
                className="lf-btn-secondary sm"
                onClick={handleCopy}
              >
                {copied ? <Check size={12} className="text-emerald" /> : <Copy size={12} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <div className="lf-webhook-specs">
              <div className="lf-spec-item">
                <span className="lf-spec-label">Method:</span>
                <span className="lf-mono">POST</span>
              </div>
              <div className="lf-spec-item">
                <span className="lf-spec-label">Content-Type:</span>
                <span className="lf-mono">application/json</span>
              </div>
              <div className="lf-spec-item">
                <span className="lf-spec-label">Auth Header:</span>
                <span className="lf-mono">Bearer &lt;TOKEN&gt;</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
