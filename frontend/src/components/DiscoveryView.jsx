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
} from "lucide-react";

export default function DiscoveryView({
  businessType,
  setBusinessType,
  city,
  setCity,
  country,
  setCountry,
  count,
  setCount,
  searchMode,
  setSearchMode,
  searching,
  onSearch,
  leadLimit = 50,
  remainingLeads = 50,
  lastSearchInfo,
  onViewResults,
}) {
  const nichePresets = [
    "Spice Importer & Wholesaler",
    "Food & Commodity Broker",
    "Gourmet Specialty Retailer",
    "HoReCa Foodservice Distributor",
    "Seasoning & Blending Plant",
    "Ethnic Supermarket Chain",
  ];

  const cityPresets = [
    { city: "Hamburg", country: "Germany" },
    { city: "Rotterdam", country: "Netherlands" },
    { city: "Dubai", country: "UAE" },
    { city: "London", country: "United Kingdom" },
    { city: "New York", country: "United States" },
    { city: "Singapore", country: "Singapore" },
  ];

  const countPresets = [10, 15, 25, 50];

  return (
    <div className="lf-view-container lf-animate-fade">
      {/* Header Info */}
      <div className="lf-section-header">
        <div>
          <h2 className="lf-section-title">Lead Discovery & Prospecting Engine</h2>
          <p className="lf-section-subtitle">
            Query global business registries, extract executive contact inboxes via Hunter.io, and synthesize verified B2B leads.
          </p>
        </div>
        <div className="lf-quota-badge-top">
          <span className="lf-quota-badge-label">Remaining Daily Quota:</span>
          <span className="lf-quota-badge-val lf-mono">{remainingLeads} / {leadLimit}</span>
        </div>
      </div>

      {/* Last Search Feedback Banner */}
      {lastSearchInfo && (
        <div className="lf-search-complete-banner">
          <div className="lf-banner-left">
            <CheckCircle2 size={18} className="text-emerald" />
            <div>
              <div className="lf-banner-title">
                Search Complete &bull; {lastSearchInfo.mode === "live" ? "Live Places API" : "Autonomous Simulation Mode"}
              </div>
              <div className="lf-banner-text">
                Successfully identified and verified <strong>{lastSearchInfo.count}</strong> new unique B2B lead(s).
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
              <div className="lf-preset-chips">
                <span className="lf-preset-label">Quick Presets:</span>
                {nichePresets.map((niche, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`lf-preset-chip ${businessType === niche ? "active" : ""}`}
                    onClick={() => setBusinessType(niche)}
                    disabled={searching}
                  >
                    {niche}
                  </button>
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
                  <span>Harvest Volume (Max 50 per batch)</span>
                </label>
                <span className="lf-count-indicator lf-mono">{count} Leads</span>
              </div>
              <div className="lf-count-control-wrap">
                <input
                  id="target-count"
                  type="range"
                  min={1}
                  max={Math.min(50, remainingLeads > 0 ? remainingLeads : 50)}
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

            {/* Search Mode Selector */}
            <div className="lf-form-field span-2">
              <label>
                <Sparkles size={13} className="text-amber" />
                <span>Enrichment & Discovery Mode</span>
              </label>
              <div className="lf-mode-cards-grid">
                <div
                  className={`lf-mode-card ${searchMode === "auto" ? "active" : ""}`}
                  onClick={() => !searching && setSearchMode("auto")}
                  role="button"
                  tabIndex={0}
                >
                  <div className="lf-mode-card-header">
                    <Database size={16} className="text-amber" />
                    <span className="lf-mode-card-title">Auto (Live + Fallback)</span>
                    <span className="lf-badge-pill gold">Recommended</span>
                  </div>
                  <p className="lf-mode-card-desc">
                    Prioritizes live Places API & Hunter.io domain enrichment. Seamlessly falls back to local data if credentials are not configured.
                  </p>
                </div>

                <div
                  className={`lf-mode-card ${searchMode === "live" ? "active" : ""}`}
                  onClick={() => !searching && setSearchMode("live")}
                  role="button"
                  tabIndex={0}
                >
                  <div className="lf-mode-card-header">
                    <Globe size={16} className="text-emerald" />
                    <span className="lf-mode-card-title">Live Places & Hunter.io</span>
                    <span className="lf-badge-pill green">Production</span>
                  </div>
                  <p className="lf-mode-card-desc">
                    Requires live Google Places and Hunter.io API tokens. Verifies real domain mailboxes and phone numbers.
                  </p>
                </div>

                <div
                  className={`lf-mode-card ${searchMode === "simulated" ? "active" : ""}`}
                  onClick={() => !searching && setSearchMode("simulated")}
                  role="button"
                  tabIndex={0}
                >
                  <div className="lf-mode-card-header">
                    <Zap size={16} className="text-blue" />
                    <span className="lf-mode-card-title">Zero-Credit Simulation</span>
                    <span className="lf-badge-pill blue">Sandbox</span>
                  </div>
                  <p className="lf-mode-card-desc">
                    Generates authentic European and global trade entity records with simulated deliverability. Zero quota burn.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="lf-form-action-row">
            <button
              type="submit"
              className="lf-btn-submit"
              disabled={searching || (remainingLeads <= 0 && searchMode !== "simulated")}
            >
              {searching ? (
                <>
                  <Loader2 size={18} className="spin" />
                  <span>Harvesting, Enriching & Drafting AI Proposals...</span>
                </>
              ) : (
                <>
                  <Search size={18} />
                  <span>Harvest {count} B2B Leads Now</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Live Stepper Radar Animation during search */}
        {searching && (
          <div className="lf-search-radar-box">
            <div className="lf-radar-header">
              <Loader2 size={16} className="spin text-amber" />
              <span>Autonomous Prospecting Radar in Progress</span>
            </div>
            <div className="lf-radar-steps">
              <div className="lf-radar-step active">
                <span className="lf-radar-dot pulse" />
                <span>Targeting {city}, {country} business entities</span>
              </div>
              <div className="lf-radar-step active">
                <span className="lf-radar-dot pulse" />
                <span>Hunter.io root domain email verification</span>
              </div>
              <div className="lf-radar-step active">
                <span className="lf-radar-dot pulse" />
                <span>SQLite deduplication & validation check</span>
              </div>
              <div className="lf-radar-step active">
                <span className="lf-radar-dot pulse" />
                <span>DeepSeek AI synthesizing personalized export pitches</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
