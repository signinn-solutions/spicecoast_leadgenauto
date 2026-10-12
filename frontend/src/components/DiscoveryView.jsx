import React, { useState } from "react";
import {
  Search,
  Sparkles,
  Globe,
  MapPin,
  Tag,
  Database,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Zap,
  Sliders,
  Building2,
  ArrowRight,
  ShieldCheck,
  Check,
} from "lucide-react";
import { SPICE_PRESET_CATEGORIES } from "../constants/spicePresets";

export default function DiscoveryView({
  businessType,
  setBusinessType,
  city,
  setCity,
  country,
  setCountry,
  count,
  setCount,
  searching,
  searchProgress,
  onSearch,
  leadLimit = 200,
  remainingLeads = 200,
  lastSearchInfo,
  onViewResults,
  discoveryEngine = "scraper",
  onToggleEngine,
  isTogglingHunter = false,
}) {
  const cityPresets = [
    { city: "Hamburg", country: "Germany" },
    { city: "Rotterdam", country: "Netherlands" },
    { city: "Dubai", country: "UAE" },
    { city: "London", country: "United Kingdom" },
    { city: "New York", country: "United States" },
    { city: "Singapore", country: "Singapore" },
  ];

  const countPresets = [10, 25, 50, 100, 200];
  const isHunter = discoveryEngine === "hunter";

  return (
    <div className="lf-view-container lf-animate-fade">
      {/* Header Info */}
      <div className="lf-section-header">
        <div>
          <p className="lf-section-subtitle">
            Choose a buyer segment and location to find contacts.
          </p>
        </div>
        <div className="lf-quota-badge-top">
          <span className="lf-quota-badge-label">Remaining Daily Quota:</span>
          <span className="lf-quota-badge-val lf-mono">{remainingLeads} / {leadLimit}</span>
        </div>
      </div>

      {lastSearchInfo?.warnings?.length > 0 && (
        <div className="lf-panel" role="status">
          {lastSearchInfo.warnings.map((warning, index) => <p className="lf-panel-desc" key={index}>{warning}</p>)}
        </div>
      )}
      {/* Last Search Feedback Banner */}
      {lastSearchInfo && (
        lastSearchInfo.count > 0 ? (
          <div className="lf-search-complete-banner">
            <div className="lf-banner-left">
              <CheckCircle2 size={18} className="text-emerald" />
              <div>
                <div className="lf-banner-title">
                  Search complete
                </div>
                <div className="lf-banner-text">
                  Added <strong>{lastSearchInfo.count}</strong> new contact{lastSearchInfo.count === 1 ? "" : "s"} to your CRM.
                  {lastSearchInfo.duplicatesSkipped > 0 && (
                    <> Skipped <strong>{lastSearchInfo.duplicatesSkipped}</strong> existing contact{lastSearchInfo.duplicatesSkipped === 1 ? "" : "s"}.</>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="lf-btn-primary sm"
              onClick={onViewResults}
            >
              <span>View Leads in CRM</span>
              <ArrowRight size={14} />
            </button>
          </div>
        ) : lastSearchInfo.duplicatesSkipped > 0 ? (
          <div className="lf-search-complete-banner" style={{ borderLeft: "4px solid #3b82f6", background: "rgba(59, 130, 246, 0.05)" }}>
            <div className="lf-banner-left">
              <Info size={20} className="text-blue" />
              <div>
                <div className="lf-banner-title" style={{ color: "#1d4ed8" }}>
                  All Discovered Prospects Already in Your CRM
                </div>
                <div className="lf-banner-text">
                  Found matching businesses for this search, but all <strong>{lastSearchInfo.duplicatesSkipped}</strong> record(s) already exist in your local CRM database. Duplicates were automatically skipped to prevent redundant outreach.
                </div>
              </div>
            </div>
            <button
              type="button"
              className="lf-btn-secondary sm"
              onClick={onViewResults}
              style={{ borderColor: "rgba(59, 130, 246, 0.4)", color: "#2563eb" }}
            >
              <span>View in CRM</span>
              <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          <div className="lf-search-complete-banner" style={{ borderLeft: "4px solid #f59e0b", background: "rgba(245, 158, 11, 0.06)", flexDirection: "column", alignItems: "stretch", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
              <div className="lf-banner-left" style={{ alignItems: "flex-start" }}>
                <AlertTriangle size={20} style={{ color: "#d97706", marginTop: "2px", flexShrink: 0 }} />
                <div>
                  <div className="lf-banner-title" style={{ color: "#b45309" }}>
                    {lastSearchInfo.contactsMissing > 0 ? "No published contact details found" : "No new contacts found"}
                  </div>
                  <div className="lf-banner-text" style={{ color: "#475569" }}>
                    No new contacts were saved for <em>"{lastSearchInfo.query?.businessType || businessType}"</em> in <em>{lastSearchInfo.query?.city || city}, {lastSearchInfo.query?.country || country}</em>.
                    {lastSearchInfo.contactsMissing > 0
                      ? ` Found ${lastSearchInfo.contactsMissing} businesses without a published phone or email.`
                      : " Try a broader buyer segment or another location."}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick 1-Click Alternative Queries */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingTop: "8px", borderTop: "1px solid rgba(245, 158, 11, 0.2)" }}>
              <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#b45309", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Adjust your search:
              </span>
              <button
                type="button"
                className="lf-btn-secondary sm"
                onClick={() => {
                  setBusinessType("Spice & Food Ingredient Importer");
                }}
                style={{ fontSize: "11px", padding: "4px 9px", background: "#ffffff" }}
              >
                <span>Broader: Spice & Food Importers</span>
              </button>
              <button
                type="button"
                className="lf-btn-secondary sm"
                onClick={() => {
                  setCity("Hamburg");
                  setCountry("Germany");
                }}
                style={{ fontSize: "11px", padding: "4px 9px", background: "#ffffff" }}
              >
                <MapPin size={11} />
                <span>Hamburg, Germany</span>
              </button>
              <button
                type="button"
                className="lf-btn-secondary sm"
                onClick={() => {
                  setCity("Rotterdam");
                  setCountry("Netherlands");
                }}
                style={{ fontSize: "11px", padding: "4px 9px", background: "#ffffff" }}
              >
                <MapPin size={11} />
                <span>Rotterdam, Netherlands</span>
              </button>
              <button
                type="button"
                className="lf-btn-secondary sm"
                onClick={() => {
                  setCity("Dubai");
                  setCountry("UAE");
                }}
                style={{ fontSize: "11px", padding: "4px 9px", background: "#ffffff" }}
              >
                <MapPin size={11} />
                <span>Dubai, UAE</span>
              </button>
            </div>
          </div>
        )
      )}

      {/* Search Builder Card */}
      <div className="lf-panel lf-search-panel">
        <form onSubmit={onSearch}>
          <div className="lf-form-grid">
            {/* Target Niche / Business Type */}
            <div className="lf-form-field span-2">
              <label htmlFor="business-type">
                <Tag size={13} className="text-amber" />
                <span>Target Business Sector / Niche</span>
              </label>
              <input
                id="business-type"
                type="text"
                className="lf-input"
                placeholder="e.g. Spice Importer, Food Ingredients, Tea & Herb Blender"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                disabled={searching}
                required
              />
              <details className="lf-preset-disclosure">
                <summary>Browse buyer segments</summary>
                <div className="lf-preset-groups">
                {SPICE_PRESET_CATEGORIES.map((category, catIdx) => (
                  <div key={catIdx} className="lf-preset-group">
                    <div className="lf-preset-group-title">{category.name}</div>
                    <div className="lf-preset-chips">
                      {category.items.map((preset, itemIdx) => (
                        <button
                          key={itemIdx}
                          type="button"
                          className={`lf-preset-chip ${businessType === preset ? "active" : ""}`}
                          onClick={() => setBusinessType(preset)}
                          disabled={searching}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                </div>
              </details>
            </div>

            {/* City */}
            <div className="lf-form-field">
              <label htmlFor="target-city">
                <MapPin size={13} className="text-amber" />
                <span>Target Commercial City</span>
              </label>
              <input
                id="target-city"
                type="text"
                className="lf-input"
                placeholder="e.g. Hamburg, Dubai, Rotterdam"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={searching}
                required
              />
            </div>

            {/* Country */}
            <div className="lf-form-field">
              <label htmlFor="target-country">
                <Globe size={13} className="text-amber" />
                <span>Country / Jurisdiction</span>
              </label>
              <input
                id="target-country"
                type="text"
                className="lf-input"
                placeholder="e.g. Germany, UAE, Netherlands, USA"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={searching}
                required
              />
            </div>

            {/* Geographic Trade Hub Quick Select */}
            <div className="lf-form-field span-2">
              <div className="lf-preset-chips">
                <span className="lf-preset-label">Major Trade Hubs:</span>
                {cityPresets.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`lf-preset-chip ${
                      city === item.city && country === item.country ? "active" : ""
                    }`}
                    onClick={() => {
                      setCity(item.city);
                      setCountry(item.country);
                    }}
                    disabled={searching}
                  >
                    {item.city}, {item.country}
                  </button>
                ))}
              </div>
            </div>

            {/* Lead Count Slider / Buttons */}
            <div className="lf-form-field span-2">
              <div className="lf-field-header-row">
                <label htmlFor="target-count">
                  <Sliders size={13} className="text-amber" />
                  <span>Harvest Volume (Max {leadLimit || 200} per batch)</span>
                </label>
                <span className="lf-count-indicator lf-mono">{count} Leads</span>
              </div>
              <div className="lf-count-control-wrap">
                <input
                  id="target-count"
                  type="range"
                  min={1}
                  max={Math.min(leadLimit || 200, remainingLeads > 0 ? remainingLeads : (leadLimit || 200))}
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value, 10))}
                  className="lf-range-slider"
                  disabled={searching}
                />
                <div className="lf-count-presets">
                  {countPresets.map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`lf-count-preset-btn ${count === val ? "active" : ""}`}
                      onClick={() => setCount(val)}
                      disabled={searching || val > remainingLeads}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="lf-form-action-row">
            <button
              type="submit"
              className="lf-btn-submit"
              disabled={searching || remainingLeads <= 0}
            >
              {searching ? (
                <>
                  <Loader2 size={18} className="spin" />
                  <span>Finding contacts...</span>
                </>
              ) : (
                <>
                  <Search size={18} />
                  <span>Find {count} contacts</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Real-time Streaming Progress Monitor */}
        {searching && (
          <div className="lf-search-radar-box lf-progress-monitor-box">
            <div className="lf-radar-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={16} className="spin text-amber" />
                <span>
                  {searchProgress?.message || `Harvesting ${businessType} in ${city}, ${country}...`}
                </span>
              </div>
              <span className="lf-progress-percent lf-mono">
                {searchProgress?.percent ?? 0}%
              </span>
            </div>

            {/* Dynamic Progress Bar */}
            <div className="lf-progress-bar-track">
              <div
                className="lf-progress-bar-fill"
                style={{ width: `${Math.max(5, searchProgress?.percent || 0)}%` }}
              />
            </div>

            <div className="lf-progress-stats-row">
              <span className="lf-progress-stats-leads">
                Progress: {searchProgress?.current || 0} / {searchProgress?.total || count} entities processed
              </span>
              <span className="lf-progress-badge-live">
                <span className="lf-radar-dot pulse" /> 4x Concurrent Workers Active
              </span>
            </div>

            {/* Live Scraper Activity Feed */}
            {searchProgress?.logs && searchProgress.logs.length > 0 ? (
              <div className="lf-progress-log-container">
                <div className="lf-progress-log-title">Live Discovery Activity Feed:</div>
                <div className="lf-progress-log-list">
                  {searchProgress.logs.slice(-6).map((log, idx) => (
                    <div key={idx} className="lf-progress-log-item">
                      <span className="lf-log-time lf-mono">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="lf-log-msg">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="lf-radar-steps">
                <div className="lf-radar-step active">
                  <span className="lf-radar-dot pulse" />
                  <span>Querying {isHunter ? "Hunter.io Native Discover" : "Google Places API"} for {businessType} in {city}</span>
                </div>
                <div className="lf-radar-step active">
                  <span className="lf-radar-dot pulse" />
                  <span>{isHunter ? "Verifying corporate domains with Hunter.io" : "Crawling company websites & validating MX records"}</span>
                </div>
                <div className="lf-radar-step active">
                  <span className="lf-radar-dot pulse" />
                  <span>Deduplicating existing CRM records</span>
                </div>
                <div className="lf-radar-step active">
                  <span className="lf-radar-dot pulse" />
                  <span>Synthesizing DeepSeek cold outreach pitches</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
