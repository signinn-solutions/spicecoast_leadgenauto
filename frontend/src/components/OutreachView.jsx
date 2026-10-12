import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Send,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  Copy,
  Check,
  Edit3,
  Mail,
  Loader2,
  RefreshCw,
  LayoutGrid,
  List,
  AlertTriangle,
  MapPin,
  Save,
  ShieldCheck,
} from "lucide-react";

import useDialogFocus from "../hooks/useDialogFocus.js";

const MAX_DRAFT_CONCURRENCY = 4;

export default function OutreachView({
  outreachList = [],
  allLeads = [],
  onOpenReviewModal,
  onQuickSend,
  isSendingId,
  onRefresh,
  queueLeads = [],
  onClearQueue,
  onGeneratePitch,
  onSaveDraft,
}) {
  const [filterTab, setFilterTab] = useState(queueLeads.length > 0 ? "queue" : "pending"); // queue, pending, sent, all
  const [viewMode, setViewMode] = useState("grid"); // grid, table
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  // Per-lead status map: { [leadId]: 'none' | 'generating' | 'ready' | 'failed' }
  const [draftStatusMap, setDraftStatusMap] = useState({});
  // Freshly generated draft record cache: { [leadId]: outreachRecord }
  const [draftDataMap, setDraftDataMap] = useState({});
  const [isRegeneratingId, setIsRegeneratingId] = useState(null);
  const processingRef = useRef(new Set());

  // Bulk Approve & Send All state
  const [isSendAllModalOpen, setIsSendAllModalOpen] = useState(false);
  const [sendAllTargets, setSendAllTargets] = useState([]);
  const [isSendingAll, setIsSendingAll] = useState(false);
  const [sendAllProgress, setSendAllProgress] = useState({
    current: 0,
    total: 0,
    status: "confirm", // confirm | sending | complete
    successes: 0,
    failures: 0,
    results: [],
  });
  const canceledSendRef = useRef(false);
  const bulkDialogRef = useRef(null);
  useDialogFocus(isSendAllModalOpen, bulkDialogRef, () => {
    if (!isSendingAll) setIsSendAllModalOpen(false);
  }, ".lf-modal-close");

  // Inline editing state
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [isSavingInline, setIsSavingInline] = useState(false);

  // When queueLeads changes or arrives, default filterTab to 'queue' if non-empty
  useEffect(() => {
    if (queueLeads && queueLeads.length > 0) {
      setFilterTab("queue");
      try {
        sessionStorage.setItem("spicecoast_outreach_queue", JSON.stringify(queueLeads));
      } catch {}
    }
  }, [queueLeads]);

  // Bounded Concurrency (4 at a time): process drafts progressively without blocking
  useEffect(() => {
    if (!queueLeads || queueLeads.length === 0) return;

    const queueToProcess = queueLeads.filter((lead) => {
      const hasExisting = outreachList.some(
        (o) => o.leadId === lead.id || (o.recipient && o.recipient === lead.email)
      ) || Boolean(lead.coldMailDraft) || Boolean(draftDataMap[lead.id]);
      const status = draftStatusMap[lead.id];
      return !hasExisting && !processingRef.current.has(lead.id) && status !== "ready" &&
        lead.email && (lead.emailStatus === "deliverable" || lead.emailStatus === "valid" || lead.emailStatus === "mx_valid");
    });

    if (queueToProcess.length === 0) return;

    for (const lead of queueToProcess) {
      processingRef.current.add(lead.id);
    }

    // Mark queued leads as generating immediately so cards render in "Generating draft..." state
    setDraftStatusMap((prev) => {
      const next = { ...prev };
      for (const lead of queueToProcess) {
        if (!next[lead.id] || next[lead.id] === "none") {
          next[lead.id] = "generating";
        }
      }
      return next;
    });

    // Bounded concurrency pool (4 workers)
    (async () => {
      let idx = 0;
      const worker = async () => {
        while (idx < queueToProcess.length) {
          const lead = queueToProcess[idx++];
          if (!lead) break;
          try {
            const res = await onGeneratePitch?.(lead, { force: false, silent: true });
            setDraftStatusMap((prev) => ({ ...prev, [lead.id]: "ready" }));
            if (res?.outreachRecord) {
              setDraftDataMap((prev) => ({ ...prev, [lead.id]: res.outreachRecord }));
            }
          } catch (err) {
            setDraftStatusMap((prev) => ({ ...prev, [lead.id]: "failed" }));
          } finally {
            processingRef.current.delete(lead.id);
          }
        }
      };
      const workerCount = Math.min(MAX_DRAFT_CONCURRENCY, queueToProcess.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      onRefresh?.();
    })();
  }, [queueLeads, outreachList]);

  const handleRegenerateWithAI = async (item) => {
    const leadId = item.leadId || (item.id || "").replace(/^outreach-/, "").replace(/^queue-/, "");
    const lead = item.lead || allLeads.find((l) => l.id === leadId) || {
      id: leadId,
      name: item.company || item.leadName,
      email: item.recipient,
      city: item.location ? item.location.split(",")[0]?.trim() : "",
      country: item.location ? item.location.split(",").slice(1).join(",").trim() : "",
      address: item.location,
    };

    setIsRegeneratingId(leadId);
    setDraftStatusMap((prev) => ({ ...prev, [leadId]: "generating" }));
    try {
      const res = await onGeneratePitch?.(lead, { force: true, silent: false });
      setDraftStatusMap((prev) => ({ ...prev, [leadId]: "ready" }));
      if (res?.outreachRecord) {
        setDraftDataMap((prev) => ({ ...prev, [leadId]: res.outreachRecord }));
      }
    } catch (err) {
      setDraftStatusMap((prev) => ({ ...prev, [leadId]: "failed" }));
    } finally {
      setIsRegeneratingId(null);
    }
  };

  const isLiveOutreach = (item) => {
    if (item.source !== "live") return false;
    const found = allLeads.find((l) => l.id === item.leadId);
    return found ? found.source === "live" : item.source === "live";
  };

  const queueList = useMemo(() => {
    if (!queueLeads || queueLeads.length === 0) return [];
    return queueLeads.map((lead) => {
      const existing = draftDataMap[lead.id] || outreachList.find(
        (o) => o.leadId === lead.id || (o.recipient && o.recipient === lead.email)
      );
      if (existing) {
        return {
          ...existing,
          lead,
          draftState: "ready",
          draftSource: existing.draftSource || (existing.source === "live" ? "groq" : "template_fallback"),
        };
      }
      const fresh = draftDataMap[lead.id];
      if (fresh) {
        return {
          ...fresh,
          lead,
          draftState: "ready",
          draftSource: fresh.draftSource || "groq",
        };
      }
      if (lead.coldMailDraft) {
        return {
          id: `outreach-${lead.id}`,
          leadId: lead.id,
          source: lead.source || "live",
          leadName: lead.name,
          company: lead.name,
          recipient: lead.email,
          location: `${lead.city || ""}, ${lead.country || ""}`.replace(/^, |^ - |, $/g, ""),
          subject: lead.coldMailDraft.subject || "",
          body: lead.coldMailDraft.body || "",
          status: lead.coldMailDraft.status || "pending_review",
          draftState: "ready",
          draftSource: lead.coldMailDraft.source || "groq",
          lead,
        };
      }
      const state = draftStatusMap[lead.id] || "generating";
      return {
        id: `queue-${lead.id}`,
        leadId: lead.id,
        source: lead.source || "live",
        leadName: lead.name,
        company: lead.name,
        recipient: lead.email,
        location: `${lead.city || ""}, ${lead.country || ""}`.replace(/^, |^ - |, $/g, ""),
        subject: "",
        body: "",
        status: "pending_review",
        draftState: state,
        draftSource: "generating",
        lead,
      };
    });
  }, [queueLeads, outreachList, draftDataMap, draftStatusMap]);

  const pendingList = useMemo(
    () => outreachList.filter((o) => o.status === "pending_review"),
    [outreachList]
  );
  const sentList = useMemo(
    () => outreachList.filter((o) => o.status === "sent"),
    [outreachList]
  );

  const baseList =
    filterTab === "queue"
      ? queueList
      : filterTab === "pending"
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

  const startInlineEdit = (item) => {
    setEditingDraftId(item.id);
    setEditSubject(item.subject || "");
    setEditBody(item.body || "");
  };

  const cancelInlineEdit = () => {
    setEditingDraftId(null);
    setEditSubject("");
    setEditBody("");
  };

  const saveInlineEdit = async (item) => {
    if (!onSaveDraft) return;
    const leadId = item.leadId || item.id.replace(/^outreach-/, "").replace(/^queue-/, "");
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

  const isAnyGenerating = useMemo(() => {
    return Object.values(draftStatusMap).some((s) => s === "generating");
  }, [draftStatusMap]);

  const sendableQueueItems = useMemo(() => {
    return queueList.filter((item) => {
      const isSent = item.status === "sent";
      const isLive = isLiveOutreach(item);
      const isReady = item.draftState === "ready" && Boolean(item.subject && item.body);
      return !isSent && isLive && isReady && item.recipient;
    });
  }, [queueList, allLeads]);

  const sendablePendingItems = useMemo(() => {
    return pendingList.filter((item) => {
      const isSent = item.status === "sent";
      const isLive = isLiveOutreach(item);
      return !isSent && isLive && item.recipient && Boolean(item.subject && item.body);
    });
  }, [pendingList, allLeads]);

  const currentSendableList = useMemo(() => {
    if (filterTab === "queue") return sendableQueueItems;
    if (filterTab === "pending") return sendablePendingItems;
    return [];
  }, [filterTab, sendableQueueItems, sendablePendingItems]);

  const handleOpenSendAll = (targets) => {
    if (!targets || targets.length === 0) return;
    setSendAllTargets(targets);
    setSendAllProgress({
      current: 0,
      total: targets.length,
      status: "confirm",
      successes: 0,
      failures: 0,
      results: targets.map((t) => ({ id: t.id, recipient: t.recipient, company: t.company || t.leadName, status: "pending" })),
    });
    canceledSendRef.current = false;
    setIsSendAllModalOpen(true);
  };

  const executeSendAll = async () => {
    if (!sendAllTargets || sendAllTargets.length === 0) return;
    setIsSendingAll(true);
    canceledSendRef.current = false;
    setSendAllProgress((prev) => ({
      ...prev,
      status: "sending",
      current: 0,
      successes: 0,
      failures: 0,
    }));

    let successes = 0;
    let failures = 0;

    for (let i = 0; i < sendAllTargets.length; i++) {
      if (canceledSendRef.current) break;
      const item = sendAllTargets[i];
      setSendAllProgress((prev) => ({
        ...prev,
        current: i,
      }));

      try {
        const ok = await onQuickSend(item, { silent: true });
        if (ok) {
          successes++;
          setSendAllProgress((prev) => {
            const nextResults = [...prev.results];
            nextResults[i] = { ...nextResults[i], status: "sent" };
            return {
              ...prev,
              current: i + 1,
              successes,
              results: nextResults,
            };
          });
        } else {
          failures++;
          setSendAllProgress((prev) => {
            const nextResults = [...prev.results];
            nextResults[i] = { ...nextResults[i], status: "failed" };
            return {
              ...prev,
              current: i + 1,
              failures,
              results: nextResults,
            };
          });
        }
      } catch (err) {
        failures++;
        setSendAllProgress((prev) => {
          const nextResults = [...prev.results];
          nextResults[i] = { ...nextResults[i], status: "failed", error: err.message };
          return {
            ...prev,
            current: i + 1,
            failures,
            results: nextResults,
          };
        });
      }

      // Adaptive anti-burst deliverability spacing (~300ms)
      if (i < sendAllTargets.length - 1 && !canceledSendRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setSendAllProgress((prev) => ({
      ...prev,
      status: "complete",
      current: prev.results.filter((r) => r.status !== "pending").length,
    }));
    setIsSendingAll(false);
    onRefresh?.();
  };

  const cancelSendAll = () => {
    canceledSendRef.current = true;
    setIsSendingAll(false);
    setSendAllProgress((prev) => ({
      ...prev,
      status: "complete",
    }));

  };

  return (
    <div className="lf-view-container lf-animate-fade">
      {/* Queued Leads Active Banner */}
      {queueLeads.length > 0 && (
        <div className="lf-search-complete-banner" style={{ background: "var(--purple-soft)", borderColor: "rgba(125, 98, 236, 0.3)" }}>
          <div className="lf-banner-left">
            <Sparkles size={18} className="text-amber" />
            <div>
              <div className="lf-banner-title" style={{ color: "var(--purple-dark)" }}>
                Selected Review Queue &bull; {queueLeads.length} Lead(s) Loaded from CRM
              </div>
              <div className="lf-banner-text">
                {isAnyGenerating ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Loader2 size={13} className="spin text-amber" />
                    <span>Synthesizing cold proposals in background ({MAX_DRAFT_CONCURRENCY} concurrently)...</span>
                  </span>
                ) : (
                  <>Showing review drafts for your selected lead set. Review each pitch inline and approve individually to send.</>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="lf-btn-secondary sm"
              onClick={onClearQueue}
              title="Clear current selection queue"
              disabled={isSendingAll}
            >
              Clear Queue
            </button>

          </div>
        </div>
      )}

      {/* Action Bar / Filters */}
      <div className="lf-action-bar">
        {/* Scope Tabs */}
        <div className="lf-scope-tabs">
          {queueLeads.length > 0 && (
            <button
              type="button"
              className={`lf-scope-tab ${filterTab === "queue" ? "active" : ""}`}
              onClick={() => setFilterTab("queue")}
            >
              <Sparkles size={13} />
              <span>Queue ({queueLeads.length})</span>
            </button>
          )}
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
            aria-label="Search outreach drafts"
            placeholder="Search by company, recipient, subject, or port..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="lf-search-clear"
              aria-label="Clear outreach search"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>

        {/* View Mode Toggle & Refresh */}
        <div className="lf-action-bar-right">
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



          {currentSendableList.length > 0 && (
            <button
              type="button"
              className="lf-btn-primary sm gold"
              onClick={() => handleOpenSendAll(currentSendableList)}
              disabled={isSendingAll || isAnyGenerating}
              title={`Approve and dispatch all ${currentSendableList.length} ready email(s)`}
            >
              <Send size={13} />
              <span>Approve & Send All ({currentSendableList.length})</span>
            </button>
          )}
        </div>
      </div>

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
        <div className="lf-outreach-grid">
          {filteredList.map((item) => {
            const isLive = isLiveOutreach(item);
            const isSent = item.status === "sent";
            const initials = getInitials(item.company || item.leadName);
            const isGenerating = item.draftState === "generating";
            const isFailed = item.draftState === "failed";
            const isTemplateFallback = item.draftSource === "template_fallback";

            return (
              <div
                key={item.id}
                className={`lf-outreach-card-elevated ${isGenerating ? "lf-card-generating" : ""}`}
              >
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
                        {!isLive && (
                          <span className="lf-badge-demo">Review only</span>
                        )}
                      </div>
                      <div className="lf-outreach-recipient-email lf-mono" title={item.recipient}>
                        &lt;{item.recipient}&gt;
                      </div>
                    </div>
                  </div>

                  <div className="lf-outreach-status-wrapper">
                    {isGenerating ? (
                      <span className="lf-badge-pill amber">
                        <Loader2 size={11} className="spin" /> Generating Draft...
                      </span>
                    ) : isFailed ? (
                      <span className="lf-badge-pill rose">
                        <AlertTriangle size={11} /> Synthesis Failed
                      </span>
                    ) : isSent ? (
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

                {/* Template Fallback Notice Banner */}
                {!isGenerating && isTemplateFallback && (
                  <div className="lf-template-fallback-banner">
                    <span className="lf-badge-pill amber sm" title={item.fallbackReason || 'AI generation was unavailable; this is a local template.'}>
                      <AlertTriangle size={11} /> Template Fallback
                    </span>
                    <button
                      type="button"
                      className="lf-btn-secondary sm"
                      style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}
                      onClick={() => handleRegenerateWithAI(item)}
                      disabled={isRegeneratingId === (item.leadId || item.id)}
                      title="Try regenerating this draft with AI"
                    >
                      {isRegeneratingId === (item.leadId || item.id) ? (
                        <Loader2 size={12} className="spin" />
                      ) : (
                        <Sparkles size={12} className="text-amber" />
                      )}
                      <span>Regenerate with AI</span>
                    </button>
                  </div>
                )}
                {!isGenerating && isTemplateFallback && item.fallbackReason && (
                  <p role="status" style={{ margin: '8px 0 12px', fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>{item.fallbackReason}</p>
                )}

                {/* Body Area */}
                {isGenerating ? (
                  <div className="lf-outreach-generating-placeholder">
                    <div className="lf-skeleton-line" style={{ width: "45%", height: 16, marginBottom: 12, background: "rgba(125, 98, 236, 0.12)" }} />
                    <div className="lf-skeleton-line" style={{ width: "100%", height: 12, marginBottom: 8 }} />
                    <div className="lf-skeleton-line" style={{ width: "90%", height: 12, marginBottom: 8 }} />
                    <div className="lf-skeleton-line" style={{ width: "70%", height: 12, marginBottom: 14 }} />
                    <div className="lf-generating-hint">
                      <Sparkles size={13} className="spin text-amber" />
                      <span>Synthesizing custom B2B export proposal with AI...</span>
                    </div>
                  </div>
                ) : isFailed ? (
                  <div className="lf-outreach-generating-placeholder" style={{ borderColor: "rgba(246, 83, 83, 0.3)" }}>
                    <p style={{ color: "var(--rose)", fontSize: 13, marginBottom: 10 }}>
                      Draft synthesis encountered an issue. You can retry with AI.
                    </p>
                    <button
                      type="button"
                      className="lf-btn-secondary sm"
                      onClick={() => handleRegenerateWithAI(item)}
                      disabled={isRegeneratingId === (item.leadId || item.id)}
                    >
                      <RefreshCw size={12} className={isRegeneratingId === (item.leadId || item.id) ? "spin" : ""} />
                      <span>Retry with AI</span>
                    </button>
                  </div>
                ) : editingDraftId === item.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "10px 0" }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--amber-bright)", textTransform: "uppercase" }}>Subject Line:</label>
                      <input
                        type="text"
                        className="lf-input"
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        placeholder="Subject..."
                        disabled={isSavingInline}
                        style={{ marginTop: 2 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--amber-bright)", textTransform: "uppercase" }}>Email Body Pitch:</label>
                      <textarea
                        className="lf-input"
                        rows={6}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        placeholder="Pitch body..."
                        disabled={isSavingInline}
                        style={{ marginTop: 2, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="lf-outreach-subject-banner">
                      <span className="lf-subject-tag">SUBJECT</span>
                      <span className="lf-subject-line" title={item.subject}>{item.subject}</span>
                    </div>

                    <div className="lf-outreach-body-preview">
                      {item.body}
                    </div>
                  </>
                )}

                {/* Card Actions Footer */}
                <div className="lf-outreach-card-footer">
                  <div className="lf-footer-timestamp lf-mono">
                    {isGenerating ? "Queued in batch" : item.createdAt ? `Drafted ${item.createdAt}` : "Drafted Today"}
                  </div>

                  <div className="lf-footer-btn-group">
                    {isGenerating ? (
                      <button type="button" className="lf-btn-secondary sm" disabled>
                        <span>Drafting...</span>
                      </button>
                    ) : isFailed ? (
                      <button
                        type="button"
                        className="lf-btn-secondary sm"
                        onClick={() => handleRegenerateWithAI(item)}
                        disabled={isRegeneratingId === (item.leadId || item.id)}
                      >
                        <RefreshCw size={13} className={isRegeneratingId === (item.leadId || item.id) ? "spin" : ""} />
                        <span>Retry</span>
                      </button>
                    ) : editingDraftId === item.id ? (
                      <>
                        <button
                          type="button"
                          className="lf-btn-secondary sm"
                          onClick={cancelInlineEdit}
                          disabled={isSavingInline}
                        >
                          <span>Cancel</span>
                        </button>
                        <button
                          type="button"
                          className="lf-btn-primary sm"
                          onClick={() => saveInlineEdit(item)}
                          disabled={isSavingInline}
                        >
                          {isSavingInline ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
                          <span>Save Draft</span>
                        </button>
                      </>
                    ) : (
                      <>
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
                          onClick={() => startInlineEdit(item)}
                        >
                          <Edit3 size={13} />
                          <span>Inline Edit</span>
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
                      </>
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
                const isGenerating = item.draftState === "generating";
                const isTemplateFallback = item.draftSource === "template_fallback";

                return (
                  <tr key={item.id}>
                    <td>
                      <div className="lf-table-company-name">
                        <span>{item.company || item.leadName}</span>
                        {!isLive && <span className="lf-badge-demo">Review only</span>}
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
                        {isGenerating ? (
                          <span className="text-amber" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Loader2 size={12} className="spin" /> Generating draft...
                          </span>
                        ) : (
                          <>
                            {item.subject}
                            {isTemplateFallback && (
                              <span className="lf-badge-pill amber xs" style={{ marginLeft: 6 }}>
                                Template Fallback
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      {isGenerating ? (
                        <span className="lf-badge-pill amber sm">
                          <Loader2 size={10} className="spin" /> Drafting
                        </span>
                      ) : isSent ? (
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
                        {isGenerating ? "In progress" : item.createdAt || "Today"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="lf-table-actions">
                        {isGenerating ? (
                          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Preparing...</span>
                        ) : (
                          <>
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
                            {isTemplateFallback && (
                              <button
                                type="button"
                                className="lf-btn-secondary xs"
                                onClick={() => handleRegenerateWithAI(item)}
                                disabled={isRegeneratingId === (item.leadId || item.id)}
                                title="Regenerate with AI"
                              >
                                <Sparkles size={11} className="text-amber" />
                                <span>AI</span>
                              </button>
                            )}
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
                          </>
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

      {/* Approve & Send All Confirmation and Progress Modal */}
      {isSendAllModalOpen && (
        <div
          className="lf-modal-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget && !isSendingAll) setIsSendAllModalOpen(false);
          }}
        >
          <div ref={bulkDialogRef} className="lf-modal-card" role="dialog" aria-modal="true" aria-labelledby="bulk-dispatch-title" tabIndex={-1} style={{ maxWidth: 640 }}>
            {/* Header */}
            <div className="lf-modal-header">
              <div className="lf-modal-title-group">
                <div className="lf-modal-title" id="bulk-dispatch-title">
                  <Send size={18} className="text-amber" />
                  <span>
                    {sendAllProgress.status === "sending"
                      ? `Dispatching Emails (${sendAllProgress.current}/${sendAllProgress.total})`
                      : sendAllProgress.status === "complete"
                      ? "Bulk Dispatch Complete"
                      : `Approve & Dispatch All Emails (${sendAllTargets.length})`}
                  </span>
                </div>
                <div className="lf-modal-subtitle">
                  {sendAllProgress.status === "sending"
                    ? "Sequential delivery via Hostinger REST Mail API with adaptive anti-burst pacing"
                    : sendAllProgress.status === "complete"
                    ? `Finished processing ${sendAllProgress.total} outreach email(s)`
                    : `Review and confirm bulk dispatch for ${filterTab === "queue" ? "Selected CRM Queue" : "Pending Review"} drafts`}
                </div>
              </div>
              {!isSendingAll && (
                <button
                  type="button"
                  className="lf-modal-close"
                  aria-label="Close bulk dispatch dialog"
                  onClick={() => setIsSendAllModalOpen(false)}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Body */}
            <div className="lf-modal-body" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Progress Bar when sending or complete */}
              {(sendAllProgress.status === "sending" || sendAllProgress.status === "complete") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                    <span>
                      {sendAllProgress.status === "sending"
                        ? `Sending ${sendAllProgress.current} of ${sendAllProgress.total}...`
                        : `Completed: ${sendAllProgress.successes} Sent, ${sendAllProgress.failures} Failed`}
                    </span>
                    <span className="lf-mono">
                      {Math.round((sendAllProgress.current / (sendAllProgress.total || 1)) * 100)}%
                    </span>
                  </div>
                  <div style={{ height: 8, background: "var(--bg-surface-2)", borderRadius: 4, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round((sendAllProgress.current / (sendAllProgress.total || 1)) * 100)}%`,
                        background: sendAllProgress.failures > 0 ? "var(--amber-gold)" : "var(--emerald)",
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Deliverability info box when in confirm state */}
              {sendAllProgress.status === "confirm" && (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.25)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    fontSize: 13,
                    color: "var(--text-main)",
                  }}
                >
                  <ShieldCheck size={18} className="text-amber" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong>Hostinger Agentic Sender Protection</strong>:
                    <div style={{ marginTop: 2, color: "var(--text-muted)", fontSize: 12 }}>
                      Emails will be sent with ~300ms intervals to safeguard sender reputation, prevent spam score penalties, and ensure 100% deliverability.
                    </div>
                  </div>
                </div>
              )}

              {/* Recipients List */}
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Target Recipients ({sendAllTargets.length})
              </div>
              <div
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  border: "1px solid var(--border-card)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-surface-1)",
                }}
              >
                {sendAllTargets.map((item, idx) => {
                  const res = sendAllProgress.results[idx];
                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderBottom: idx < sendAllTargets.length - 1 ? "1px solid var(--border-subtle)" : "none",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1, paddingRight: 10 }}>
                        <span style={{ fontWeight: 600, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.company || item.leadName || "Business Lead"}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {item.recipient}
                        </span>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {res?.status === "sent" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--emerald)", fontSize: 12, fontWeight: 600 }}>
                            <CheckCircle2 size={14} /> Sent
                          </span>
                        ) : res?.status === "failed" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--crimson)", fontSize: 12, fontWeight: 600 }}>
                            <AlertTriangle size={14} /> Failed
                          </span>
                        ) : sendAllProgress.status === "sending" && sendAllProgress.current === idx ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--amber-gold)", fontSize: 12, fontWeight: 600 }}>
                            <Loader2 size={13} className="spin" /> Sending...
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div
              className="lf-modal-footer"
              style={{ padding: "16px 24px", display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid var(--border-card)" }}
            >
              {sendAllProgress.status === "confirm" ? (
                <>
                  <button
                    type="button"
                    className="lf-btn-secondary"
                    onClick={() => setIsSendAllModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="lf-btn-primary gold"
                    onClick={executeSendAll}
                  >
                    <Send size={14} />
                    <span>Confirm & Dispatch ({sendAllTargets.length})</span>
                  </button>
                </>
              ) : sendAllProgress.status === "sending" ? (
                <button
                  type="button"
                  className="lf-btn-secondary"
                  onClick={cancelSendAll}
                >
                  Stop Dispatch
                </button>
              ) : (
                <button
                  type="button"
                  className="lf-btn-primary gold"
                  onClick={() => {
                    setIsSendAllModalOpen(false);
                  }}
                >
                  <span>Done</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
