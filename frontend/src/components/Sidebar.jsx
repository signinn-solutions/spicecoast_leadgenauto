import React, { useEffect, useRef, useState } from "react";
import spiceCoastLogo from "../assets/spice-coast-logo.png";
import useDialogFocus from "../hooks/useDialogFocus.js";
import {
  Compass,
  Search,
  Users,
  Send,
  Inbox,
  BarChart3,
  ShieldCheck,
  ShieldAlert,
  PlusCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Activity,
  Zap,
  X,
  LogOut,
} from "lucide-react";
import { apiFetch, setSessionToken } from "../api.js";

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
  leadUsage = { count: 0, limit: 100 },
  replyUsage = { count: 0, limit: 30 },
  currentUser = null,
  onLogout = null,
}) {
  const sidebarRef = useRef(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    window.matchMedia("(max-width: 768px)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const syncViewport = () => setIsMobileViewport(media.matches);
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.inert = isMobileViewport && !isMobileOpen;
  }, [isMobileViewport, isMobileOpen]);

  useDialogFocus(isMobileViewport && isMobileOpen, sidebarRef, onCloseMobile, ".lf-collapse-btn");

  const leadPercent = Math.min(
    100,
    Math.round(((leadUsage.count || 0) / (leadUsage.limit || 100)) * 100)
  );
  const replyPercent = Math.min(
    100,
    Math.round(((replyUsage.count || 0) / (replyUsage.limit || 30)) * 100)
  );


  const navItems = currentUser?.role === "superadmin"
    ? [
        {
          id: "admin",
          label: "Superadmin",
          icon: ShieldAlert,
          badge: "Admin",
          badgeType: "purple",
          desc: "Health, integrations & users",
        },
      ]
    : [
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
      ];

  return (
    <>
      {isMobileViewport && isMobileOpen && (
        <div
          className="lf-sidebar-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onCloseMobile?.();
          }}
          aria-hidden="true"
        />
      )}

      <aside
        ref={sidebarRef}
        className={`lf-sidebar ${isCollapsed ? "collapsed" : ""} ${
          isMobileOpen ? "mobile-open" : ""
        }`}
        aria-label="Application sidebar"
        aria-hidden={isMobileViewport && !isMobileOpen ? true : undefined}
        aria-modal={isMobileViewport && isMobileOpen ? true : undefined}
        role={isMobileViewport && isMobileOpen ? "dialog" : undefined}
        tabIndex={-1}
      >
        {/* Brand Header */}
        <div className="lf-sidebar-header">
          <div
            className="lf-brand-box"
            onClick={() => {
              onSelectView(currentUser?.role === "superadmin" ? "admin" : "dashboard");
              if (onCloseMobile) onCloseMobile();
            }}
            role="button"
            tabIndex={0}
            aria-label={currentUser?.role === "superadmin" ? "Go to Superadmin Console" : "Go to overview"}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectView(currentUser?.role === "superadmin" ? "admin" : "dashboard");
                onCloseMobile?.();
              }
            }}
          >
            <img className="lf-app-logo" src={spiceCoastLogo} alt="SpiceCoast" width="120" height="56" />
            {!isCollapsed && (
              <div className="lf-brand-info">
                <span className="lf-brand-title">SpiceCoast</span>
                <span className="lf-brand-tagline">
                  {currentUser?.role === "superadmin" ? "Administration" : "Lead Operations"}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="lf-collapse-btn"
            onClick={isMobileViewport ? onCloseMobile : onToggleCollapse}
            aria-label={isMobileViewport ? "Close menu" : isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isMobileViewport ? "Close menu" : isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isMobileViewport ? <X size={15} /> : isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="lf-sidebar-nav" aria-label="Main menu">
          <div className="lf-nav-group-label">
            {!isCollapsed && (currentUser?.role === "superadmin" ? "SUPERADMIN" : "WORKFLOW")}
          </div>
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
                aria-label={item.label}
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
            currentUser?.role === "superadmin" ? (
              <section className="lf-admin-account-card" aria-label="Administrator account">
                <div className="lf-admin-account-header">
                  <span className="lf-admin-account-title">System Core</span>
                  <span className={`lf-status-pill ${serverOnline ? "online" : "offline"}`}>
                    <span className="lf-pulse-dot" />
                    {serverOnline ? "Online" : "Offline"}
                  </span>
                </div>
                <div className="lf-admin-account-role"><ShieldCheck size={14} /><span>Superadmin</span></div>
                <span className="lf-admin-account-email" title={currentUser.email}>{currentUser.email}</span>
                <div className="lf-admin-account-brand">Signinn Solutions</div>
              </section>
            ) : (
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
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div
                className={`lf-collapsed-status ${serverOnline ? "online" : "offline"}`}
                title={`API: ${serverOnline ? "Online" : "Offline"} | Leads: ${
                  leadUsage.count
                }/${leadUsage.limit}`}
              >
                <span className="lf-pulse-dot" />
              </div>

            </div>
          )}
        </div>
      </aside>
    </>
  );
}
