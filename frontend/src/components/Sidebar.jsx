import React from "react";
import {
  Compass,
  Search,
  Users,
  Send,
  Inbox,
  BarChart3,
  ShieldCheck,
  PlusCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sprout,
  Activity,
  Zap,
} from "lucide-react";

export default function Sidebar({
  activeView,
  onSelectView,
  isMobileOpen,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
  leadsCount = 0,
  pendingOutreachCount = 0,
  inboxCount = 0,
  serverOnline = true,
  leadUsage = { count: 0, limit: 50 },
  replyUsage = { count: 0, limit: 30 },
}) {
  const leadPercent = Math.min(
    100,
    Math.round(((leadUsage.count || 0) / (leadUsage.limit || 50)) * 100)
  );
  const replyPercent = Math.min(
    100,
    Math.round(((replyUsage.count || 0) / (replyUsage.limit || 30)) * 100)
  );

  const navItems = [
    {
      id: "dashboard",
      label: "Overview",
      icon: Compass,
      badge: null,
      desc: "Performance & pipeline",
    },
    {
      id: "search",
      label: "Prospector",
      icon: Search,
      badge: null,
      desc: "Discovery & harvest",
    },
    {
      id: "results",
      label: "Leads CRM",
      icon: Users,
      badge: leadsCount > 0 ? leadsCount : null,
      badgeType: "default",
      desc: "Verified contacts & dossier",
    },
    {
      id: "outreach",
      label: "Outreach Studio",
      icon: Send,
      badge: pendingOutreachCount > 0 ? pendingOutreachCount : null,
      badgeType: "gold",
      desc: "AI cold pitches & dispatches",
    },
    {
      id: "mailbox",
      label: "Inbound Mailbox",
      icon: Inbox,
      badge: inboxCount > 0 ? inboxCount : null,
      badgeType: "emerald",
      desc: "Replies & procurement intent",
    },
    {
      id: "analytics",
      label: "Intelligence",
      icon: BarChart3,
      badge: null,
      desc: "Deliverability & analytics",
    },
    {
      id: "health",
      label: "System Health",
      icon: ShieldCheck,
      badge: null,
      desc: "Integrations & API quotas",
    },
  ];

  return (
    <>
      {isMobileOpen && (
        <div
          className="lf-sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`lf-sidebar ${isCollapsed ? "collapsed" : ""} ${
          isMobileOpen ? "mobile-open" : ""
        }`}
        aria-label="Application sidebar"
      >
        {/* Brand Header */}
        <div className="lf-sidebar-header">
          <div
            className="lf-brand-box"
            onClick={() => {
              onSelectView("dashboard");
              if (onCloseMobile) onCloseMobile();
            }}
            role="button"
            tabIndex={0}
          >
            <div className="lf-brand-icon">
              <Sprout size={20} />
            </div>
            {!isCollapsed && (
              <div className="lf-brand-info">
                <span className="lf-brand-title">SpiceCoast</span>
                <span className="lf-brand-tagline">Lead Engine &bull; Pro</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="lf-collapse-btn"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* Quick Launch Action */}
        <div className="lf-sidebar-cta">
          <button
            type="button"
            className="lf-btn-new-discovery"
            onClick={() => {
              onSelectView("search");
              if (onCloseMobile) onCloseMobile();
            }}
            title="Start new prospect discovery"
          >
            <PlusCircle size={16} />
            {!isCollapsed && <span>New Discovery</span>}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="lf-sidebar-nav" aria-label="Main menu">
          <div className="lf-nav-group-label">{!isCollapsed && "WORKFLOW"}</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`lf-nav-item ${isActive ? "active" : ""}`}
                onClick={() => {
                  onSelectView(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                aria-current={isActive ? "page" : undefined}
                title={isCollapsed ? item.label : undefined}
              >
                <span className="lf-nav-item-icon">
                  <Icon size={18} />
                </span>
                {!isCollapsed && (
                  <div className="lf-nav-item-content">
                    <span className="lf-nav-item-label">{item.label}</span>
                    <span className="lf-nav-item-desc">{item.desc}</span>
                  </div>
                )}
                {!isCollapsed && item.badge !== null && (
                  <span className={`lf-nav-badge ${item.badgeType || "default"}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Quota & Status Panel */}
        <div className="lf-sidebar-footer">
          {!isCollapsed ? (
            <div className="lf-quota-card">
              <div className="lf-quota-header">
                <span className="lf-quota-title">Daily Operations Quota</span>
                <span className={`lf-status-pill ${serverOnline ? "online" : "offline"}`}>
                  <span className="lf-pulse-dot" />
                  {serverOnline ? "Online" : "Offline"}
                </span>
              </div>

              {/* Lead Search Usage */}
              <div className="lf-quota-meter">
                <div className="lf-meter-label">
                  <span>Lead Discovery</span>
                  <span className="lf-mono">
                    {leadUsage.count}/{leadUsage.limit}
                  </span>
                </div>
                <div className="lf-meter-bar">
                  <div
                    className="lf-meter-fill amber"
                    style={{ width: `${leadPercent}%` }}
                  />
                </div>
              </div>

              {/* AI Reply Usage */}
              <div className="lf-quota-meter">
                <div className="lf-meter-label">
                  <span>AI Inbound Replies</span>
                  <span className="lf-mono">
                    {replyUsage.count}/{replyUsage.limit}
                  </span>
                </div>
                <div className="lf-meter-bar">
                  <div
                    className="lf-meter-fill emerald"
                    style={{ width: `${replyPercent}%` }}
                  />
                </div>
              </div>

              <div className="lf-footer-origin">
                <span>Direct Sourcing &bull; Cochin, India</span>
              </div>
            </div>
          ) : (
            <div
              className={`lf-collapsed-status ${serverOnline ? "online" : "offline"}`}
              title={`API: ${serverOnline ? "Online" : "Offline"} | Leads: ${
                leadUsage.count
              }/${leadUsage.limit}`}
            >
              <span className="lf-pulse-dot" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
