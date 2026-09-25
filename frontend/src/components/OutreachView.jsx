import React, { useState, useMemo } from "react";
import {
  Send,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  Copy,
  Check,
  Edit3,
  ExternalLink,
  ShieldCheck,
  Building2,
  Mail,
  Loader2,
  RefreshCw,
  Inbox,
  LayoutGrid,
  List,
  Filter,
  CheckCheck,
  AlertTriangle,
  MapPin,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";

export default function OutreachView({
  outreachList = [],
  allLeads = [],
  onOpenReviewModal,
  onQuickSend,
  isSendingId,
  onRefresh,
}) {
  const [filterTab, setFilterTab] = useState("pending"); // pending, sent, all
  const [viewMode, setViewMode] = useState("grid"); // grid, table
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState(new Set());
  const [isBulkSending, setIsBulkSending] = useState(false);

  const isLiveOutreach = (item) => {
    if (item.source === "simulated") return false;
    const found = allLeads.find((l) => l.id === item.leadId);
    return found ? found.source !== "simulated" : true;
  };

  const pendingList = useMemo(
    () => outreachList.filter((o) => o.status === "pending_review"),
    [outreachList]
  );
  const sentList = useMemo(
    () => outreachList.filter((o) => o.status === "sent"),
    [outreachList]
  );

  const baseList =
    filterTab === "pending"
      ? pendingList
      : filterTab === "sent"
      ? sentList
      : outreachList;

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return baseList;
    const q = searchQuery.toLowerCase();
    return baseList.filter((item) => {
      const comp = (item.company || item.leadName || "").toLowerCase();
      const rec = (item.recipient || "").toLowerCase();
      const sub = (item.subject || "").toLowerCase();
      const loc = (item.location || "").toLowerCase();
      return comp.includes(q) || rec.includes(q) || sub.includes(q) || loc.includes(q);
    });
  }, [baseList, searchQuery]);

  const handleCopy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  };

  // Bulk Approve handler for live drafts
  const handleBulkApprove = async () => {
    const liveDraftsToApprove = filteredList.filter(
      (item) => item.status === "pending_review" && isLiveOutreach(item)
    );
    if (!liveDraftsToApprove.length) return;

    setIsBulkSending(true);
    try {
      for (const item of liveDraftsToApprove) {
        await onQuickSend(item);
      }
    } finally {
      setIsBulkSending(false);
    }
  };

  const getInitials = (name = "") => {
    const words = name.replace(/[^a-zA-Z\s]/g, "").trim().split(" ");
    if (!words[0]) return "SP";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  return (
    <div className="lf-view-container lf-animate-fade">
      {/* Campaign Statistics KPI Banner */}
      <div className="lf-outreach-metrics-banner">
        <div className="lf-outreach-metric-box">
          <div className="lf-metric-label">Total Outbound Campaigns</div>
          <div className="lf-metric-num lf-mono">{outreachList.length}</div>
          <div className="lf-metric-sub">Synthesized by DeepSeek</div>
        </div>

        <div className="lf-outreach-metric-box">
          <div className="lf-metric-label">Pending Operator Approval</div>
          <div className="lf-metric-num lf-mono text-amber">{pendingList.length}</div>
          <div className="lf-metric-sub">
            {pendingList.filter(isLiveOutreach).length} live &bull; {pendingList.filter((o) => !isLiveOutreach(o)).length} demo
          </div>
        </div>

        <div className="lf-outreach-metric-box">
          <div className="lf-metric-label">Dispatched via Hostinger</div>
          <div className="lf-metric-num lf-mono text-emerald">{sentList.length}</div>
          <div className="lf-metric-sub">Delivered to executive inboxes</div>
        </div>

        <div className="lf-outreach-metric-box">
          <div className="lf-metric-label">Safety Dispatch Guardrail</div>
          <div className="lf-metric-num lf-mono" style={{ color: "#38bdf8" }}>Active</div>
          <div className="lf-metric-sub">Human confirmation required</div>
        </div>
      </div>

      {/* Main Campaign Management Toolbar */}
      <div className="lf-crm-toolbar">
        {/* Scope Tabs */}
        <div className="lf-scope-tabs">
          <button
            type="button"
            className={`lf-scope-tab ${filterTab === "pending" ? "active" : ""}`}
            onClick={() => setFilterTab("pending")}
          >
            <Clock size={13} />
            <span>Pending Review ({pendingList.length})</span>
          </button>
          <button
            type="button"
            className={`lf-scope-tab ${filterTab === "sent" ? "active" : ""}`}
            onClick={() => setFilterTab("sent")}
          >
            <CheckCircle2 size={13} />
            <span>Dispatched ({sentList.length})</span>
          </button>
          <button
            type="button"
            className={`lf-scope-tab ${filterTab === "all" ? "active" : ""}`}
            onClick={() => setFilterTab("all")}
          >
            <span>All Pitches ({outreachList.length})</span>
          </button>
        </div>

        {/* Search */}
        <div className="lf-search-input-wrap">
          <Search size={15} className="lf-search-icon" />
          <input
            type="text"
            className="lf-search-input"
            placeholder="Search by company, recipient, subject, or port..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="lf-search-clear"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>

        {/* View Mode Toggle & Refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="lf-scope-tabs" style={{ padding: 2 }}>
            <button
              type="button"
              className={`lf-scope-tab ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Card Grid View"
              style={{ padding: "6px 10px" }}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              className={`lf-scope-tab ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Table View"
              style={{ padding: "6px 10px" }}
            >
              <List size={14} />
            </button>
          </div>

          <button
            type="button"
            className="lf-btn-secondary sm"
            onClick={onRefresh}
            title="Refresh outreach list"
          >
            <RefreshCw size={13} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Sub-banner for Pending Tab */}
      {filterTab === "pending" && pendingList.filter(isLiveOutreach).length > 0 && (
        <div className="lf-outreach-bulk-action-bar">
          <div className="lf-bulk-left">
            <Sparkles size={16} className="text-amber" />
            <span>
              <strong>{pendingList.filter(isLiveOutreach).length}</strong> live personalized proposals ready for outbound dispatch.
            </span>
          </div>
          <button
            type="button"
            className="lf-btn-primary sm gold"
            onClick={handleBulkApprove}
            disabled={isBulkSending}
          >
            {isBulkSending ? (
              <>
                <Loader2 size={13} className="spin" />
                <span>Dispatching Batch via Hostinger...</span>
              </>
            ) : (
              <>
                <CheckCheck size={14} />
                <span>Approve All Live Proposals ({pendingList.filter(isLiveOutreach).length})</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Content Rendering: Grid vs Table View */}
      {filteredList.length === 0 ? (
        <div className="lf-panel lf-empty-table">
          <Send size={40} className="text-muted" />
          <h3>No outreach drafts found</h3>
          <p>
            {filterTab === "pending"
              ? "All cold email proposals have been reviewed and dispatched! Head to the Prospector to discover new leads."
              : "No dispatched outreach history found."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* PREMIUM CARD GRID VIEW */
        <div className="lf-outreach-grid">
          {filteredList.map((item) => {
            const isLive = isLiveOutreach(item);
            const isSent = item.status === "sent";
            const initials = getInitials(item.company || item.leadName);

            return (
              <div key={item.id} className="lf-outreach-card-elevated">
                {/* Top Badge & Company Row */}
                <div className="lf-outreach-card-top">
                  <div className="lf-outreach-avatar-group">
                    <div className={`lf-company-avatar ${isLive ? "live" : "demo"}`}>
                      {initials}
                    </div>
                    <div className="lf-outreach-company-info">
                      <div className="lf-outreach-company-title">
                        <span>{item.company || item.leadName}</span>
                        {!isLive && (
                          <span className="lf-badge-demo">Demo</span>
                        )}
                      </div>
                      <div className="lf-outreach-recipient-email lf-mono">
                        &lt;{item.recipient}&gt;
                      </div>
                    </div>
                  </div>

                  <div className="lf-outreach-status-wrapper">
                    {isSent ? (
                      <span className="lf-badge-pill green">
                        <CheckCircle2 size={11} /> Sent {item.sentAt ? `(${item.sentAt.split(" ")[0]})` : ""}
                      </span>
                    ) : (
                      <span className="lf-badge-pill gold">
                        <Clock size={11} /> Ready to Review
                      </span>
                    )}
                  </div>
                </div>

                {/* Location / Meta Pills */}
                {item.location && (
                  <div className="lf-outreach-meta-pill">
                    <MapPin size={11} />
                    <span>{item.location}</span>
                  </div>
                )}

                {/* Subject Line Pill */}
                <div className="lf-outreach-subject-banner">
                  <span className="lf-subject-tag">SUBJECT</span>
                  <span className="lf-subject-line">{item.subject}</span>
                </div>

                {/* Clean Preview Content Box */}
                <div className="lf-outreach-body-preview">
                  {item.body}
                </div>

                {/* Card Actions Footer */}
                <div className="lf-outreach-card-footer">
                  <div className="lf-footer-timestamp lf-mono">
                    {item.createdAt ? `Drafted ${item.createdAt}` : "Drafted Today"}
                  </div>

                  <div className="lf-footer-btn-group">
                    <button
                      type="button"
                      className="lf-btn-icon-sm"
                      onClick={() => handleCopy(`${item.subject}\n\n${item.body}`, item.id)}
                      title="Copy pitch to clipboard"
                    >
                      {copiedId === item.id ? (
                        <Check size={13} className="text-emerald" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>

                    <button
                      type="button"
                      className="lf-btn-secondary sm"
                      onClick={() => onOpenReviewModal(item)}
                    >
                      <Edit3 size={13} />
                      <span>Review / Edit</span>
                    </button>

                    {!isSent && isLive && (
                      <button
                        type="button"
                        className="lf-btn-primary sm gold"
                        onClick={() => onQuickSend(item)}
                        disabled={isSendingId === item.id}
                      >
                        {isSendingId === item.id ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <Send size={13} />
                        )}
                        <span>Approve & Send</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DENSE TABLE VIEW */
        <div className="lf-table-container">
          <table className="lf-crm-table">
            <thead>
              <tr>
                <th>Target Prospect</th>
                <th>Recipient Email</th>
                <th>Subject Line</th>
                <th>Status</th>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((item) => {
                const isLive = isLiveOutreach(item);
                const isSent = item.status === "sent";

                return (
                  <tr key={item.id}>
                    <td>
                      <div className="lf-table-company-name">
                        <span>{item.company || item.leadName}</span>
                        {!isLive && <span className="lf-badge-demo">Demo</span>}
                      </div>
                      {item.location && (
                        <div className="lf-table-company-addr">
                          <MapPin size={10} />
                          <span>{item.location}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="lf-mono" style={{ fontSize: 12 }}>
                        {item.recipient}
                      </span>
                    </td>
                    <td>
                      <div
                        style={{
                          fontWeight: 500,
                          maxWidth: 320,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.subject}
                      </div>
                    </td>
                    <td>
                      {isSent ? (
                        <span className="lf-badge-pill green sm">
                          <CheckCircle2 size={10} /> Sent
                        </span>
                      ) : (
                        <span className="lf-badge-pill gold sm">
                          <Clock size={10} /> Review
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="lf-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
                        {item.createdAt || "Today"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="lf-table-actions">
                        <button
                          type="button"
                          className="lf-btn-icon-xs"
                          onClick={() => handleCopy(`${item.subject}\n\n${item.body}`, item.id)}
                          title="Copy email"
                        >
                          {copiedId === item.id ? (
                            <Check size={12} className="text-emerald" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                        <button
                          type="button"
                          className="lf-btn-secondary xs"
                          onClick={() => onOpenReviewModal(item)}
                        >
                          <Edit3 size={11} />
                          <span>Edit</span>
                        </button>
                        {!isSent && isLive && (
                          <button
                            type="button"
                            className="lf-btn-primary xs gold"
                            onClick={() => onQuickSend(item)}
                            disabled={isSendingId === item.id}
                          >
                            <Send size={11} />
                            <span>Send</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
