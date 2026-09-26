import React, { Suspense, lazy } from "react";
import {
  BarChart3,
  Globe,
  Search,
  CheckCircle2,
  AlertCircle,
  MapPin,
  TrendingUp,
  ArrowRight,
  Database,
  Users,
} from "lucide-react";

const AnalyticsChart = lazy(() => import("../AnalyticsChart.jsx"));

export default function AnalyticsView({
  allLeads = [],
  outreachList = [],
  mailboxMessages = [],
  searchHistory = [],
  onRerunSearch,
}) {
  const isLiveLead = (lead) => lead.source === "live";
  const liveLeads = allLeads.filter(isLiveLead);

  const deliverable = liveLeads.filter(
    (l) => l.emailStatus === "deliverable" || l.emailStatus === "valid"
  ).length;
  const risky = liveLeads.filter(
    (l) => l.emailStatus === "risky" || l.emailStatus === "accept_all"
  ).length;
  const notFound = liveLeads.filter(
    (l) => l.emailStatus === "not_found" || l.emailStatus === "invalid"
  ).length;
  const simulatedCount = allLeads.filter((lead) => lead.source === "simulated").length;
  const unconfirmedCount = allLeads.length - liveLeads.length - simulatedCount;

  const chartData = [
    { name: "Deliverable", value: deliverable, color: "#10b981" },
    { name: "Risky / Accept All", value: risky, color: "#f59e0b" },
    { name: "Not Found", value: notFound, color: "#ef4444" },
    { name: "Simulation", value: simulatedCount, color: "#71717a" },
    { name: "Unconfirmed", value: unconfirmedCount, color: "#64748b" },
  ];

  // Group leads by country
  const countryCounts = {};
  allLeads.forEach((lead) => {
    let country = lead.country;
    if (!country && lead.address) {
      const parts = lead.address.split(",");
      country = parts[parts.length - 1]?.trim();
    }
    country = country || "International";
    countryCounts[country] = (countryCounts[country] || 0) + 1;
  });

  const sortedCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="lf-view-container lf-animate-fade">
      {/* Top Banner */}
      <div className="lf-section-header">
        <div>
          <h2 className="lf-section-title">Commercial Harvest Intelligence</h2>
          <p className="lf-section-subtitle">
            Deliverability distributions, geographic trade markets, and historical search query logs.
          </p>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="lf-stats-grid">
        <div className="lf-stat-card">
          <span className="lf-stat-title">Total Processed Leads</span>
          <div className="lf-stat-number lf-mono">{allLeads.length}</div>
          <span className="lf-stat-subtext">{liveLeads.length} live from Places API</span>
        </div>

        <div className="lf-stat-card">
          <span className="lf-stat-title">Verified Inboxes</span>
          <div className="lf-stat-number lf-mono text-emerald">{deliverable}</div>
          <span className="lf-stat-subtext">Deliverable via Hunter.io</span>
        </div>

        <div className="lf-stat-card">
          <span className="lf-stat-title">Proposals Synthesized</span>
          <div className="lf-stat-number lf-mono text-amber">{outreachList.length}</div>
          <span className="lf-stat-subtext">Saved outreach drafts</span>
        </div>

        <div className="lf-stat-card">
          <span className="lf-stat-title">Inbound Inquiries</span>
          <div className="lf-stat-number lf-mono text-blue">{mailboxMessages.length}</div>
          <span className="lf-stat-subtext">Received via Hostinger Webhook</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="lf-dashboard-grid-2">
        {/* Deliverability Breakdown */}
        <section className="lf-panel">
          <div className="lf-panel-header">
            <div>
              <h3 className="lf-panel-title">Email Deliverability Breakdown</h3>
              <p className="lf-panel-desc">Verification status for live contacts, plus example and unconfirmed records</p>
            </div>
          </div>

          {allLeads.length === 0 ? (
            <div className="lf-empty-state">
              <p>No lead data available to chart. Run a discovery search first.</p>
            </div>
          ) : (
            <div style={{ padding: "10px 0" }}>
              <Suspense fallback={<div className="lf-loading">Loading chart…</div>}>
                <AnalyticsChart data={chartData} />
              </Suspense>
            </div>
          )}
        </section>

        {/* Top Geographic Trade Markets */}
        <section className="lf-panel">
          <div className="lf-panel-header">
            <div>
              <h3 className="lf-panel-title">Top Target Geographic Markets</h3>
              <p className="lf-panel-desc">Geographic distribution of identified importers and distributors</p>
            </div>
            <Globe size={18} className="text-amber" />
          </div>

          {sortedCountries.length === 0 ? (
            <div className="lf-empty-state">
              <p>No geographic data logged yet.</p>
            </div>
          ) : (
            <div className="lf-geo-list">
              {sortedCountries.map(([countryName, count], idx) => {
                const percent = Math.round((count / allLeads.length) * 100);
                return (
                  <div key={idx} className="lf-geo-item">
                    <div className="lf-geo-item-top">
                      <span className="lf-geo-name">{countryName}</span>
                      <span className="lf-geo-count lf-mono">
                        {count} leads ({percent}%)
                      </span>
                    </div>
                    <div className="lf-meter-bar">
                      <div
                        className="lf-meter-fill amber"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Historical Searches Table */}
      <section className="lf-panel" style={{ marginTop: 24 }}>
        <div className="lf-panel-header">
          <div>
            <h3 className="lf-panel-title">Historical Discovery Queries</h3>
            <p className="lf-panel-desc">
              Audit log of past lead searches with 1-click re-run capability
            </p>
          </div>
          <Search size={18} className="text-muted" />
        </div>

        {searchHistory.length === 0 ? (
          <div className="lf-empty-state">
            <p>Your search history logs will appear here after discovery runs.</p>
          </div>
        ) : (
          <div className="lf-history-list">
            {searchHistory.slice(0, 10).map((h) => (
              <div key={h.id} className="lf-history-row">
                <div className="lf-history-query-box">
                  <Search size={14} className="text-amber" />
                  <span className="lf-history-query">{h.query}</span>
                </div>

                <div className="lf-history-meta">
                  <span className="lf-badge-pill green sm">
                    {h.count} leads harvested
                  </span>
                  <span className="lf-history-date lf-mono">
                    {new Date(h.date).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    className="lf-btn-secondary xs"
                    onClick={() => onRerunSearch(h.query)}
                  >
                    <span>Re-run</span>
                    <ArrowRight size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
