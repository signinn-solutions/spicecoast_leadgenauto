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
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState(null);

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
      return comp.includes(q) || rec.includes(q) || sub.includes(q);
    });
  }, [baseList, searchQuery]);

  const handleCopy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  };

  return (
    <div className="lf-view-container lf-animate-fade">
      {/* Top Banner */}
      <div className="lf-section-header">
        <div>
          <h2 className="lf-section-title">Autonomous Cold Outreach Studio</h2>
          <p className="lf-section-subtitle">
            Review personalized DeepSeek B2B trade proposals, calibrate tone, and approve outbound dispatches via Hostinger.
          </p>
        </div>
        <button
          type="button"
          className="lf-btn-secondary sm"
          onClick={onRefresh}
        >
          <RefreshCw size={13} />
          <span>Sync Outbox</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="lf-crm-toolbar">
        <div className="lf-scope-tabs">
          <button
            type="button"
            className={`lf-scope-tab ${filterTab === "pending" ? "active" : ""}`}
            onClick={() => setFilterTab("pending")}
          >
            Pending Review ({pendingList.length})
          </button>
          <button
            type="button"
            className={`lf-scope-tab ${filterTab === "sent" ? "active" : ""}`}
            onClick={() => setFilterTab("sent")}
          >
            Dispatched ({sentList.length})
          </button>
          <button
            type="button"
            className={`lf-scope-tab ${filterTab === "all" ? "active" : ""}`}
            onClick={() => setFilterTab("all")}
          >
            All Campaigns ({outreachList.length})
          </button>
        </div>

        <div className="lf-search-input-wrap">
          <Search size={15} className="lf-search-icon" />
          <input
            type="text"
            className="lf-search-input"
            placeholder="Search proposals by recipient, company, or subject..."
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
      </div>

      {/* Outreach Cards List */}
      {filteredList.length === 0 ? (
        <div className="lf-panel lf-empty-table">
          <Send size={36} className="text-muted" />
          <h3>No outreach drafts found in this category</h3>
          <p>
            {filterTab === "pending"
              ? "All drafts have been reviewed or sent! Run a discovery harvest to generate fresh proposals."
              : "No dispatched campaigns recorded yet."}
          </p>
        </div>
      ) : (
        <div className="lf-outreach-grid">
          {filteredList.map((item) => {
            const isLive = isLiveOutreach(item);
            const isSent = item.status === "sent";

            return (
              <div key={item.id} className="lf-outreach-card">
                {/* Header */}
                <div className="lf-outreach-card-header">
                  <div className="lf-outreach-target">
                    <div className="lf-outreach-company">
                      <span>{item.company || item.leadName}</span>
                      {!isLive && (
                        <span className="lf-badge-pill gold sm">Demo Contact</span>
                      )}
                    </div>
                    <div className="lf-outreach-email lf-mono">
                      &lt;{item.recipient}&gt;
                    </div>
                  </div>

                  <div className="lf-outreach-status-pill">
                    {isSent ? (
                      <span className="lf-badge-pill green">
                        <CheckCircle2 size={11} /> Sent {item.sentAt ? `(${item.sentAt.split(" ")[0]})` : ""}
                      </span>
                    ) : (
                      <span className="lf-badge-pill gold">
                        <Clock size={11} /> Pending Review
                      </span>
                    )}
                  </div>
                </div>

                {/* Subject Line */}
                <div className="lf-outreach-subject">
                  <span className="lf-label-prefix">Subject:</span>
                  <span className="lf-subject-text">{item.subject}</span>
                </div>

                {/* Body Preview */}
                <div className="lf-outreach-preview-box">
                  {item.body}
                </div>

                {/* Footer Controls */}
                <div className="lf-outreach-footer">
                  <div className="lf-footer-date">
                    <span>Created: {item.createdAt || "Today"}</span>
                  </div>

                  <div className="lf-footer-actions">
                    <button
                      type="button"
                      className="lf-btn-icon-sm"
                      onClick={() => handleCopy(`${item.subject}\n\n${item.body}`, item.id)}
                      title="Copy email to clipboard"
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
                      <span>Edit & Review</span>
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
      )}
    </div>
  );
}
