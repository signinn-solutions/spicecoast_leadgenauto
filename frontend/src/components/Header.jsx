import React, { useState } from "react";
import {
  Menu,
  RefreshCw,
  Mail,
  Zap,
  Shield,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
} from "lucide-react";

export default function Header({
  onLogout,
  activeView,
  onOpenMobileSidebar,
  onRefresh,
  isRefreshing,
  mailboxStatus = {},
  onToggleAutoSend,
  isTogglingAutoSend,
  onCopyWebhook,
}) {
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const viewTitles = {
    dashboard: { title: "Executive Overview", subtitle: "Commercial Pipeline & Activity" },
    search: { title: "Lead Prospector", subtitle: "Find & Enrich B2B Spice Buyers" },
    results: { title: "Lead Database & CRM", subtitle: "Verified Contacts & Company Dossiers" },
    outreach: { title: "Cold Outreach Studio", subtitle: "Personalized AI Pitches & Dispatches" },
    mailbox: { title: "Inbound Mailbox & Autoresponder", subtitle: "Live Webhook Inquiries & Intent Extraction" },
    analytics: { title: "Harvest Intelligence", subtitle: "Deliverability Rates & Market Distribution" },
    health: { title: "System Health & Integrations", subtitle: "API Connection Diagnostics & Quotas" },
  };

  const currentInfo = viewTitles[activeView] || {
    title: "SpiceCoast",
    subtitle: "Lead Automation",
  };

  const handleCopyWebhook = async () => {
    const url = `${window.location.origin}/webhook`;
    if (!(await onCopyWebhook(url))) return;
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2200);
  };

  return (
    <header className="lf-header">
      <div className="lf-header-left">
        <button
          type="button"
          className="lf-mobile-toggle"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        <div className="lf-header-title-box">
          <h1 className="lf-header-title">{currentInfo.title}</h1>
          <span className="lf-header-subtitle">{currentInfo.subtitle}</span>
        </div>
      </div>

      <div className="lf-header-right">
        {onLogout && <button type="button" className="lf-header-pill btn-pill" onClick={onLogout}>Sign out</button>}
        {/* Mailbox Badge */}
        <div className="lf-header-pill mailbox-pill" title="Primary Dispatch Mailbox">
          <Mail size={13} className="text-amber" />
          <span className="lf-mono text-white">{mailboxStatus.mailbox || "sales@thespicecoast.com"}</span>
        </div>

        {/* Auto-send mode toggle */}
        <button
          type="button"
          className={`lf-header-pill btn-pill ${
            mailboxStatus.auto_send ? "mode-auto" : "mode-review"
          }`}
          onClick={onToggleAutoSend}
          disabled={isTogglingAutoSend}
          title={
            mailboxStatus.auto_send
              ? "Auto-send is active: inbound replies are dispatched automatically if credentials allow"
              : "Review-first mode is active: all replies stay as drafts until human approval"
          }
        >
          {mailboxStatus.auto_send ? (
            <Zap size={13} className="text-amber" />
          ) : (
            <Shield size={13} className="text-emerald" />
          )}
          <span>{mailboxStatus.auto_send ? "Auto-Send Active" : "Review-First Mode"}</span>
        </button>

        {/* Copy Webhook URL */}
        <button
          type="button"
          className="lf-header-pill btn-pill"
          onClick={handleCopyWebhook}
          title="Copy Inbound Webhook URL for Hostinger / external webhook triggers"
        >
          {copiedWebhook ? (
            <>
              <Check size={13} className="text-emerald" />
              <span className="text-emerald">URL Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy Webhook URL</span>
            </>
          )}
        </button>

        {/* Refresh Data */}
        <button
          type="button"
          className="lf-header-icon-btn"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh workspace data"
          title="Refresh workspace data"
        >
          <RefreshCw size={15} className={isRefreshing ? "spin" : ""} />
        </button>
      </div>
    </header>
  );
}
