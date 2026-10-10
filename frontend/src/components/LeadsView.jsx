import React, { useState, useMemo, useEffect } from "react";
import { safeUrl } from "../safeUrl.js";
import { Users, Search, Filter, Download, CheckCircle2, AlertCircle, XCircle, Phone, Mail, Globe, ExternalLink, Sparkles, ChevronRight, MapPin, Clock, ArrowUpDown, Send, Loader2, Copy, Check, Building2, Eye } from "lucide-react";
export default function LeadsView({
  canDraft = true,
  onVerifyEmail,
  allLeads = [],
  currentResults = [],
  onSelectLead,
  onGeneratePitch,
  generatingDraftId,
  onExportCSV,
  onSendToOutreach
}) {
  const [leadScope, setLeadScope] = useState(currentResults.length > 0 ? "current" : "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all, deliverable, validPhone, both, hasWebsite, liveOnly
  const [sortBy, setSortBy] = useState("newest"); // newest, oldest, name, deliverable
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const isLiveLead = lead => lead.source === "live";

  // Base list depending on scope
  const baseList = leadScope === "current" && currentResults.length > 0 ? currentResults : allLeads;

  // Filtered leads
  const filteredLeads = useMemo(() => {
    return baseList.filter(lead => {
      // Text query match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (lead.name || "").toLowerCase().includes(q);
        const addrMatch = (lead.address || "").toLowerCase().includes(q);
        const emailMatch = (lead.email || "").toLowerCase().includes(q);
        const phoneMatch = (lead.phone || "").toLowerCase().includes(q);
        const webMatch = (lead.website || "").toLowerCase().includes(q);
        if (!nameMatch && !addrMatch && !emailMatch && !phoneMatch && !webMatch) {
          return false;
        }
      }

      // Status pill match
      const hasEmail = isLiveLead(lead) && (lead.emailStatus === "deliverable" || lead.emailStatus === "valid");
      const hasPhone = isLiveLead(lead) && ["valid", "listed"].includes(lead.phoneStatus);
      if (filterStatus === "published") return isLiveLead(lead) && lead.emailDiscovery?.source === "website";
      if (filterStatus === "deliverable") return hasEmail;
      if (filterStatus === "validPhone") return hasPhone;
      if (filterStatus === "both") return hasEmail && hasPhone;
      if (filterStatus === "hasWebsite") return Boolean(safeUrl(lead.website));
      if (filterStatus === "liveOnly") return isLiveLead(lead);
      return true;
    });
  }, [baseList, searchQuery, filterStatus]);

  // Sorted leads
  const sortedLeads = useMemo(() => {
    const list = [...filteredLeads];
    if (sortBy === "name") {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortBy === "oldest") {
      list.sort((a, b) => (a.foundAt || "").localeCompare(b.foundAt || ""));
    } else if (sortBy === "deliverable") {
      list.sort((a, b) => {
        const aDeliv = isLiveLead(a) && (a.emailStatus === "deliverable" || a.emailStatus === "valid") ? 1 : 0;
        const bDeliv = isLiveLead(b) && (b.emailStatus === "deliverable" || b.emailStatus === "valid") ? 1 : 0;
        return bDeliv - aDeliv;
      });
    } else {
      // newest default
      list.sort((a, b) => (b.foundAt || "").localeCompare(a.foundAt || ""));
    }
    return list;
  }, [filteredLeads, sortBy]);
  useEffect(() => {
    setPage(1);
    setSelectedLeadIds(new Set());
  }, [leadScope, searchQuery, filterStatus, sortBy, pageSize]);
  const pageCount = Math.max(1, Math.ceil(sortedLeads.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageLeads = sortedLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  // Counts for pills
  const counts = useMemo(() => {
    const total = baseList.length;
    const deliverable = baseList.filter(l => isLiveLead(l) && (l.emailStatus === "deliverable" || l.emailStatus === "valid")).length;
    const validPhone = baseList.filter(l => isLiveLead(l) && ["valid", "listed"].includes(l.phoneStatus)).length;
    const fullyVerified = baseList.filter(l => isLiveLead(l) && (l.emailStatus === "deliverable" || l.emailStatus === "valid") && ["valid", "listed"].includes(l.phoneStatus)).length;
    const withWebsite = baseList.filter(l => safeUrl(l.website)).length;
    const liveOnly = baseList.filter(isLiveLead).length;
    return {
      total,
      published: baseList.filter(l=>isLiveLead(l) && l.emailDiscovery?.source === "website").length,
      deliverable,
      validPhone,
      fullyVerified,
      withWebsite,
      liveOnly
    };
  }, [baseList]);

  // Selection handlers
  const handleToggleSelectAll = () => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      const allSelected = pageLeads.every(lead => next.has(lead.id));
      for (const lead of pageLeads) {
        if (allSelected) next.delete(lead.id);else next.add(lead.id);
      }
      return next;
    });
  };
  const handleSelectAllValid = () => {
    const validIds = sortedLeads.filter(l => isLiveLead(l) && (l.emailStatus === "deliverable" || l.emailStatus === "valid")).map(l => l.id);
    setSelectedLeadIds(new Set(validIds));
  };
  const handleSelectAllOnPage = () => {
    setSelectedLeadIds(new Set(pageLeads.map(l => l.id)));
  };
  const handleSendSelectedToOutreach = () => {
    const selectedList = sortedLeads.filter(l => selectedLeadIds.has(l.id));
    if (selectedList.length > 0 && onSendToOutreach) {
      onSendToOutreach(selectedList);
    }
  };
  const handleToggleLead = id => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);else next.add(id);
      return next;
    });
  };
  const handleExportSelected = () => {
    const leadsToExport = selectedLeadIds.size > 0 ? sortedLeads.filter(l => selectedLeadIds.has(l.id)) : sortedLeads;
    onExportCSV(leadsToExport);
  };
  const handleCopyText = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  };
  return <div className="lf-view-container lf-animate-fade">
      {/* Scope and Search Toolbar */}
      <div className="lf-crm-toolbar">
        {/* Scope switcher */}
        <div className="lf-scope-tabs">
          <button type="button" className={`lf-scope-tab ${leadScope === "current" ? "active" : ""}`} onClick={() => setLeadScope("current")} disabled={currentResults.length === 0}>
            Latest Batch ({currentResults.length})
          </button>
          <button type="button" className={`lf-scope-tab ${leadScope === "all" ? "active" : ""}`} onClick={() => setLeadScope("all")}>
            All Database Leads ({allLeads.length})
          </button>
        </div>

        {/* Search input */}
        <div className="lf-search-input-wrap">
          <Search size={15} className="lf-search-icon" />
          <input type="text" className="lf-search-input" placeholder="Search by company, city, email, phone..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && <button type="button" className="lf-search-clear" onClick={() => setSearchQuery("")}>
              ✕
            </button>}
        </div>

        {/* Sort selector */}
        <div className="lf-sort-wrap">
          <ArrowUpDown size={14} className="text-muted" />
          <select className="lf-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="newest">Newest Discovered</option>
            <option value="oldest">Oldest Discovered</option>
            <option value="name">Company Name A-Z</option>
            <option value="deliverable">Deliverable Inboxes First</option>
          </select>
        </div>

        {/* Export CSV button */}
        <button type="button" className="lf-btn-secondary sm" onClick={handleExportSelected} disabled={sortedLeads.length === 0}>
          <Download size={14} />
          <span>
            {selectedLeadIds.size > 0 ? `Export (${selectedLeadIds.size})` : "Export CSV"}
          </span>
        </button>

        {/* Send to Outreach button */}
        <button type="button" className="lf-btn-primary sm" onClick={handleSendSelectedToOutreach} disabled={!canDraft || selectedLeadIds.size === 0}>
          <Send size={14} />
          <span>
            {selectedLeadIds.size > 0 ? `Send (${selectedLeadIds.size}) to Outreach` : "Send to Outreach"}
          </span>
        </button>
      </div>

      {/* Verification Filter Pills & Shortcuts */}
      <div className="lf-filter-pills-bar" style={{
      display: "flex",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 10
    }}>
        <div style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "center"
      }}>
          <button type="button" className={`lf-filter-pill ${filterStatus === "all" ? "active" : ""}`} onClick={() => setFilterStatus("all")}>
            All ({counts.total})
          </button>
          <button type="button" className={`lf-filter-pill ${filterStatus === "published" ? "active" : ""}`} onClick={() => setFilterStatus("published")}>Published emails <span>{counts.published}</span></button>
          <button type="button" className={`lf-filter-pill ${filterStatus === "deliverable" ? "active" : ""}`} onClick={() => setFilterStatus("deliverable")}>
            <CheckCircle2 size={12} className="text-emerald" />
            <span>Deliverable Emails ({counts.deliverable})</span>
          </button>
          <button type="button" className={`lf-filter-pill ${filterStatus === "validPhone" ? "active" : ""}`} onClick={() => setFilterStatus("validPhone")}>
            <Phone size={12} className="text-emerald" />
            <span>Listed Phones ({counts.validPhone})</span>
          </button>
          <button type="button" className={`lf-filter-pill ${filterStatus === "both" ? "active" : ""}`} onClick={() => setFilterStatus("both")}>
            <Sparkles size={12} className="text-amber" />
            <span>Verified Email + Listed Phone ({counts.fullyVerified})</span>
          </button>
          <button type="button" className={`lf-filter-pill ${filterStatus === "hasWebsite" ? "active" : ""}`} onClick={() => setFilterStatus("hasWebsite")}>
            <Globe size={12} className="text-blue" />
            <span>Has Website ({counts.withWebsite})</span>
          </button>
          <button type="button" className={`lf-filter-pill ${filterStatus === "liveOnly" ? "active" : ""}`} onClick={() => setFilterStatus("liveOnly")}>
            <span>Live Places Only ({counts.liveOnly})</span>
          </button>
        </div>

        <div style={{
        display: "flex",
        gap: 6,
        alignItems: "center"
      }}>
          <button type="button" className="lf-preset-chip" onClick={handleSelectAllValid} title="Select only deliverable/valid emails" style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4
        }}>
            <CheckCircle2 size={12} className="text-emerald" />
            <span>Select All Valid</span>
          </button>
          <button type="button" className="lf-preset-chip" onClick={handleSelectAllOnPage} title="Select all visible leads" style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4
        }}>
            <span>Select All on Page ({pageLeads.length})</span>
          </button>
        </div>
      </div>

      {/* Floating Bulk Actions Bar when checkboxes are checked */}
      {selectedLeadIds.size > 0 && <div className="lf-bulk-bar lf-animate-slide-up">
          <div className="lf-bulk-info">
            <span className="lf-bulk-count lf-mono">{selectedLeadIds.size}</span>
            <span>lead(s) selected</span>
          </div>
          <div className="lf-bulk-actions">
            <button type="button" className="lf-btn-primary sm" disabled={!canDraft} onClick={handleSendSelectedToOutreach}>
              <Send size={14} />
              <span>Send {selectedLeadIds.size} to Outreach Studio</span>
            </button>
            <button type="button" className="lf-btn-secondary sm" onClick={handleExportSelected}>
              <Download size={14} />
              <span>Export {selectedLeadIds.size} to CSV</span>
            </button>
            <button type="button" className="lf-btn-ghost-sm" onClick={() => setSelectedLeadIds(new Set())}>
              Clear Selection
            </button>
          </div>
        </div>}

      {/* Data Table */}
      {sortedLeads.length === 0 ? <div className="lf-panel lf-empty-table">
          <Users size={36} className="text-muted" />
          <h3>No leads match your active filters</h3>
          <p>Try resetting the search bar or changing the verification filter status.</p>
          <button type="button" className="lf-btn-secondary sm" onClick={() => {
        setSearchQuery("");
        setFilterStatus("all");
      }}>
            Reset Filters
          </button>
        </div> : <div className="lf-table-container">
          <table className="lf-crm-table">
            <thead>
              <tr>
                <th style={{
              width: 40
            }}>
                  <input type="checkbox" checked={pageLeads.length > 0 && pageLeads.every(lead => selectedLeadIds.has(lead.id))} onChange={handleToggleSelectAll} aria-label="Select all leads" />
                </th>
                <th>Company & Location</th>
                <th>Telephone Contact</th>
                <th>Email & verification</th>
                <th>AI Cold Pitch</th>
                <th style={{
              textAlign: "right"
            }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageLeads.map(lead => {
            const isSelected = selectedLeadIds.has(lead.id);
            const hasDeliverable = isLiveLead(lead) && (lead.emailStatus === "deliverable" || lead.emailStatus === "valid");
            const hasValidPhone = isLiveLead(lead) && ["valid", "listed"].includes(lead.phoneStatus);
            const websiteUrl = safeUrl(lead.website);
            const isSent = lead.coldMailDraft?.status === "sent";
            return <tr key={lead.id} className={isSelected ? "selected-row" : ""}>
                    {/* Checkbox */}
                    <td>
                      <input type="checkbox" checked={isSelected} onChange={() => handleToggleLead(lead.id)} aria-label={`Select ${lead.name}`} />
                    </td>

                    {/* Company & Address */}
                    <td>
                      <div className="lf-table-company">
                        <div className="lf-table-company-name">
                          <button type="button" className="clickable-name" onClick={() => onSelectLead(lead)}>{lead.name}</button>
                          {!isLiveLead(lead) && <span className="lf-badge-pill gold sm">{lead.source === "simulated" ? "Demo" : "Source unconfirmed"}</span>}
                        </div>
                        <div className="lf-table-company-addr">
                          <MapPin size={11} />
                          <span>{lead.address || "No address provided"}</span>
                        </div>
                      </div>
                    </td>

                    {/* Phone */}
                    <td>
                      <div className="lf-table-contact-box">
                        <div className="lf-contact-status-row">
                          <span className={`lf-badge-pill sm ${hasValidPhone ? "green" : "muted"}`}>
                            {hasValidPhone ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                            <span>{isLiveLead(lead) ? lead.phoneStatus || "Unknown" : "Unverified"}</span>
                          </span>
                        </div>
                        <div className="lf-contact-val lf-mono">
                          <span>{lead.phone || "—"}</span>
                          {lead.phone && <button type="button" className="lf-btn-icon-xs" onClick={() => handleCopyText(lead.phone, `p-${lead.id}`)} title="Copy phone number">
                              {copiedId === `p-${lead.id}` ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                            </button>}
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td>
                      <div className="lf-table-contact-box">
                        <div className="lf-contact-status-row">
                          <span className={`lf-badge-pill sm ${hasDeliverable ? "green" : lead.emailStatus === "risky" ? "gold" : "muted"}`}>
                            {hasDeliverable ? <CheckCircle2 size={10} /> : lead.emailStatus === "risky" ? <AlertCircle size={10} /> : <XCircle size={10} />}
                            <span>{isLiveLead(lead) ? lead.emailStatus === "unknown" ? "Unverified" : lead.emailStatus || "Not found" : "Unverified"}</span>
                          </span>
                        </div>
                        <div className="lf-contact-val lf-mono">
                          <span>{lead.email || "—"}</span>
                          {lead.email && <button type="button" className="lf-btn-icon-xs" onClick={() => handleCopyText(lead.email, `e-${lead.id}`)} title="Copy email address">
                              {copiedId === `e-${lead.id}` ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                            </button>}
                        </div>
                      </div>
                      {onVerifyEmail && canDraft && isLiveLead(lead) && lead.email?.includes('@') && !hasDeliverable && <button className="lf-btn-secondary xs" onClick={() => onVerifyEmail?.(lead)}>Verify email</button>}
                    </td>

                    {/* Cold Pitch Status / Trigger */}
                    <td>
                      {isSent ? <span className="lf-badge-pill green sm">
                          <CheckCircle2 size={11} /> Pitch Dispatched
                        </span> : lead.coldMailDraft ? <button type="button" className="lf-btn-pitch-badge review" onClick={() => onSelectLead(lead)}>
                          <Sparkles size={11} />
                          <span>Review Draft</span>
                        </button> : hasDeliverable ? <button type="button" className="lf-btn-pitch-badge generate" disabled={generatingDraftId === lead.id || !canDraft} onClick={() => onGeneratePitch(lead)}>
                          {generatingDraftId === lead.id ? <>
                              <Loader2 size={11} className="spin" />
                              <span>Drafting...</span>
                            </> : <>
                              <Sparkles size={11} />
                              <span>Draft Pitch</span>
                            </>}
                        </button> : <span className="lf-badge-pill muted sm">—</span>}
                    </td>

                    {/* Actions */}
                    <td style={{
                textAlign: "right"
              }}>
                      <div className="lf-table-actions">
                        {websiteUrl && <a href={websiteUrl} target="_blank" rel="noreferrer" className="lf-btn-icon-sm" title="Visit website">
                            <ExternalLink size={13} />
                          </a>}

                        <button type="button" className="lf-btn-secondary xs" onClick={() => onSelectLead(lead)}>
                          <Eye size={12} />
                          <span>Dossier</span>
                        </button>
                      </div>
                    </td>
                  </tr>;
          })}
            </tbody>
          </table>
        </div>}
      <div className="lf-pagination" aria-label="Lead pagination">
        <span>{sortedLeads.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, sortedLeads.length)} of {sortedLeads.length} matching leads</span>
        <label>Rows <select className="lf-select" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>{[10, 20, 40, 60].map(n => <option key={n}>{n}</option>)}</select></label>
        <div className="lf-admin-actions"><button className="lf-btn-secondary sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} / {pageCount}</span><button className="lf-btn-secondary sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>
      </div>
    </div>;
}
