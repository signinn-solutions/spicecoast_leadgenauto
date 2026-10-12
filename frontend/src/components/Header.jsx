import React from "react";
import {
  Menu,
  RefreshCw,
  Zap,
  Shield,
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

  const viewTitles = {
    dashboard: { title: "Overview", subtitle: "Commercial Pipeline & Activity" },
    search: { title: "Prospector", subtitle: "Find & Enrich B2B Spice Buyers" },
    results: { title: "Leads CRM", subtitle: "Verified Contacts & Company Dossiers" },
    outreach: { title: "Outreach Studio", subtitle: "Personalized AI Pitches & Dispatches" },
    mailbox: { title: "Mailbox", subtitle: "Live Webhook Inquiries & Intent Extraction" },
    analytics: { title: "Analytics", subtitle: "Deliverability Rates & Market Distribution" },
    health: { title: "System Health & Integrations", subtitle: "API Connection Diagnostics & Quotas" },
    admin: { title: "Administration", subtitle: "System Infrastructure, Diagnostics & User Access" },
  };

  const currentInfo = viewTitles[activeView] || {
    title: "SpiceCoast",
    subtitle: "Lead Automation",
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
            className="lf-header-pill lf-user-pill"
            title={`Authenticated as ${currentUser.email} (${currentUser.role})`}
          >
            <span className="lf-user-role">
              {currentUser.role === "superadmin" ? "Superadmin" : "Lead operations"}
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
          title="Sign out of SpiceCoast session"
        >
          <LogOut size={13} />
          <span>Sign Out</span>
        </button>
        {/* Mailbox & Outreach Controls (Leadgen users only) */}
        {currentUser?.role !== "superadmin" && activeView === "mailbox" && (
          <>
            {/* Reply mode belongs to the mailbox workflow */}
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

          </>
        )}

        {/* Admin maintains its own refresh action. */}
        {activeView !== "admin" && <button
          type="button"
          className="lf-header-icon-btn"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh workspace data"
          title="Refresh workspace data"
        >
          <RefreshCw size={15} className={isRefreshing ? "spin" : ""} />
        </button>}
      </div>
    </header>
  );
}
