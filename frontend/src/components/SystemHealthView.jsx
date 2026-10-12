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
  Sliders,
  Cpu,
  Layers,
  Sparkles,
  Loader2,
} from "lucide-react";

export default function SystemHealthView({
  serverStatus = {},
  mailboxStatus = {},
  allLeads = [],
  outreachList = [],
  mailboxMessages = [],
  onCopyWebhook,
  onToggleHunter,
  isTogglingHunter = false,
}) {
  const [copied, setCopied] = React.useState(false);
  const hunterEnabled = serverStatus.hunter_enabled !== false;

  const integrations = [
    {
      name: "Google Places API (New)",
      role: "Geospatial Entity Discovery & Geocoding",
      active: serverStatus.has_google_key,
      statusLabel: serverStatus.has_google_key ? "Configured" : "Not configured",
      statusColor: serverStatus.has_google_key ? "green" : "gold",
      details: serverStatus.has_google_key
        ? "Active API Key Configured"
        : "Missing key (falls back to simulation)",
    },
    {
      name: "Hunter.io API",
      role: "Domain Executive Email Enrichment & MX Verification",
      active: hunterEnabled && serverStatus.has_hunter_key && !serverStatus.hunter_quota_exceeded,
      statusLabel: !hunterEnabled
        ? "Turned Off (Scraper Active)"
        : serverStatus.hunter_quota_exceeded
        ? "Quota Exceeded"
        : serverStatus.has_hunter_key
        ? "Configured"
        : "Not configured",
      statusColor: !hunterEnabled
        ? "purple"
        : serverStatus.has_hunter_key && !serverStatus.hunter_quota_exceeded
        ? "green"
        : "gold",
      details: !hunterEnabled
        ? "Bypassed by operator. Using zero-cost Inbuilt Mail Scraper & MX engine."
        : serverStatus.hunter_quota_exceeded
        ? "Monthly search limit reached (Website scraper fallback active)"
        : serverStatus.has_hunter_key
        ? "Active API Key Configured"
        : "Missing key (falls back to simulation)",
    },
    {
      name: "Inbuilt Mail Scraper Engine",
      role: "Website Contact Crawler & DNS MX Mailbox Verification",
      active: true,
      statusLabel: !hunterEnabled ? "Primary Engine" : "Active (Fallback)",
      statusColor: !hunterEnabled ? "green" : "blue",
      details: !hunterEnabled
        ? "Active as Primary Engine (Hunter.io API bypassed). Free, zero external quotas."
        : "Active as automatic fallback when Hunter.io has no hits or reaches quota limits.",
    },
    {
      name: `${mailboxStatus.ai_provider || "AI"} (${mailboxStatus.groq_model || ""})`,
      role: "Autonomous Proposal Synthesis & Procurement Triage",
      active: mailboxStatus.has_groq_key,
      statusLabel: mailboxStatus.has_groq_key ? "Configured" : "Not configured",
      statusColor: mailboxStatus.has_groq_key ? "green" : "gold",
      details: mailboxStatus.has_groq_key
        ? "AI API key configured"
        : "Missing key (uses built-in export templates)",
    },
    {
      name: "Hostinger Agentic Mailbox API",
      role: "Live B2B Email Sending & Mailbox Dispatch",
      active: mailboxStatus.has_hostinger_token,
      statusLabel: mailboxStatus.has_hostinger_token ? "Configured" : "Not configured",
      statusColor: mailboxStatus.has_hostinger_token ? "green" : "gold",
      details: mailboxStatus.has_hostinger_token
        ? `Bound to ${mailboxStatus.mailbox}`
        : "No token configured (dispatches blocked/simulated)",
    },
    {
      name: "Inbound Webhook Listener",
      role: "Real-time Inquiry Ingestion & Autoresponder",
      active: mailboxStatus.has_webhook_token,
      statusLabel: mailboxStatus.has_webhook_token ? "Configured" : "Not configured",
      statusColor: mailboxStatus.has_webhook_token ? "green" : "gold",
      details: mailboxStatus.has_webhook_token
        ? "Bearer token auth active"
        : "Blocked until a bearer token is configured",
    },
  ];

  const handleCopy = async () => {
    const url = `${window.location.origin}/webhook`;
    if (!(await onCopyWebhook(url))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="lf-view-container lf-animate-fade">
      {/* Top Banner */}
      <div className="lf-section-header">
        <div>
          <h2 className="lf-section-title">System Health & API Monitoring</h2>
          <p className="lf-section-subtitle">
            Diagnostics and runtime controls for lead enrichment, email scraping, AI synthesis, and mail delivery.
          </p>
        </div>
      </div>

      {/* Email Discovery Engine Switch Panel */}
      <section className="lf-panel lf-engine-switch-card">
        <div className="lf-engine-switch-header">
          <div className="lf-engine-switch-title-box">
            <div className="lf-engine-badge">
              <Sliders size={14} className="text-purple" />
              <span>Discovery Engine Configuration</span>
            </div>
            <h3 className="lf-engine-heading">
              Email Enrichment Engine: {hunterEnabled ? "Hunter.io API" : "Inbuilt Mail Scraper"}
            </h3>
            <p className="lf-engine-desc">
              Toggle off Hunter.io to prevent third-party API queries and exclusively use the native, free
              inbuilt website crawler with DNS MX record verification.
            </p>
          </div>

          <div className="lf-switch-control-wrap">
            <div className="lf-switch-labels">
              <span className={`lf-switch-opt ${hunterEnabled ? "active" : ""}`}>
                Hunter.io API
              </span>
              <span className="lf-switch-divider">/</span>
              <span className={`lf-switch-opt ${!hunterEnabled ? "active" : ""}`}>
                Inbuilt Scraper
              </span>
            </div>

            <button
              type="button"
              role="switch"
              id="hunter-engine-toggle"
              aria-checked={hunterEnabled}
              aria-label="Toggle Hunter API vs Inbuilt Mail Scraper"
              className={`lf-toggle-switch ${hunterEnabled ? "is-hunter" : "is-scraper"}`}
              onClick={() => onToggleHunter && onToggleHunter(!hunterEnabled)}
              disabled={isTogglingHunter}
            >
              <span className="lf-toggle-track">
                <span className="lf-toggle-thumb">
                  {isTogglingHunter ? (
                    <Loader2 size={12} className="lf-spin text-purple" />
                  ) : hunterEnabled ? (
                    <Zap size={11} className="text-purple" />
                  ) : (
                    <Globe size={11} className="text-emerald" />
                  )}
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* Engine Status Callout */}
        <div className={`lf-engine-status-banner ${hunterEnabled ? "mode-hunter" : "mode-scraper"}`}>
          <div className="lf-engine-status-icon">
            {hunterEnabled ? (
              <Zap size={18} className="text-purple" />
            ) : (
              <Globe size={18} className="text-emerald" />
            )}
          </div>
          <div className="lf-engine-status-content">
            <div className="lf-engine-status-title">
              {hunterEnabled
                ? "Hunter.io API Active (Commercial)"
                : "Inbuilt Mail Scraper Active (Zero Third-Party Cost)"}
            </div>
            <div className="lf-engine-status-text">
              {hunterEnabled ? (
                <>
                  Lead searches query Hunter.io for executive mailboxes. If monthly quota is exhausted (HTTP 429/402)
                  or no emails are found, searches automatically failover to the built-in crawler.
                </>
              ) : (
                <>
                  Hunter.io API is <strong>turned off</strong>. Lead searches bypass external API calls and directly
                  crawl target websites, parse contact pages, de-obfuscate emails, decode Cloudflare hashes,
                  and verify live DNS MX records with zero credit consumption.
                </>
              )}
            </div>
          </div>
        </div>
      </section>

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
                className={`lf-badge-pill ${item.statusColor || (item.active ? "green" : "gold")}`}
              >
                {item.active ? (
                  <>
                    <CheckCircle2 size={11} /> {item.statusLabel || "Configured"}
                  </>
                ) : (
                  <>
                    <AlertCircle size={11} /> {item.statusLabel || "Not configured"}
                  </>
                )}
              </span>
            </div>
            <div className="lf-integration-detail lf-mono">{item.details}</div>
          </div>
        ))}
      </div>

      {/* Database & Storage Stats */}
      <div className="lf-dashboard-grid-2">
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
              <span>Active Enrichment Mode</span>
              <span className={`lf-badge-pill ${hunterEnabled ? "purple" : "green"} sm`}>
                {hunterEnabled ? "Hunter.io (API)" : "Inbuilt Scraper (Free)"}
              </span>
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
