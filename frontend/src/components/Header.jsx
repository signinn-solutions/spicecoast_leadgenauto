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
  LogOut,
} from "lucide-react";
import { apiFetch, setSessionToken } from "../api.js";

export default function Header({
  onLogout,
  activeView,
  onOpenMobileSidebar,
  onRefresh,
  isRefreshing,
  mailboxStatus = {},
  onToggleAutoSend,
  isTogglingAutoSend,
  currentUser = null,
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
    admin: { title: "Superadmin Control Center", subtitle: "System Infrastructure, Diagnostics & User Access" },
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

  const handleLogout = async () => {
    if (typeof onLogout === "function") {
      onLogout();
      return;
    }
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setSessionToken("");
    window.dispatchEvent(new Event("session-expired"));
    window.location.reload();
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
        {/* User Persona & Role Badge */}
        {currentUser && (
          <div
            className="lf-header-pill"
            style={{
              background: currentUser.role === "superadmin" ? "rgba(124, 58, 237, 0.15)" : "rgba(217, 119, 6, 0.15)",
              border: currentUser.role === "superadmin" ? "1px solid rgba(124, 58, 237, 0.3)" : "1px solid rgba(217, 119, 6, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            title={`Authenticated as ${currentUser.email} (${currentUser.role})`}
          >
            <span style={{ fontSize: "12px", fontWeight: "600", color: currentUser.role === "superadmin" ? "#7c3aed" : "#d97706" }}>
              {currentUser.role === "superadmin" ? "👑 Superadmin" : "💼 Leadgen"}
            </span>
            <span className="lf-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {currentUser.email}
            </span>
          </div>
        )}

        {/* Prominent Sign Out Button */}
        <button
          type="button"
          className="lf-header-pill btn-pill"
          id="header-signout-btn"
          onClick={handleLogout}
          style={{
            cursor: "pointer",
            background: "rgba(239, 68, 68, 0.15)",
            borderColor: "rgba(239, 68, 68, 0.4)",
            color: "#ef4444",
            fontWeight: "600",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 14px",
            boxShadow: "0 1px 3px rgba(239, 68, 68, 0.2)",
          }}
          title="Sign out of SpiceCoast session"
        >
          <LogOut size={13} />
          <span>Sign Out</span>
        </button>
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
