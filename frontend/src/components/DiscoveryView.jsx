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
  discoveryEngine = "hunter",
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
          <h2 className="lf-section-title">Lead Discovery & Prospecting Engine</h2>
          <p className="lf-section-subtitle">
            Autonomous B2B sourcing using Google Places Scraper or Hunter.io Native Company Discovery.
          </p>
        </div>
        <div className="lf-quota-badge-top">
          <span className="lf-quota-badge-label">Remaining Daily Quota:</span>
          <span className="lf-quota-badge-val lf-mono">{remainingLeads} / {leadLimit}</span>
        </div>
      </div>

      {/* Discovery Engine Switcher Card */}
      <div className="lf-panel" style={{ padding: "16px 20px", marginBottom: "18px", border: isHunter ? "1px solid rgba(124, 58, 237, 0.3)" : "1px solid rgba(59, 130, 246, 0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span className={`lf-badge-pill ${isHunter ? "purple" : "blue"}`} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                {isHunter ? <Zap size={12} /> : <Globe size={12} />}
                <span>Active Discovery Mode: {isHunter ? "Hunter.io Native Discovery" : "Google Places + Inbuilt Web Scraper"}</span>
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              {isHunter ? (
                <span>
                  <strong>Starting Point:</strong> Hunter.io Company & Domain Discover database &bull;{" "}
                  <strong>Email Extraction:</strong> Hunter verified executive contacts
                </span>
              ) : (
                <span>
                  <strong>Starting Point:</strong> Google Places API listing seed &bull;{" "}
                  <strong>Email Extraction:</strong> Inbuilt deep website crawler & live DNS MX validation (0 Hunter credits used)
                </span>
              )}
            </div>
          </div>

          {/* Engine Switch Button Group */}
          <div style={{ display: "flex", alignItems: "center", background: "var(--bg-surface-2)", padding: "4px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            <button
              type="button"
              className={`lf-engine-switch-btn ${!isHunter ? "active" : ""}`}
              onClick={() => onToggleEngine && onToggleEngine("scraper")}
              disabled={searching || isTogglingHunter}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: "600",
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                background: !isHunter ? "var(--bg-surface-1)" : "transparent",
                color: !isHunter ? "#2563eb" : "var(--text-muted)",
                boxShadow: !isHunter ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <Globe size={13} />
              <span>Google Places Scraper</span>
            </button>

            <button
              type="button"
              className={`lf-engine-switch-btn ${isHunter ? "active" : ""}`}
              onClick={() => onToggleEngine && onToggleEngine("hunter")}
              disabled={searching || isTogglingHunter}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: "600",
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                background: isHunter ? "var(--bg-surface-1)" : "transparent",
                color: isHunter ? "#7c3aed" : "var(--text-muted)",
                boxShadow: isHunter ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <Zap size={13} />
              <span>Hunter.io Discovery</span>
            </button>
          </div>
        </div>
      </div>

      {/* Last Search Feedback Banner */}
      {lastSearchInfo && (
        <div className="lf-search-complete-banner">
          <div className="lf-banner-left">
            <CheckCircle2 size={18} className="text-emerald" />
            <div>
              <div className="lf-banner-title">
                Search Complete &bull; {lastSearchInfo.mode === "hunter_discover" || isHunter ? "Hunter.io Native Engine" : "Google Places Scraper Engine"}
              </div>
              <div className="lf-banner-text">
                Saved <strong>{lastSearchInfo.count}</strong> new business record(s).
                {lastSearchInfo.duplicatesSkipped > 0 ? (
                  <> Automatically skipped <strong>{lastSearchInfo.duplicatesSkipped}</strong> existing database duplicate(s).</>
                ) : (
                  <> Zero duplicates detected in local SQLite storage.</>
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
                  <span>Harvesting via {isHunter ? "Hunter Native Discover" : "Google Places Scraper"}...</span>
                </>
              ) : (
                <>
                  <Search size={18} />
                  <span>Harvest {count} B2B Leads ({isHunter ? "Hunter Native" : "Places Scraper"})</span>
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
