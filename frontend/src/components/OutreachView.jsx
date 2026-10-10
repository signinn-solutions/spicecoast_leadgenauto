import React, { useState, useMemo, useEffect } from "react";
import { Send, Search, CheckCircle2, Clock, Sparkles, Copy, Check, Edit3, ExternalLink, ShieldCheck, Building2, Mail, Loader2, RefreshCw, Inbox, LayoutGrid, List, Filter, CheckCheck, AlertTriangle, MapPin, ChevronRight, SlidersHorizontal, X, Save } from "lucide-react";
export default function OutreachView({
  canSend = true,
  canDraft = true,
  outreachList = [],
  allLeads = [],
  onOpenReviewModal,
  onQuickSend,
  isSendingId,
  onRefresh,
  queueLeads = [],
  onClearQueue,
  onGeneratePitch,
  onSaveDraft
}) {
  const [filterTab, setFilterTab] = useState(queueLeads.length > 0 ? "queue" : "pending"); // queue, pending, sent, all
  const [viewMode, setViewMode] = useState("grid"); // grid, table
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  // Inline editing state
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [isSavingInline, setIsSavingInline] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);

  // When queueLeads changes or arrives, default filterTab to 'queue' if non-empty
  useEffect(() => {
    if (queueLeads && queueLeads.length > 0) {
      setFilterTab("queue");
    }
  }, [queueLeads]);

  // Auto-generate missing drafts for queued leads on arrival
  useEffect(() => {
    if (!canDraft || !queueLeads || queueLeads.length === 0) return;
    let active = true;
    const generateMissing = async () => {
      const missingLeads = queueLeads.filter(lead => {
        const hasExisting = outreachList.some(o => o.leadId === lead.id || o.recipient && o.recipient === lead.email) || Boolean(lead.coldMailDraft);
        return !hasExisting && lead.email && (lead.emailStatus === "deliverable" || lead.emailStatus === "valid");
      });
      if (missingLeads.length === 0) return;
      setAutoGenerating(true);
      try {
        for (const lead of missingLeads) {
          if (!active) break;
          await onGeneratePitch?.(lead);
        }
      } finally {
        if (active) setAutoGenerating(false);
      }
    };
    generateMissing();
    return () => {
      active = false;
    };
  }, [queueLeads, outreachList]);
  const isLiveOutreach = item => {
    if (item.source !== "live") return false;
    const found = allLeads.find(l => l.id === item.leadId);
    return found?.source === "live";
  };
  const queueLeadIdSet = useMemo(() => new Set((queueLeads || []).map(l => l.id)), [queueLeads]);
  const queueList = useMemo(() => {
    if (!queueLeads || queueLeads.length === 0) return [];
    return outreachList.filter(o => queueLeadIdSet.has(o.leadId) || queueLeads.some(l => l.email === o.recipient));
  }, [outreachList, queueLeads, queueLeadIdSet]);
  const pendingList = useMemo(() => outreachList.filter(o => o.status === "pending_review"), [outreachList]);
  const sentList = useMemo(() => outreachList.filter(o => o.status === "sent"), [outreachList]);
  const baseList = filterTab === "queue" ? queueList : filterTab === "pending" ? pendingList : filterTab === "sent" ? sentList : outreachList;
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return baseList;
    const q = searchQuery.toLowerCase();
    return baseList.filter(item => {
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
  const startInlineEdit = item => {
    setEditingDraftId(item.id);
    setEditSubject(item.subject || "");
    setEditBody(item.body || "");
  };
  const cancelInlineEdit = () => {
    setEditingDraftId(null);
    setEditSubject("");
    setEditBody("");
  };
  const saveInlineEdit = async item => {
    if (!onSaveDraft) return;
    const leadId = item.leadId || item.id.replace(/^outreach-/, "");
    setIsSavingInline(true);
    try {
      await onSaveDraft(leadId, editSubject, editBody);
      setEditingDraftId(null);
    } finally {
      setIsSavingInline(false);
    }
  };
  const getInitials = (name = "") => {
    const words = name.replace(/[^a-zA-Z\s]/g, "").trim().split(" ");
    if (!words[0]) return "SP";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };
  return <div className="lf-view-container lf-animate-fade">
      {/* Queued Leads Active Banner */}
      {queueLeads.length > 0 && <div className="lf-search-complete-banner" style={{
      background: "var(--purple-soft)",
      borderColor: "rgba(125, 98, 236, 0.3)"
    }}>
          <div className="lf-banner-left">
            <Sparkles size={18} className="text-amber" />
            <div>
              <div className="lf-banner-title" style={{
            color: "var(--purple-dark)"
          }}>
                Selected Review Queue &bull; {queueLeads.length} Lead(s) Loaded from CRM
              </div>
              <div className="lf-banner-text">
                {autoGenerating ? <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6
            }}>
                    <Loader2 size={13} className="spin text-amber" />
                    <span>Auto-generating missing cold proposals for selected leads...</span>
                  </span> : <>Showing review drafts for your selected lead set. Review each pitch inline and approve individually to send.</>}
              </div>
            </div>
          </div>
          <button type="button" className="lf-btn-secondary sm" onClick={onClearQueue}>
            <X size={14} />
            <span>Clear Queue</span>
          </button>
        </div>}
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
            {pendingList.filter(isLiveOutreach).length} live &bull; {pendingList.filter(o => !isLiveOutreach(o)).length} review only
          </div>
        </div>

        <div className="lf-outreach-metric-box">
          <div className="lf-metric-label">Dispatched via Hostinger</div>
          <div className="lf-metric-num lf-mono text-emerald">{sentList.length}</div>
          <div className="lf-metric-sub">Delivered to executive inboxes</div>
        </div>

        <div className="lf-outreach-metric-box">
          <div className="lf-metric-label">Safety Dispatch Guardrail</div>
          <div className="lf-metric-num lf-mono text-blue">Active</div>
          <div className="lf-metric-sub">Human confirmation required</div>
        </div>
      </div>

      {/* Main Campaign Management Toolbar */}
      <div className="lf-crm-toolbar">
        {/* Scope Tabs */}
        <div className="lf-scope-tabs">
          {queueLeads.length > 0 && <button type="button" className={`lf-scope-tab ${filterTab === "queue" ? "active" : ""}`} onClick={() => setFilterTab("queue")}>
              <Sparkles size={13} className="text-amber" />
              <span>Selected Queue ({queueList.length})</span>
            </button>}
          <button type="button" className={`lf-scope-tab ${filterTab === "pending" ? "active" : ""}`} onClick={() => setFilterTab("pending")}>
            <Clock size={13} />
            <span>Pending Review ({pendingList.length})</span>
          </button>
          <button type="button" className={`lf-scope-tab ${filterTab === "sent" ? "active" : ""}`} onClick={() => setFilterTab("sent")}>
            <CheckCircle2 size={13} />
            <span>Dispatched ({sentList.length})</span>
          </button>
          <button type="button" className={`lf-scope-tab ${filterTab === "all" ? "active" : ""}`} onClick={() => setFilterTab("all")}>
            <span>All Pitches ({outreachList.length})</span>
          </button>
        </div>

        {/* Search */}
        <div className="lf-search-input-wrap">
          <Search size={15} className="lf-search-icon" />
          <input type="text" className="lf-search-input" placeholder="Search by company, recipient, subject, or port..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && <button type="button" className="lf-search-clear" onClick={() => setSearchQuery("")}>
              ✕
            </button>}
        </div>

        {/* View Mode Toggle & Refresh */}
        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
          <div className="lf-scope-tabs" style={{
          padding: 2
        }}>
            <button type="button" className={`lf-scope-tab ${viewMode === "grid" ? "active" : ""}`} onClick={() => setViewMode("grid")} title="Card Grid View" style={{
            padding: "6px 10px"
          }}>
              <LayoutGrid size={14} />
            </button>
            <button type="button" className={`lf-scope-tab ${viewMode === "table" ? "active" : ""}`} onClick={() => setViewMode("table")} title="Table View" style={{
            padding: "6px 10px"
          }}>
              <List size={14} />
            </button>
          </div>

          <button type="button" className="lf-btn-secondary sm" onClick={onRefresh} title="Refresh outreach list">
            <RefreshCw size={13} />
            <span>Sync</span>
          </button>
        </div>
      </div>



      {/* Content Rendering: Grid vs Table View */}
      {filteredList.length === 0 ? <div className="lf-panel lf-empty-table">
          <Send size={40} className="text-muted" />
          <h3>No outreach drafts found</h3>
          <p>
            {filterTab === "pending" ? "All cold email proposals have been reviewed and dispatched! Head to the Prospector to discover new leads." : "No dispatched outreach history found."}
          </p>
        </div> : viewMode === "grid" ? <div className="lf-outreach-grid">
          {filteredList.map(item => {
        const isLive = isLiveOutreach(item);
        const isSent = item.status === "sent";
        const initials = getInitials(item.company || item.leadName);
        return <div key={item.id} className="lf-outreach-card-elevated">
                {/* Top Badge & Company Row */}
                <div className="lf-outreach-card-top">
                  <div className="lf-outreach-avatar-group">
                    <div className={`lf-company-avatar ${isLive ? "live" : "demo"}`}>
                      {initials}
                    </div>
                    <div className="lf-outreach-company-info">
                      <div className="lf-outreach-company-title">
                        <span className="lf-company-name-text" title={item.company || item.leadName}>
                          {item.company || item.leadName}
                        </span>
                        {!isLive && <span className="lf-badge-demo">Review only</span>}
                      </div>
                      <div className="lf-outreach-recipient-email lf-mono" title={item.recipient}>
                        &lt;{item.recipient}&gt;
                      </div>
                    </div>
                  </div>

                  <div className="lf-outreach-status-wrapper">
                    {isSent ? <span className="lf-badge-pill green">
                        <CheckCircle2 size={11} /> Sent {item.sentAt ? `(${item.sentAt.split(" ")[0]})` : ""}
                      </span> : <span className="lf-badge-pill gold">
                        <Clock size={11} /> Ready to Review
                      </span>}
                  </div>
                </div>

                {/* Location / Meta Pills */}
                {item.location && <div className="lf-outreach-meta-pill">
                    <MapPin size={11} />
                    <span>{item.location}</span>
                  </div>}

                {/* Subject Line Pill / Inline Edit Subject */}
                {editingDraftId === item.id ? <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            margin: "10px 0"
          }}>
                    <div>
                      <label style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--amber-bright)",
                textTransform: "uppercase"
              }}>Subject Line:</label>
                      <input type="text" className="lf-input" value={editSubject} onChange={e => setEditSubject(e.target.value)} placeholder="Subject..." disabled={isSavingInline} style={{
                marginTop: 2
              }} />
                    </div>
                    <div>
                      <label style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--amber-bright)",
                textTransform: "uppercase"
              }}>Email Body Pitch:</label>
                      <textarea className="lf-input" rows={6} value={editBody} onChange={e => setEditBody(e.target.value)} placeholder="Pitch body..." disabled={isSavingInline} style={{
                marginTop: 2,
                resize: "vertical",
                fontFamily: "var(--font-sans)",
                lineHeight: 1.5
              }} />
                    </div>
                  </div> : <>
                    <div className="lf-outreach-subject-banner">
                      <span className="lf-subject-tag">SUBJECT</span>
                      <span className="lf-subject-line" title={item.subject}>{item.subject}</span>
                    </div>

                    <div className="lf-outreach-body-preview">
                      {item.body}
                    </div>
                  </>}

                {/* Card Actions Footer */}
                <div className="lf-outreach-card-footer">
                  <div className="lf-footer-timestamp lf-mono">
                    {item.createdAt ? `Drafted ${item.createdAt}` : "Drafted Today"}
                  </div>

                  <div className="lf-footer-btn-group">
                    {editingDraftId === item.id ? <>
                        <button type="button" className="lf-btn-secondary sm" onClick={cancelInlineEdit} disabled={isSavingInline}>
                          <span>Cancel</span>
                        </button>
                        <button type="button" className="lf-btn-primary sm" onClick={() => saveInlineEdit(item)} disabled={isSavingInline}>
                          {isSavingInline ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
                          <span>Save Draft</span>
                        </button>
                      </> : <>
                        <button type="button" className="lf-btn-icon-sm" onClick={() => handleCopy(`${item.subject}\n\n${item.body}`, item.id)} title="Copy pitch to clipboard">
                          {copiedId === item.id ? <Check size={13} className="text-emerald" /> : <Copy size={13} />}
                        </button>

                        <button type="button" className="lf-btn-secondary sm" disabled={!canDraft} onClick={() => startInlineEdit(item)}>
                          <Edit3 size={13} />
                          <span>Inline Edit</span>
                        </button>

                        {!isSent && isLive && <button type="button" className="lf-btn-primary sm gold" onClick={() => onQuickSend(item)} disabled={isSendingId === item.id || isSendingId === item.leadId || !canSend}>
                            {isSendingId === item.id || isSendingId === item.leadId ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
                            <span>Approve & Send</span>
                          </button>}
                      </>}
                  </div>
                </div>
              </div>;
      })}
        </div> : (/* DENSE TABLE VIEW */
    <div className="lf-table-container">
          <table className="lf-crm-table">
            <thead>
              <tr>
                <th>Target Prospect</th>
                <th>Recipient Email</th>
                <th>Subject Line</th>
                <th>Status</th>
                <th>Date</th>
                <th style={{
              textAlign: "right"
            }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map(item => {
            const isLive = isLiveOutreach(item);
            const isSent = item.status === "sent";
            return <tr key={item.id}>
                    <td>
                      <div className="lf-table-company-name">
                        <span>{item.company || item.leadName}</span>
                        {!isLive && <span className="lf-badge-demo">Review only</span>}
                      </div>
                      {item.location && <div className="lf-table-company-addr">
                          <MapPin size={10} />
                          <span>{item.location}</span>
                        </div>}
                    </td>
                    <td>
                      <span className="lf-mono" style={{
                  fontSize: 12
                }}>
                        {item.recipient}
                      </span>
                    </td>
                    <td>
                      <div style={{
                  fontWeight: 500,
                  maxWidth: 320,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}>
                        {item.subject}
                      </div>
                    </td>
                    <td>
                      {isSent ? <span className="lf-badge-pill green sm">
                          <CheckCircle2 size={10} /> Sent
                        </span> : <span className="lf-badge-pill gold sm">
                          <Clock size={10} /> Review
                        </span>}
                    </td>
                    <td>
                      <span className="lf-mono" style={{
                  fontSize: 11,
                  color: "var(--text-faint)"
                }}>
                        {item.createdAt || "Today"}
                      </span>
                    </td>
                    <td style={{
                textAlign: "right"
              }}>
                      <div className="lf-table-actions">
                        <button type="button" className="lf-btn-icon-xs" onClick={() => handleCopy(`${item.subject}\n\n${item.body}`, item.id)} title="Copy email">
                          {copiedId === item.id ? <Check size={12} className="text-emerald" /> : <Copy size={12} />}
                        </button>
                        <button type="button" className="lf-btn-secondary xs" onClick={() => onOpenReviewModal(item)}>
                          <Edit3 size={11} />
                          <span>Edit</span>
                        </button>
                        {!isSent && isLive && <button type="button" className="lf-btn-primary xs gold" onClick={() => onQuickSend(item)} disabled={isSendingId === item.id || isSendingId === item.leadId || !canSend}>
                            <Send size={11} />
                            <span>Send</span>
                          </button>}
                      </div>
                    </td>
                  </tr>;
          })}
            </tbody>
          </table>
        </div>)}
    </div>;
}
