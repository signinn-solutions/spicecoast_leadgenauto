import React, { useMemo, useState } from "react";
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

function countLeadsInArea(allLeads = [], targetArea = "", targetCountry = "", isCountrySearch = false) {
  if (!Array.isArray(allLeads) || allLeads.length === 0) return 0;
  const areaLower = (targetArea || "").trim().toLowerCase();
  const countryLower = (targetCountry || "").trim().toLowerCase();
  if (!areaLower && !countryLower) return 0;

  const matchByCountryOnly = isCountrySearch || !areaLower || areaLower === "all" || areaLower === countryLower;
  return allLeads.filter((lead) => {
    if (!lead || typeof lead !== "object") return false;
    const leadCity = (lead.city || "").trim().toLowerCase();
    const leadCountry = (lead.country || "").trim().toLowerCase();
    const leadAddress = (lead.address || "").toLowerCase();

    const countryMatch = !countryLower || leadCountry === countryLower || leadAddress.includes(countryLower);
    if (matchByCountryOnly) return countryMatch;

    const areaMatch = leadCity === areaLower || leadAddress.includes(areaLower);
    return areaMatch && countryMatch;
  }).length;
}

export default function DiscoveryView({
  businessType,
  setBusinessType,
  city,
  setCity,
  country,
  setCountry,
  geographyLevel = "auto",
  setGeographyLevel,
  count,
  setCount,
  searching,
  searchProgress,
  onSearch,
  onCancelSearch,
  cancellingSearch,
  leadLimit = 1000,
  remainingLeads = 200,
  lastSearchInfo,
  allLeads = [],
  onViewResults,
  discoveryEngine = "scraper",
  onToggleEngine,
  isTogglingHunter = false,
}) {
  const [showSegments, setShowSegments] = useState(false);

  const geoScopes = [
    { value: "auto", label: "Auto" },
    { value: "city", label: "City" },
    { value: "district", label: "District" },
    { value: "state", label: "State / Region" },
    { value: "country", label: "Entire Country" },
  ];

  const cityPresets = [
    { city: "Hamburg", country: "Germany" },
    { city: "Rotterdam", country: "Netherlands" },
    { city: "Dubai", country: "UAE" },
    { city: "London", country: "United Kingdom" },
    { city: "New York", country: "United States" },
    { city: "Singapore", country: "Singapore" },
  ];

  const countPresets = [20, 60, 120, 500, 1000].filter(value => value <= leadLimit);
  const isHunter = discoveryEngine === "hunter";
  const countrySearch = !isHunter && geographyLevel === "country";
  const searchStopped = lastSearchInfo?.placesSummary?.paused || lastSearchInfo?.placesSummary?.terminationReason === "cancelled";

  const activeTargetArea = countrySearch ? country : city;
  const activeAreaLabel = activeTargetArea && country && activeTargetArea.trim().toLowerCase() !== country.trim().toLowerCase()
    ? `${activeTargetArea.trim()}, ${country.trim()}`
    : (country || activeTargetArea || "").trim();

  const currentAreaLeadCount = useMemo(
    () => countLeadsInArea(allLeads, activeTargetArea, country, countrySearch),
    [allLeads, activeTargetArea, country, countrySearch]
  );

  const searchedArea = lastSearchInfo?.query?.city || city;
  const searchedCountry = lastSearchInfo?.query?.country || country;
  const searchedLabel = searchedArea && searchedCountry && searchedArea.trim().toLowerCase() !== searchedCountry.trim().toLowerCase()
    ? `${searchedArea.trim()}, ${searchedCountry.trim()}`
    : (searchedCountry || searchedArea || "").trim();

  const searchedAreaLeadCount = useMemo(
    () => (lastSearchInfo ? countLeadsInArea(allLeads, searchedArea, searchedCountry, searchedArea.trim().toLowerCase() === searchedCountry.trim().toLowerCase()) : 0),
    [allLeads, lastSearchInfo, searchedArea, searchedCountry]
  );

  const isAreaExhausted = Boolean(
    lastSearchInfo &&
    !searchStopped &&
    (lastSearchInfo.count === 0 ||
      lastSearchInfo.placesSummary?.exhausted ||
      lastSearchInfo.placesSummary?.terminationReason === "exhausted" ||
      lastSearchInfo.placesSummary?.terminationReason === "coverage_exhausted")
  );

  const alternativeHubs = cityPresets.filter(
    (item) => item.city.toLowerCase() !== (searchedArea || "").trim().toLowerCase()
  );

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

      {/* Last Search Feedback Banner */}
      {lastSearchInfo && (
        searchStopped ? (
          <div className="lf-search-complete-banner" role="status">
            <div className="lf-banner-left">
              <Info size={20} className="text-blue" />
              <div>
                <div className="lf-banner-title">{lastSearchInfo.placesSummary.paused ? "Search paused" : "Search cancelled"}</div>
                <div className="lf-banner-text">
                  Saved {lastSearchInfo.count} of {lastSearchInfo.placesSummary.requestedLeads} requested contacts.
                  {lastSearchInfo.placesSummary.paused && " Submit the same search to resume after capacity returns."}
                </div>
              </div>
            </div>
            {lastSearchInfo.count > 0 && <button type="button" className="lf-btn-secondary sm" onClick={onViewResults}>View Leads in CRM</button>}
          </div>
        ) : lastSearchInfo.count > 0 ? (
          <div
            className="lf-search-complete-banner"
            style={
              isAreaExhausted
                ? { flexDirection: "column", alignItems: "stretch", gap: "12px", borderLeft: "4px solid #f59e0b" }
                : undefined
            }
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", width: "100%" }}>
              <div className="lf-banner-left">
                <CheckCircle2 size={18} className="text-emerald" />
                <div>
                  <div className="lf-banner-title">
                    {isAreaExhausted ? `Search complete — ${searchedLabel} leads exhausted` : "Search complete"}
                  </div>
                  <div className="lf-banner-text">
                    Added <strong>{lastSearchInfo.count}</strong> new contact{lastSearchInfo.count === 1 ? "" : "s"}
                    {lastSearchInfo.query?.count ? ` (requested ${lastSearchInfo.query.count})` : ""} to your CRM.
                    {lastSearchInfo.duplicatesSkipped > 0 && (
                      <> Skipped <strong>{lastSearchInfo.duplicatesSkipped}</strong> existing contact{lastSearchInfo.duplicatesSkipped === 1 ? "" : "s"}.</>
                    )}
                    {" "}
                    <span>
                      <strong>{searchedAreaLeadCount}</strong> lead{searchedAreaLeadCount === 1 ? "" : "s"} under <strong>{searchedLabel}</strong> {searchedAreaLeadCount === 1 ? "is" : "are"} now in your Found Leads.
                    </span>
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

            {isAreaExhausted && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingTop: "8px", borderTop: "1px solid rgba(245, 158, 11, 0.25)" }}>
                <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#b45309", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <AlertTriangle size={13} />
                  No more new leads left in {searchedLabel} for this query — try changing the place:
                </span>
                {alternativeHubs.slice(0, 4).map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="lf-btn-secondary sm"
                    onClick={() => {
                      setCity(item.city);
                      setCountry(item.country);
                      if (setGeographyLevel) setGeographyLevel("auto");
                    }}
                    style={{ fontSize: "11px", padding: "4px 9px", background: "#ffffff" }}
                  >
                    <MapPin size={11} />
                    <span>{item.city}, {item.country}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="lf-search-complete-banner" style={{ borderLeft: "4px solid #f59e0b", background: "rgba(245, 158, 11, 0.06)", flexDirection: "column", alignItems: "stretch", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
              <div className="lf-banner-left" style={{ alignItems: "flex-start" }}>
                <AlertTriangle size={20} style={{ color: "#d97706", marginTop: "2px", flexShrink: 0 }} />
                <div>
                  <div className="lf-banner-title" style={{ color: "#b45309" }}>
                    {lastSearchInfo.duplicatesSkipped > 0
                      ? `All Discovered Prospects Already in Your CRM — ${searchedLabel} leads exhausted`
                      : lastSearchInfo.contactsMissing > 0
                      ? `No published contact details found — ${searchedLabel} leads exhausted`
                      : `No new contacts found — ${searchedLabel} leads exhausted`}
                  </div>
                  <div className="lf-banner-text" style={{ color: "#475569" }}>
                    {lastSearchInfo.duplicatesSkipped > 0 ? (
                      <>
                        All <strong>{lastSearchInfo.duplicatesSkipped}</strong> discovered prospect(s) for <em>"{lastSearchInfo.query?.businessType || businessType}"</em> in <em>{searchedLabel}</em> already exist in your CRM.
                      </>
                    ) : lastSearchInfo.contactsMissing > 0 ? (
                      <>
                        Found <strong>{lastSearchInfo.contactsMissing}</strong> business(es) in <em>{searchedLabel}</em> without published phone or email details.
                      </>
                    ) : (
                      <>
                        No new leads were found for <em>"{lastSearchInfo.query?.businessType || businessType}"</em> in <em>{searchedLabel}</em>.
                      </>
                    )}
                    {" "}
                    <strong>{searchedAreaLeadCount}</strong> lead{searchedAreaLeadCount === 1 ? "" : "s"} under <strong>{searchedLabel}</strong> {searchedAreaLeadCount === 1 ? "is" : "are"} already found and present in your Found Leads.
                  </div>
                </div>
              </div>
              {searchedAreaLeadCount > 0 && (
                <button
                  type="button"
                  className="lf-btn-secondary sm"
                  onClick={onViewResults}
                  style={{ borderColor: "rgba(217, 119, 6, 0.4)", color: "#b45309", background: "#ffffff" }}
                >
                  <span>View {searchedAreaLeadCount} in Found Leads</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>

            {/* Suggest Changing the Place */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingTop: "8px", borderTop: "1px solid rgba(245, 158, 11, 0.2)" }}>
              <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#b45309", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Change place to find new leads:
              </span>
              {alternativeHubs.slice(0, 4).map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="lf-btn-secondary sm"
                  onClick={() => {
                    setCity(item.city);
                    setCountry(item.country);
                    if (setGeographyLevel) setGeographyLevel("auto");
                  }}
                  style={{ fontSize: "11px", padding: "4px 9px", background: "#ffffff" }}
                >
                  <MapPin size={11} />
                  <span>{item.city}, {item.country}</span>
                </button>
              ))}
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
              <div className="lf-field-header-row">
                <label htmlFor="business-type">
                  <Tag size={13} className="text-amber" />
                  <span>Target Business Sector / Niche</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowSegments((prev) => !prev)}
                  disabled={searching}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    fontSize: "11.5px",
                    fontWeight: "500",
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  {showSegments ? "Hide presets ▴" : "Presets ▾"}
                </button>
              </div>
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
              {showSegments && (
                <div className="lf-preset-groups" style={{ marginTop: "8px", padding: "10px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  {SPICE_PRESET_CATEGORIES.map((category, catIdx) => (
                    <div key={catIdx} className="lf-preset-group">
                      <div className="lf-preset-group-title">{category.name}</div>
                      <div className="lf-preset-chips">
                        {category.items.map((preset, itemIdx) => (
                          <button
                            key={itemIdx}
                            type="button"
                            className={`lf-preset-chip ${businessType === preset ? "active" : ""}`}
                            onClick={() => {
                              setBusinessType(preset);
                              setShowSegments(false);
                            }}
                            disabled={searching}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* City / Target Area */}
            <div className="lf-form-field">
              <label htmlFor="target-city">
                <MapPin size={13} className="text-amber" />
                <span>{countrySearch ? "Target Area (Entire Country)" : "Target Area"}</span>
              </label>
              <input
                id="target-city"
                type="text"
                className="lf-input"
                placeholder={countrySearch ? `Searching all of ${country || "selected country"}` : "e.g. Hamburg, Kerala, or All"}
                value={countrySearch ? country : city}
                onChange={(e) => setCity(e.target.value)}
                disabled={searching || countrySearch}
                required={!countrySearch}
                style={countrySearch ? { background: "#f8fafc", color: "#64748b" } : undefined}
              />
              {activeAreaLabel && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "6px", fontSize: "12px", color: currentAreaLeadCount > 0 ? "#b45309" : "#64748b" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                    <Database size={12} />
                    {currentAreaLeadCount > 0 ? (
                      <>
                        <strong>{currentAreaLeadCount}</strong> lead{currentAreaLeadCount === 1 ? "" : "s"} already in Found Leads for <strong>{activeAreaLabel}</strong>
                      </>
                    ) : (
                      <>No leads in Found Leads for {activeAreaLabel} yet</>
                    )}
                  </span>
                  {currentAreaLeadCount > 0 && (
                    <button
                      type="button"
                      onClick={onViewResults}
                      style={{ background: "none", border: "none", color: "#2563eb", fontSize: "12px", fontWeight: "600", cursor: "pointer", padding: 0 }}
                    >
                      View
                    </button>
                  )}
                </div>
              )}
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

            {/* Refined Search Scope Selector */}
            {!isHunter && setGeographyLevel && (
              <div className="lf-form-field span-2">
                <div className="lf-preset-chips" style={{ alignItems: "center" }}>
                  <span className="lf-preset-label">Search Scope:</span>
                  {geoScopes.map((scope) => (
                    <button
                      key={scope.value}
                      type="button"
                      className={`lf-preset-chip ${geographyLevel === scope.value ? "active" : ""}`}
                      onClick={() => setGeographyLevel(scope.value)}
                      disabled={searching}
                    >
                      {scope.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                  <span>Harvest Volume (Max {leadLimit} per batch)</span>
                </label>
                <span className="lf-count-indicator lf-mono">{count} Leads</span>
              </div>
              <div className="lf-count-control-wrap">
                <input
                  id="target-count"
                  type="range"
                  min={1}
                  max={leadLimit}
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
                      disabled={searching}
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
            {onCancelSearch && (
              <button type="button" className="lf-btn-secondary" onClick={onCancelSearch} disabled={cancellingSearch}>
                {cancellingSearch ? "Cancelling…" : "Cancel search"}
              </button>
            )}
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
                <span className="lf-radar-dot pulse" /> Search active
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
                  <span>Searching business directories for {businessType} in {city}</span>
                </div>
                <div className="lf-radar-step active">
                  <span className="lf-radar-dot pulse" />
                  <span>{isHunter ? "Verifying corporate domains & contact emails" : "Checking company websites & validating contact emails"}</span>
                </div>
                <div className="lf-radar-step active">
                  <span className="lf-radar-dot pulse" />
                  <span>Deduplicating existing CRM records</span>
                </div>
                <div className="lf-radar-step active">
                  <span className="lf-radar-dot pulse" />
                  <span>Generating AI cold outreach pitches</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
