import React from "react";
import {
  Compass,
  Search,
  Users,
  Send,
  Inbox,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronRight,
  MapPin,
  Mail,
  Phone,
  Globe,
  ArrowRight,
  ShieldCheck,
  Building2,
  Package,
} from "lucide-react";

export default function DashboardView({
  allLeads = [],
  outreachList = [],
  mailboxMessages = [],
  searchHistory = [],
  leadUsage = { count: 0, limit: 50 },
  onNavigate,
  onSelectLead,
  onQuickSearch,
}) {
  const isLiveLead = (lead) => lead.source === "live";
  const isLiveOutreach = (item) =>
    item.source === "live" &&
    allLeads.find((lead) => lead.id === item.leadId)?.source === "live";

  const activateOnKeyDown = (event, action) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

  const liveLeads = allLeads.filter(isLiveLead);
  const totalLeads = allLeads.length;
  const deliverableEmails = liveLeads.filter(
    (l) => l.emailStatus === "deliverable" || l.emailStatus === "valid"
  ).length;
  const validPhones = liveLeads.filter((l) => l.phoneStatus === "valid").length;
  const deliverabilityRate =
    liveLeads.length > 0
      ? Math.round((deliverableEmails / liveLeads.length) * 100)
      : 0;

  const pendingDrafts = outreachList.filter(
    (o) => o.status === "pending_review" && isLiveOutreach(o)
  ).length;
  const sentOutreach = outreachList.filter((o) => o.status === "sent").length;

  // Preset quick searches for one-click discovery
  const quickPicks = [
    { niche: "Spice Importer", city: "Hamburg", country: "Germany", icon: "🇩🇪" },
    { niche: "Food Distributor", city: "Rotterdam", country: "Netherlands", icon: "🇳🇱" },
    { niche: "Gourmet Foods Broker", city: "Dubai", country: "UAE", icon: "🇦🇪" },
    { niche: "Specialty Spice Wholesaler", city: "London", country: "UK", icon: "🇬🇧" },
    { niche: "Organic Commodities", city: "New York", country: "USA", icon: "🇺🇸" },
    { niche: "Ethnic Food Importers", city: "Toronto", country: "Canada", icon: "🇨🇦" },
  ];

  return (
    <div className="lf-view-container lf-animate-fade">
      {/* Top Banner */}
      <div className="lf-hero-banner">
        <div className="lf-hero-content">
          <div className="lf-hero-badge">
            <Sparkles size={13} className="text-amber" />
            <span>Autonomous Commercial B2B Pipeline</span>
          </div>
          <h2 className="lf-hero-title">
            Direct Origin Sourcing to International Importers
          </h2>
          <p className="lf-hero-text">
            Discover verified spice distributors across Europe, the Middle East, and the Americas.
            Synthesize bespoke DeepSeek B2B proposals and automate inbound inquiry triage with zero manual friction.
          </p>
          <div className="lf-hero-actions">
            <button
              type="button"
              className="lf-btn-primary"
              onClick={() => onNavigate("search")}
            >
              <Search size={16} />
              <span>Launch Lead Prospector</span>
              <ChevronRight size={15} />
            </button>
            <button
              type="button"
              className="lf-btn-secondary"
              onClick={() => onNavigate("results")}
            >
              <Users size={16} />
              <span>Browse CRM Database ({totalLeads})</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Metric KPI Cards */}
      <div className="lf-stats-grid">
        {/* Total Leads */}
        <div
          className="lf-stat-card"
          onClick={() => onNavigate("results")}
          onKeyDown={(event) => activateOnKeyDown(event, () => onNavigate("results"))}
          role="button"
          tabIndex={0}
        >
          <div className="lf-stat-top">
            <span className="lf-stat-title">Total Discovered Leads</span>
            <div className="lf-stat-icon-wrap amber">
              <Users size={18} />
            </div>
          </div>
          <div className="lf-stat-number lf-mono">{totalLeads}</div>
          <div className="lf-stat-footer">
            <span className="lf-pill-badge emerald">
              {liveLeads.length} live Places
            </span>
            <span className="lf-stat-subtext">
              {totalLeads - liveLeads.length} demo / unconfirmed
            </span>
          </div>
        </div>

        {/* Deliverable Email Rate */}
        <div
          className="lf-stat-card"
          onClick={() => onNavigate("results")}
          onKeyDown={(event) => activateOnKeyDown(event, () => onNavigate("results"))}
          role="button"
          tabIndex={0}
        >
          <div className="lf-stat-top">
            <span className="lf-stat-title">Email Deliverability</span>
            <div className="lf-stat-icon-wrap emerald">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="lf-stat-number lf-mono text-emerald">
            {deliverabilityRate}%
          </div>
          <div className="lf-stat-footer">
            <span className="lf-pill-badge emerald">
              {deliverableEmails} deliverable
            </span>
            <span className="lf-stat-subtext">Verified via Hunter.io</span>
          </div>
        </div>

        {/* AI Outreach Drafts */}
        <div
          className="lf-stat-card"
          onClick={() => onNavigate("outreach")}
          onKeyDown={(event) => activateOnKeyDown(event, () => onNavigate("outreach"))}
          role="button"
          tabIndex={0}
        >
          <div className="lf-stat-top">
            <span className="lf-stat-title">AI Cold Pitches</span>
            <div className="lf-stat-icon-wrap gold">
              <Send size={18} />
            </div>
          </div>
          <div className="lf-stat-number lf-mono text-amber">
            {pendingDrafts}
          </div>
          <div className="lf-stat-footer">
            <span className="lf-pill-badge gold">{pendingDrafts} pending review</span>
            <span className="lf-stat-subtext">{sentOutreach} dispatched</span>
          </div>
        </div>

        {/* Inbound Inquiries */}
        <div
          className="lf-stat-card"
          onClick={() => onNavigate("mailbox")}
          onKeyDown={(event) => activateOnKeyDown(event, () => onNavigate("mailbox"))}
          role="button"
          tabIndex={0}
        >
          <div className="lf-stat-top">
            <span className="lf-stat-title">Inbound Inquiries</span>
            <div className="lf-stat-icon-wrap blue">
              <Inbox size={18} />
            </div>
          </div>
          <div className="lf-stat-number lf-mono text-blue">
            {mailboxMessages.length}
          </div>
          <div className="lf-stat-footer">
            <span className="lf-pill-badge blue">Live Webhook</span>
            <span className="lf-stat-subtext">Procurement Intent Extracted</span>
          </div>
        </div>
      </div>

      {/* Interactive Pipeline Funnel */}
      <section className="lf-panel lf-pipeline-panel">
        <div className="lf-panel-header">
          <div>
            <h3 className="lf-panel-title">Commercial Conversion Pipeline</h3>
            <p className="lf-panel-desc">
              Track leads through automated discovery, enrichment, cold AI outreach, and inbound buyer response
            </p>
          </div>
          <button
            type="button"
            className="lf-btn-ghost"
            onClick={() => onNavigate("analytics")}
          >
            <span>View Funnel Analytics</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div className="lf-pipeline-steps">
          <div
            className="lf-pipeline-step active"
            onClick={() => onNavigate("search")}
            onKeyDown={(event) => activateOnKeyDown(event, () => onNavigate("search"))}
            role="button"
            tabIndex={0}
          >
            <div className="lf-step-badge">1. Discovery</div>
            <div className="lf-step-count lf-mono">{liveLeads.length}</div>
            <div className="lf-step-name">Businesses Identified</div>
            <div className="lf-step-sub">Google Places Geocoding</div>
          </div>

          <div className="lf-step-arrow">&rarr;</div>

          <div
            className="lf-pipeline-step active"
            onClick={() => onNavigate("results")}
            onKeyDown={(event) => activateOnKeyDown(event, () => onNavigate("results"))}
            role="button"
            tabIndex={0}
          >
            <div className="lf-step-badge">2. Verification</div>
            <div className="lf-step-count lf-mono text-emerald">
              {deliverableEmails}
            </div>
            <div className="lf-step-name">Deliverable Inboxes</div>
            <div className="lf-step-sub">Hunter.io Validation</div>
          </div>

          <div className="lf-step-arrow">&rarr;</div>

          <div
            className="lf-pipeline-step active"
            onClick={() => onNavigate("outreach")}
            onKeyDown={(event) => activateOnKeyDown(event, () => onNavigate("outreach"))}
            role="button"
            tabIndex={0}
          >
            <div className="lf-step-badge">3. Pitch Studio</div>
            <div className="lf-step-count lf-mono text-amber">
              {outreachList.filter(isLiveOutreach).length}
            </div>
            <div className="lf-step-name">AI Drafts Synthesized</div>
            <div className="lf-step-sub">DeepSeek Personalized Specs</div>
          </div>

          <div className="lf-step-arrow">&rarr;</div>

          <div
            className="lf-pipeline-step active"
            onClick={() => onNavigate("outreach")}
            onKeyDown={(event) => activateOnKeyDown(event, () => onNavigate("outreach"))}
            role="button"
            tabIndex={0}
          >
            <div className="lf-step-badge">4. Dispatch</div>
            <div className="lf-step-count lf-mono">{sentOutreach}</div>
            <div className="lf-step-name">Outreach Dispatched</div>
            <div className="lf-step-sub">Hostinger Mailbox API</div>
          </div>

          <div className="lf-step-arrow">&rarr;</div>

          <div
            className="lf-pipeline-step active"
            onClick={() => onNavigate("mailbox")}
            onKeyDown={(event) => activateOnKeyDown(event, () => onNavigate("mailbox"))}
            role="button"
            tabIndex={0}
          >
            <div className="lf-step-badge">5. Buyer Inbound</div>
            <div className="lf-step-count lf-mono text-blue">
              {mailboxMessages.length}
            </div>
            <div className="lf-step-name">Procurement Requests</div>
            <div className="lf-step-sub">Metadata & Intent Triage</div>
          </div>
        </div>
      </section>

      {/* Two-Column Grid: Quick Discovery & Recent Lead Feed */}
      <div className="lf-dashboard-grid-2">
        {/* Quick Launch Picks */}
        <section className="lf-panel">
          <div className="lf-panel-header">
            <div>
              <h3 className="lf-panel-title">1-Click Target Market Discovery</h3>
              <p className="lf-panel-desc">
                High-yield international trade hubs ready for immediate prospecting
              </p>
            </div>
            <Sparkles size={16} className="text-amber" />
          </div>

          <div className="lf-quick-picks-grid">
            {quickPicks.map((pick, idx) => (
              <div
                key={idx}
                className="lf-quick-pick-card"
                onClick={() => onQuickSearch(pick.niche, pick.city, pick.country)}
                onKeyDown={(event) => activateOnKeyDown(event, () => onQuickSearch(pick.niche, pick.city, pick.country))}
                role="button"
                tabIndex={0}
              >
                <div className="lf-pick-top">
                  <span className="lf-pick-flag">{pick.icon}</span>
                  <span className="lf-pick-location">
                    {pick.city}, {pick.country}
                  </span>
                </div>
                <div className="lf-pick-niche">{pick.niche}</div>
                <div className="lf-pick-action">
                  <span>Harvest 15 leads</span>
                  <ArrowRight size={13} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Discovered Leads Feed */}
        <section className="lf-panel">
          <div className="lf-panel-header">
            <div>
              <h3 className="lf-panel-title">Recent Prospect Activity</h3>
              <p className="lf-panel-desc">
                Latest commercial contacts processed and ready for outreach review
              </p>
            </div>
            <button
              type="button"
              className="lf-btn-ghost"
              onClick={() => onNavigate("results")}
            >
              <span>View All ({totalLeads})</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {allLeads.length === 0 ? (
            <div className="lf-empty-state">
              <Search size={32} className="text-muted" />
              <p>No leads in database yet. Run a discovery search to get started.</p>
            </div>
          ) : (
            <div className="lf-recent-leads-list">
              {allLeads.slice(0, 5).map((lead) => {
                const hasDeliverable =
                  lead.emailStatus === "deliverable" || lead.emailStatus === "valid";
                const isSent = lead.coldMailDraft?.status === "sent";

                return (
                  <div
                    key={lead.id}
                    className="lf-recent-lead-item"
                    onClick={() => onSelectLead(lead)}
                    onKeyDown={(event) => activateOnKeyDown(event, () => onSelectLead(lead))}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="lf-recent-lead-info">
                      <div className="lf-recent-lead-name">
                        <span>{lead.name}</span>
                        {!isLiveLead(lead) && (
                          <span className="lf-badge-demo">{lead.source === "simulated" ? "Demo" : "Unconfirmed"}</span>
                        )}
                      </div>
                      <div className="lf-recent-lead-meta">
                        <MapPin size={11} />
                        <span>{lead.address || "Location unspecified"}</span>
                      </div>
                    </div>

                    <div className="lf-recent-lead-badges">
                      {isLiveLead(lead) && hasDeliverable ? (
                        <span className="lf-badge-pill green">
                          <CheckCircle2 size={11} /> Deliverable
                        </span>
                      ) : (
                        <span className="lf-badge-pill muted">
                          {lead.email ? "Risky Email" : "No Email"}
                        </span>
                      )}

                      <span className="lf-btn-icon-sm" title="View company dossier">
                        <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
