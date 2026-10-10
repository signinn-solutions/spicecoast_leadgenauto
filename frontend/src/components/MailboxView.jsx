import InboxView from "./InboxView.jsx";
import React, { useState } from "react";
import { Inbox, Send, Flame, Clock, CheckCircle2, AlertCircle, Sparkles, RefreshCw, Mail, UserCheck, Package, Bot, Copy, Check, Loader2, Calendar, ArrowRight, TrendingUp, Archive, ChevronRight, MessageSquare, Target, Zap, RotateCcw, Info, ExternalLink } from "lucide-react";
export default function MailboxView({
  canSend = true,
  canDraft = true,
  onDraftReply,
  mailboxStatus = {},
  mailLifecycle = null,
  mailboxMessages = [],
  onRefresh,
  isRefreshing,
  onSendReply,
  isSendingReplyId,
  onSendFollowUp,
  isSendingFollowUpId,
  onUpdateFollowUpDraft,
  onReopenLead,
  onSimulateInbound,
  isSimulating
}) {
  // Navigation: 4 lifecycle tabs + simulator modal/toggle
  const [activeTab, setActiveTab] = useState("inbox"); // sent, replied, followup, hot
  const [showSimulator, setShowSimulator] = useState(false);
  const [showClosedLeads, setShowClosedLeads] = useState(false);

  // Selected lead or message for detailed thread inspection in Replied & Hot views
  const [selectedRepliedId, setSelectedRepliedId] = useState(null);
  const [selectedHotLeadId, setSelectedHotLeadId] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  // Follow-up editing draft local states: { [leadId]: { subject, body } }
  const [editingDrafts, setEditingDrafts] = useState({});
  const [isSavingDraftId, setIsSavingDraftId] = useState(null);
  const [reopeningLeadId, setReopeningLeadId] = useState(null);

  // Derive lifecycle datasets with safe fallbacks
  const analytics = mailLifecycle?.analytics || {
    totalSentThisWeek: 0,
    replyRatePercent: 0,
    hotLeadsCount: 0,
    followUpDueCount: 0,
    closedNoResponseCount: 0,
    totalContacted: 0
  };
  const sentLeads = mailLifecycle?.tabs?.sent || [];
  const repliedLeads = mailLifecycle?.tabs?.replied || [];
  const followUpQueue = mailLifecycle?.tabs?.followUpQueue || [];
  const hotLeads = mailLifecycle?.tabs?.hotLeads || [];
  const closedLeads = mailLifecycle?.tabs?.closed || [];

  // Simulator preset scenarios
  const simScenarios = [{
    title: "Hamburg &bull; Black Pepper 2 FCL",
    from: "markus.weber@eurospice-hamburg.de",
    name: "Markus Weber (EuroSpice Distribution GmbH)",
    subject: "FOB Price Quote & Specification: 2 FCL Malabar Black Pepper 550GL",
    body: `Dear SpiceCoast Export Sales Team,

We are looking to contract 2 full container loads (FCL 20ft) of Malabar Black Pepper (Garbled, min 550 GL density) for Q4 shipment to Hamburg Port, Germany.

Please provide your current FOB Cochin and CIF Hamburg price quotation along with recent laboratory certificate of analysis for pesticide residue compliance (EU standards).

Best regards,
Markus Weber
Head of Procurement & Commodity Sourcing
EuroSpice Distribution GmbH, Hamburg`
  }, {
    title: "Dubai &bull; Green Cardamom 5 MT",
    from: "rashid.almaktoum@gulfspices-uae.com",
    name: "Rashid Al-Maktoum (Gulf Commodity Trading LLC)",
    subject: "Inquiry: Alleppey Green Cardamom Extra Bold 8mm Air Cargo",
    body: `Hello Team SpiceCoast,

We require an urgent air cargo consignment of 5 Metric Tons of premium Alleppey Green Cardamom (Extra Bold 8mm grade, deep green color) delivered to Dubai International Airport (DXB).

Kindly confirm batch availability, moisture content specs, and your best CIF Dubai price per metric ton.

Regards,
Rashid Al-Maktoum
Managing Partner
Gulf Commodity Trading LLC, Dubai, UAE`
  }, {
    title: "Rotterdam &bull; Organic Turmeric 10 MT",
    from: "eva.janssen@hollandorganics.nl",
    name: "Eva Janssen (Holland Organics BV)",
    subject: "Bulk Order: Organic Alleppey Turmeric Finger (Curcumin > 5%)",
    body: `Good day,

Holland Organics is expanding our organic raw material line and we require 10 Metric Tons of organic certified Alleppey Turmeric Fingers with guaranteed minimum 5% curcumin content.

Destination: Port of Rotterdam. Please send product specs, organic transaction certificates, and sea-freight timeline.

Kind regards,
Eva Janssen
Holland Organics BV, Rotterdam`
  }, {
    title: "New York &bull; Cloves 1 FCL",
    from: "david.miller@nyflavourimports.com",
    name: "David Miller (New York Flavour Imports)",
    subject: "Inquiry: Tellicherry Hand-Picked Cloves Container Pricing",
    body: `Hi SpiceCoast Sales,

We are sourcing 1 FCL of premium hand-picked Tellicherry cloves (headless < 2%) for private label packaging in New York.

Could you share FOB Cochin container quotes and send sample packages to our Manhattan test kitchen?

Thank you,
David Miller
Director of Imports, NY Flavour Imports`
  }];
  const [simFrom, setSimFrom] = useState(simScenarios[0].from);
  const [simName, setSimName] = useState(simScenarios[0].name);
  const [simSubject, setSimSubject] = useState(simScenarios[0].subject);
  const [simBody, setSimBody] = useState(simScenarios[0].body);
  const handleCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {}
  };
  const handleSimSubmit = async e => {
    e.preventDefault();
    await onSimulateInbound({
      from: simFrom,
      from_name: simName,
      subject: simSubject,
      message: simBody
    });
    setShowSimulator(false);
    onRefresh?.();
  };

  // Follow-up draft input state accessors
  const getDraftSubject = lead => {
    if (editingDrafts[lead.id]?.subject !== undefined) {
      return editingDrafts[lead.id].subject;
    }
    return lead.follow_up_draft?.subject || `Re: ${lead.subject || "Spice Export Partnership"}`;
  };
  const getDraftBody = lead => {
    if (editingDrafts[lead.id]?.body !== undefined) {
      return editingDrafts[lead.id].body;
    }
    return lead.follow_up_draft?.body || "";
  };
  const handleDraftChange = (leadId, field, value) => {
    setEditingDrafts(prev => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        [field]: value
      }
    }));
  };
  const handleSaveFollowUpDraft = async lead => {
    if (!onUpdateFollowUpDraft) return;
    setIsSavingDraftId(lead.id);
    try {
      await onUpdateFollowUpDraft(lead.id, {
        subject: getDraftSubject(lead),
        body: getDraftBody(lead)
      });
    } finally {
      setIsSavingDraftId(null);
    }
  };
  const handleDispatchFollowUp = async lead => {
    if (!onSendFollowUp) return;
    await onSendFollowUp(lead.id, {
      subject: getDraftSubject(lead),
      body: getDraftBody(lead),
      to: lead.recipient
    });
  };
  const handleTriggerReopen = async leadId => {
    if (!onReopenLead) return;
    setReopeningLeadId(leadId);
    try {
      await onReopenLead(leadId);
      onRefresh?.();
    } finally {
      setReopeningLeadId(null);
    }
  };

  // Active item in Replied view
  const activeRepliedLead = repliedLeads.find(l => l.id === selectedRepliedId) || repliedLeads[0] || null;

  // Active item in Hot Leads view
  const activeHotLead = hotLeads.find(l => l.id === selectedHotLeadId) || hotLeads[0] || null;
  return <div className="lf-view-container lf-animate-fade">
      {/* ==========================================================
          TOP ANALYTICS SUMMARY ROW
          ========================================================== */}
      <div className="lf-lifecycle-analytics-bar">
        {/* Metric 1: Total Sent This Week */}
        <div className="lf-lifecycle-stat-card blue">
          <div className="lf-stat-card-header">
            <span className="lf-stat-card-title">Sent This Week</span>
            <div className="lf-stat-card-icon blue">
              <Send size={15} />
            </div>
          </div>
          <div className="lf-stat-card-value">
            {analytics.totalSentThisWeek}
            <span className="lf-stat-card-sub">emails</span>
          </div>
          <span className="lf-stat-card-sub">
            <Calendar size={12} /> Last 7 days outreach & follow-ups
          </span>
        </div>

        {/* Metric 2: Reply Rate % */}
        <div className="lf-lifecycle-stat-card emerald">
          <div className="lf-stat-card-header">
            <span className="lf-stat-card-title">Reply Rate</span>
            <div className="lf-stat-card-icon emerald">
              <TrendingUp size={15} />
            </div>
          </div>
          <div className="lf-stat-card-value">
            {analytics.replyRatePercent}%
            <span className="lf-stat-card-sub">conversion</span>
          </div>
          <span className="lf-stat-card-sub">
            <CheckCircle2 size={12} /> {repliedLeads.length + hotLeads.length} of {analytics.totalContacted} replied
          </span>
        </div>

        {/* Metric 3: Number of Hot Leads */}
        <div className="lf-lifecycle-stat-card amber">
          <div className="lf-stat-card-header">
            <span className="lf-stat-card-title">Hot Leads</span>
            <div className="lf-stat-card-icon amber">
              <Flame size={15} />
            </div>
          </div>
          <div className="lf-stat-card-value">
            {analytics.hotLeadsCount}
            <span className="lf-stat-card-sub">high intent</span>
          </div>
          <span className="lf-stat-card-sub">
            <Sparkles size={12} /> Score &ge; 6/10 engagement signal
          </span>
        </div>

        {/* Metric 4: Number Due for Follow-up Today */}
        <div className="lf-lifecycle-stat-card orange">
          <div className="lf-stat-card-header">
            <span className="lf-stat-card-title">Follow-up Due</span>
            <div className="lf-stat-card-icon orange">
              <Clock size={15} />
            </div>
          </div>
          <div className="lf-stat-card-value">
            {analytics.followUpDueCount}
            <span className="lf-stat-card-sub">pending</span>
          </div>
          <span className="lf-stat-card-sub">
            <AlertCircle size={12} /> Standard interval elapsed
          </span>
        </div>

        {/* Metric 5: Number Closed With No Response */}
        <div className="lf-lifecycle-stat-card slate">
          <div className="lf-stat-card-header">
            <span className="lf-stat-card-title">Closed (No Reply)</span>
            <div className="lf-stat-card-icon slate">
              <Archive size={15} />
            </div>
          </div>
          <div className="lf-stat-card-value">
            {analytics.closedNoResponseCount}
            <span className="lf-stat-card-sub">auto-paused</span>
          </div>
          <span className="lf-stat-card-sub">
            <Check size={12} /> 14-day cutoff reached
          </span>
        </div>
      </div>

      {/* ==========================================================
          LIFECYCLE NAVIGATION TABS & TOOLBAR
          ========================================================== */}
      <div className="lf-lifecycle-toolbar">
        <div className="lf-lifecycle-tabs">
          <button type="button" className={`lf-lifecycle-tab ${activeTab === 'inbox' ? 'active' : ''}`} onClick={() => setActiveTab('inbox')}><Inbox size={14} /><span>All messages</span><span className="lf-tab-count">{mailboxMessages.length}</span></button>
          {/* Tab 1: Sent */}
          <button type="button" className={`lf-lifecycle-tab ${activeTab === "sent" ? "active" : ""}`} onClick={() => setActiveTab("sent")}>
            <Send size={14} />
            <span>Sent</span>
            <span className="lf-tab-count">{sentLeads.length}</span>
          </button>

          {/* Tab 2: Replied */}
          <button type="button" className={`lf-lifecycle-tab ${activeTab === "replied" ? "active" : ""}`} onClick={() => setActiveTab("replied")}>
            <Inbox size={14} />
            <span>Replied</span>
            <span className="lf-tab-count">{repliedLeads.length}</span>
          </button>

          {/* Tab 3: Follow-up Queue */}
          <button type="button" className={`lf-lifecycle-tab ${activeTab === "followup" ? "active" : ""}`} onClick={() => setActiveTab("followup")}>
            <Clock size={14} className="text-amber" />
            <span>Follow-up Queue</span>
            <span className="lf-tab-count">{followUpQueue.length}</span>
          </button>

          {/* Tab 4: Hot Leads */}
          <button type="button" className={`lf-lifecycle-tab hot ${activeTab === "hot" ? "active" : ""}`} onClick={() => setActiveTab("hot")}>
            <Flame size={14} className="text-amber" />
            <span>Hot Leads</span>
            <span className="lf-tab-count">{hotLeads.length}</span>
          </button>
        </div>

        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10
      }}>
          <button type="button" className="lf-btn-secondary xs" onClick={onRefresh} title="Refresh lifecycle records">
            <RefreshCw size={13} className={isRefreshing ? "spin" : ""} />
            <span>Refresh</span>
          </button>

          <button type="button" className={`lf-btn-secondary xs ${showSimulator ? "active" : ""}`} disabled={!canDraft} onClick={() => setShowSimulator(!showSimulator)} title="Test webhook responses">
            <Sparkles size={13} className="text-amber" />
            <span>Webhook Simulator</span>
          </button>
        </div>
      </div>

      {activeTab === 'inbox' && <InboxView messages={mailboxMessages} canSend={canSend} canDraft={canDraft} onSendReply={onSendReply} onDraftReply={onDraftReply} isSendingReplyId={isSendingReplyId} />}
      {/* Optional Webhook Simulator Overlay / Panel */}
      {showSimulator && <div className="lf-panel lf-animate-fade" style={{
      marginBottom: 20
    }}>
          <div className="lf-panel-header">
            <div>
              <h3 className="lf-panel-title">Inbound Webhook Test Simulator</h3>
              <p className="lf-panel-desc">
                Simulate inbound commercial trade inquiries to test the 10-point hot lead engagement scoring and AI reply drafting.
              </p>
            </div>
            <button type="button" className="lf-btn-icon-xs" onClick={() => setShowSimulator(false)}>
              &times;
            </button>
          </div>

          <div className="lf-scenarios-row">
            <span className="lf-scenarios-title">1-Click Trade Scenarios:</span>
            {simScenarios.map((sc, i) => <button key={i} type="button" className={`lf-scenario-btn ${simSubject === sc.subject ? "active" : ""}`} onClick={() => {
          setSimFrom(sc.from);
          setSimName(sc.name);
          setSimSubject(sc.subject);
          setSimBody(sc.body);
        }}>
                <span dangerouslySetInnerHTML={{
            __html: sc.title
          }} />
              </button>)}
          </div>

          <form onSubmit={handleSimSubmit} className="lf-form-grid" style={{
        marginTop: 16
      }}>
            <div className="lf-form-field">
              <label>From Sender Email</label>
              <input type="email" className="lf-input" value={simFrom} onChange={e => setSimFrom(e.target.value)} required />
            </div>

            <div className="lf-form-field">
              <label>Buyer / Company Name</label>
              <input type="text" className="lf-input" value={simName} onChange={e => setSimName(e.target.value)} required />
            </div>

            <div className="lf-form-field span-2">
              <label>Inbound Email Subject</label>
              <input type="text" className="lf-input" value={simSubject} onChange={e => setSimSubject(e.target.value)} required />
            </div>

            <div className="lf-form-field span-2">
              <label>Inquiry Message Content</label>
              <textarea className="lf-textarea" rows={5} value={simBody} onChange={e => setSimBody(e.target.value)} required />
            </div>

            <div className="lf-form-action-row span-2">
              <button type="submit" className="lf-btn-submit" disabled={isSimulating || !canDraft}>
                {isSimulating ? <>
                    <Loader2 size={15} className="spin" />
                    <span>Processing Inbound Webhook...</span>
                  </> : <>
                    <Sparkles size={15} />
                    <span>Dispatch Inbound Webhook & Score Lead</span>
                  </>}
              </button>
            </div>
          </form>
        </div>}

      {/* ==========================================================
          TAB 1: SENT VIEW
          ========================================================== */}
      {activeTab === "sent" && <div className="lf-animate-fade">
          <div className="lf-sent-table-wrap">
            <div style={{
          padding: "14px 18px",
          background: "var(--bg-surface-2)",
          borderBottom: "1px solid var(--border-card)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
              <div>
                <span className="lf-pane-title">Active Outbound Outreach</span>
                <span style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginLeft: 10
            }}>
                  ({sentLeads.length} leads awaiting customer response)
                </span>
              </div>

              {closedLeads.length > 0 && <button type="button" className="lf-btn-secondary xs" onClick={() => setShowClosedLeads(!showClosedLeads)}>
                  <Archive size={12} />
                  <span>{showClosedLeads ? "Hide Closed Leads" : `Show Closed Leads (${closedLeads.length})`}</span>
                </button>}
            </div>

            {sentLeads.length === 0 ? <div className="lf-empty-pane" style={{
          padding: 40
        }}>
                <Send size={36} className="text-muted" />
                <p>No outreach leads currently in waiting status.</p>
                <span style={{
            fontSize: 12,
            color: "var(--text-faint)"
          }}>
                  Dispatch cold email proposals from Outreach Studio to initiate contact.
                </span>
              </div> : <table className="lf-sent-table">
                <thead>
                  <tr>
                    <th>Lead / Company</th>
                    <th>Recipient</th>
                    <th>Status</th>
                    <th>Days Since Contact</th>
                    <th>Next Follow-Up</th>
                    <th>Initial Subject</th>
                  </tr>
                </thead>
                <tbody>
                  {sentLeads.map(lead => <tr key={lead.id}>
                      <td>
                        <div style={{
                  fontWeight: 600
                }}>{lead.company || lead.leadName}</div>
                        <div style={{
                  fontSize: 11.5,
                  color: "var(--text-muted)"
                }}>
                          {lead.location || "International Sourcing"}
                        </div>
                      </td>
                      <td className="lf-mono" style={{
                fontSize: 12
              }}>
                        {lead.recipient}
                      </td>
                      <td>
                        {lead.status === "followed_up" ? <span className="lf-badge-pill blue sm">
                            Followed Up ({lead.follow_up_count || 1}x)
                          </span> : <span className="lf-badge-pill gold sm">
                            Initial Cold Sent
                          </span>}
                      </td>
                      <td>
                        <span className="lf-mono">
                          {lead.days_since_first_contact === 0 ? "Today" : `${lead.days_since_first_contact} day${lead.days_since_first_contact === 1 ? "" : "s"} ago`}
                        </span>
                      </td>
                      <td>
                        {lead.next_follow_up_date ? <span className="lf-badge-pill sm green">
                            <Clock size={10} /> Due {lead.next_follow_up_date}
                          </span> : <span style={{
                  fontSize: 12,
                  color: "var(--text-muted)"
                }}>
                            Awaiting response
                          </span>}
                      </td>
                      <td style={{
                maxWidth: 260,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}>
                        <span style={{
                  color: "var(--text-muted)"
                }}>{lead.subject}</span>
                      </td>
                    </tr>)}
                </tbody>
              </table>}

            {/* Closed Leads Section */}
            {showClosedLeads && closedLeads.length > 0 && <div style={{
          marginTop: 20,
          borderTop: "1px solid var(--border-card)"
        }}>
                <div style={{
            padding: "12px 18px",
            background: "var(--bg-surface-2)"
          }}>
                  <span style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--text-muted)"
            }}>
                    Closed Leads (14+ days with zero response — auto-stopped)
                  </span>
                </div>
                <table className="lf-sent-table">
                  <thead>
                    <tr>
                      <th>Lead / Company</th>
                      <th>Recipient</th>
                      <th>First Contacted</th>
                      <th>Total Inactivity</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedLeads.map(lead => <tr key={lead.id}>
                        <td style={{
                  fontWeight: 600
                }}>{lead.company || lead.leadName}</td>
                        <td className="lf-mono" style={{
                  fontSize: 12
                }}>{lead.recipient}</td>
                        <td>{lead.first_contacted_at || "14+ days ago"}</td>
                        <td>
                          <span className="lf-badge-pill sm muted">
                            {lead.days_since_first_contact || 14} days without reply
                          </span>
                        </td>
                        <td>
                          <button type="button" className="lf-btn-secondary xs" onClick={() => handleTriggerReopen(lead.id)} disabled={reopeningLeadId === lead.id || !canDraft} title="Reopen lead and queue for follow-up">
                            {reopeningLeadId === lead.id ? <Loader2 size={11} className="spin" /> : <RotateCcw size={11} />}
                            <span>Reopen Lead</span>
                          </button>
                        </td>
                      </tr>)}
                  </tbody>
                </table>
              </div>}
          </div>
        </div>}

      {/* ==========================================================
          TAB 2: REPLIED VIEW (WITH THREAD & AI DRAFT REVIEW)
          ========================================================== */}
      {activeTab === "replied" && <div className="lf-mailbox-split-view lf-animate-fade">
          {/* Left Column: Replied Leads List */}
          <div className="lf-mailbox-list-pane">
            <div className="lf-list-pane-header">
              <span className="lf-pane-title">Replied Inquiries ({repliedLeads.length})</span>
            </div>

            {repliedLeads.length === 0 ? <div className="lf-empty-pane" style={{
          padding: 40
        }}>
                <Inbox size={32} className="text-muted" />
                <p>No replied leads pending review.</p>
                <span style={{
            fontSize: 12,
            color: "var(--text-faint)"
          }}>
                  When contacted leads or prospects reply, their conversation thread appears here.
                </span>
              </div> : <div className="lf-thread-items">
                {repliedLeads.map(lead => {
            const isSelected = activeRepliedLead?.id === lead.id;
            const firstMsg = lead.inbound_messages?.[0] || lead.directInboundMessage;
            return <div key={lead.id} className={`lf-thread-item ${isSelected ? "active" : ""}`} onClick={() => setSelectedRepliedId(lead.id)} role="button" tabIndex={0}>
                      <div className="lf-thread-item-top">
                        <span className="lf-thread-sender">{lead.company || lead.leadName}</span>
                        <span className="lf-thread-time lf-mono">
                          {firstMsg?.receivedAt?.slice(0, 10) || "Recent"}
                        </span>
                      </div>
                      <div className="lf-thread-subject">{lead.subject || firstMsg?.subject}</div>
                      <div className="lf-thread-badges">
                        <span className="lf-badge-pill sm blue">
                          Replied &bull; Review Ready
                        </span>
                        {lead.score_result && <span className="lf-badge-pill sm gold">
                            Score: {lead.score_result.score}/10
                          </span>}
                      </div>
                    </div>;
          })}
              </div>}
          </div>

          {/* Right Column: Conversation Thread & Reply Studio */}
          <div className="lf-mailbox-detail-pane">
            {!activeRepliedLead ? <div className="lf-empty-detail">
                <Mail size={40} className="text-muted" />
                <h3>Select a replied lead to inspect the thread and send response</h3>
              </div> : <div className="lf-conversation-wrap lf-animate-fade">
                {/* Dossier Header */}
                <div className="lf-parties-grid">
                  <div className="lf-party-card from">
                    <div className="lf-party-role">
                      <UserCheck size={12} className="text-emerald" />
                      <span>Commercial Buyer / Lead</span>
                    </div>
                    <div className="lf-party-name">
                      {activeRepliedLead.leadName || activeRepliedLead.company}
                    </div>
                    <div className="lf-party-addr lf-mono">
                      &lt;{activeRepliedLead.recipient}&gt;
                    </div>
                  </div>

                  <div className="lf-party-card to">
                    <div className="lf-party-role">
                      <Mail size={12} className="text-amber" />
                      <span>SpiceCoast Sales Mailbox</span>
                    </div>
                    <div className="lf-party-name">The Spice Coast Export Desk</div>
                    <div className="lf-party-addr lf-mono">
                      &lt;{mailboxStatus.mailbox}&gt;
                    </div>
                  </div>
                </div>

                {/* Conversation Thread History */}
                <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 12
          }}>
                  <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase"
            }}>
                    Thread History
                  </div>

                  {/* Initial Outbound Email (if available) */}
                  {activeRepliedLead.outbound_messages?.length > 0 && <div style={{
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-md)",
              padding: 14
            }}>
                      <div style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6
              }}>
                        <span style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--amber)"
                }}>
                          Initial Outbound Pitch &bull; Dispatched
                        </span>
                        <span style={{
                  fontSize: 11,
                  color: "var(--text-faint)"
                }} className="lf-mono">
                          {activeRepliedLead.first_contacted_at || "Initial send"}
                        </span>
                      </div>
                      <div style={{
                fontSize: 12.5,
                color: "var(--text-muted)",
                whiteSpace: "pre-wrap",
                lineHeight: 1.5
              }}>
                        {activeRepliedLead.body || activeRepliedLead.outbound_messages[0]?.body}
                      </div>
                    </div>}

                  {/* Inbound Reply Message */}
                  {activeRepliedLead.inbound_messages?.map((inbound, idx) => <div key={idx} className="lf-email-body-box">
                      <div className="lf-body-box-title">
                        <Mail size={13} className="text-emerald" />
                        <span>Inbound Reply from {activeRepliedLead.company} ({inbound.receivedAt || "Today"})</span>
                      </div>
                      <div className="lf-email-body-text">{inbound.body}</div>
                    </div>)}
                </div>

                {/* AI-Drafted Response Pending Review */}
                {(() => {
            const firstMsg = activeRepliedLead.inbound_messages?.[0] || activeRepliedLead.directInboundMessage;
            const draftText = firstMsg?.draftReply;
            if (!draftText) return null;
            return <div className="lf-ai-reply-box">
                      <div className="lf-reply-box-header">
                        <div className="lf-reply-box-title">
                          <Bot size={15} className="text-emerald" />
                          <span>AI-Drafted Response &bull; Review & Dispatch</span>
                        </div>
                        <button type="button" className="lf-btn-icon-xs" onClick={() => handleCopy(draftText, `replied-${activeRepliedLead.id}`)} title="Copy reply text">
                          {copiedKey === `replied-${activeRepliedLead.id}` ? <Check size={12} className="text-emerald" /> : <Copy size={12} />}
                        </button>
                      </div>

                      <div className="lf-reply-text">{draftText}</div>

                      <div className="lf-reply-actions-row">
                        <button type="button" className="lf-btn-primary gold sm" onClick={() => onSendReply?.(firstMsg)} disabled={!canSend || !["drafted", "send_failed"].includes(firstMsg.status) || isSendingReplyId === firstMsg.id || firstMsg.source === "simulated"}>
                          {isSendingReplyId === firstMsg.id ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
                          <span>
                            {firstMsg.source === "simulated" ? "Simulated Reply (Sending Disabled)" : "Approve & Send Reply"}
                          </span>
                        </button>
                      </div>
                    </div>;
          })()}
              </div>}
          </div>
        </div>}

      {/* ==========================================================
          TAB 3: FOLLOW-UP QUEUE VIEW (READY FOR ONE-CLICK APPROVE & SEND)
          ========================================================== */}
      {activeTab === "followup" && <div className="lf-animate-fade">
          <div style={{
        marginBottom: 16
      }}>
            <span style={{
          fontSize: 13,
          color: "var(--text-muted)"
        }}>
              Leads that reached the follow-up interval with zero replies. Review and dispatch individualized follow-ups below.
            </span>
          </div>

          {followUpQueue.length === 0 ? <div className="lf-sent-table-wrap" style={{
        padding: 40,
        textAlign: "center"
      }}>
              <div className="lf-empty-pane">
                <CheckCircle2 size={36} className="text-emerald" />
                <p>Follow-up queue is completely clear!</p>
                <span style={{
            fontSize: 12,
            color: "var(--text-faint)"
          }}>
                  No contacted leads currently exceed the 3-day (Turn 1) or 7-day (Turn 2) follow-up threshold.
                </span>
              </div>
            </div> : <div className="lf-followup-grid">
              {followUpQueue.map(lead => {
          const turnNumber = (lead.follow_up_count || 0) + 1;
          const draftSubject = getDraftSubject(lead);
          const draftBody = getDraftBody(lead);
          const isSending = isSendingFollowUpId === lead.id;
          const isSaving = isSavingDraftId === lead.id;
          return <div key={lead.id} className="lf-followup-card">
                    {/* Header */}
                    <div className="lf-followup-card-header">
                      <div className="lf-followup-lead-meta">
                        <div>
                          <div style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--text-main)"
                  }}>
                            {lead.company || lead.leadName}
                          </div>
                          <div style={{
                    fontSize: 12,
                    color: "var(--text-muted)"
                  }}>
                            {lead.recipient} &bull; {lead.location || "International Importer"}
                          </div>
                        </div>
                      </div>

                      <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                        <span className="lf-followup-timing-tag">
                          <Clock size={12} />
                          <span>
                            {turnNumber === 1 ? `3+ Days Elapsed &bull; Follow-up 1 Due` : `7+ Days Elapsed &bull; Final Follow-up Due`}
                          </span>
                        </span>

                        <span className="lf-badge-pill blue sm">
                          Turn {turnNumber} of 2
                        </span>
                      </div>
                    </div>

                    {/* Pre-Generated Follow-up Draft Editor */}
                    <div className="lf-followup-draft-editor">
                      <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                        <span style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--amber)",
                  textTransform: "uppercase"
                }}>
                          AI Follow-Up Proposal ({turnNumber === 1 ? "Check-in" : "Final Inquiry"})
                        </span>
                        <span style={{
                  fontSize: 11,
                  color: "var(--text-faint)"
                }}>
                          Editable before dispatch
                        </span>
                      </div>

                      <div>
                        <label style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 4,
                  display: "block"
                }}>
                          Subject Line:
                        </label>
                        <input type="text" readOnly={!canDraft} className="lf-draft-subject-input" value={draftSubject} onChange={e => handleDraftChange(lead.id, "subject", e.target.value)} />
                      </div>

                      <div>
                        <label style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 4,
                  display: "block"
                }}>
                          Message Body:
                        </label>
                        <textarea readOnly={!canDraft} className="lf-draft-body-textarea" rows={6} value={draftBody} onChange={e => handleDraftChange(lead.id, "body", e.target.value)} />
                      </div>
                    </div>

                    {/* Action Row */}
                    <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10
            }}>
                      <button type="button" className="lf-btn-secondary sm" onClick={() => handleSaveFollowUpDraft(lead)} disabled={!canDraft || isSaving || isSending} title="Save draft edits without sending">
                        {isSaving ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                        <span>Save Draft</span>
                      </button>

                      <button type="button" className="lf-btn-primary gold sm" onClick={() => handleDispatchFollowUp(lead)} disabled={!canSend || isSending}>
                        {isSending ? <>
                            <Loader2 size={13} className="spin" />
                            <span>Dispatching Email...</span>
                          </> : <>
                            <Send size={13} />
                            <span>Approve & Send Follow-up</span>
                          </>}
                      </button>
                    </div>
                  </div>;
        })}
            </div>}
        </div>}

      {/* ==========================================================
          TAB 4: HOT LEADS VIEW (SORTED HIGHEST SCORE FIRST)
          ========================================================== */}
      {activeTab === "hot" && <div className="lf-animate-fade">
          <div style={{
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
            <span style={{
          fontSize: 13,
          color: "var(--text-muted)"
        }}>
              High-engagement leads scored &ge; 6/10 on the multi-signal scale, ranked by commercial intent.
            </span>
            <span className="lf-badge-pill gold sm">
              <Flame size={12} /> {hotLeads.length} Hot Leads Ranked
            </span>
          </div>

          {hotLeads.length === 0 ? <div className="lf-sent-table-wrap" style={{
        padding: 40,
        textAlign: "center"
      }}>
              <div className="lf-empty-pane">
                <Flame size={36} className="text-muted" />
                <p>No leads currently meet the Hot threshold (6+ points).</p>
                <span style={{
            fontSize: 12,
            color: "var(--text-faint)"
          }}>
                  Use the Webhook Simulator to test buyer replies with FOB quotes or volume requests.
                </span>
              </div>
            </div> : <div className="lf-hot-leads-grid">
              {hotLeads.map(lead => {
          const scoreRes = lead.score_result || {
            score: 6,
            breakdown: []
          };
          const firstMsg = lead.inbound_messages?.[0] || lead.directInboundMessage;
          const meta = firstMsg?.metadata || {};
          return <div key={lead.id} className="lf-hot-lead-card">
                    {/* Top Header: Company + Score Badge */}
                    <div className="lf-hot-lead-top">
                      <div className="lf-hot-lead-title-box">
                        <div className="lf-hot-lead-company">{lead.company || lead.leadName}</div>
                        <div className="lf-hot-lead-contact">
                          {lead.recipient} &bull; {lead.location || meta.destinationPort || "Direct Buyer"}
                        </div>
                      </div>

                      <div className="lf-hot-score-badge">
                        <Flame size={13} />
                        <span>{scoreRes.score} / 10</span>
                      </div>
                    </div>

                    {/* Signal Badges Breakdown */}
                    <div>
                      <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                marginBottom: 6,
                textTransform: "uppercase"
              }}>
                        Engagement Signal Breakdown:
                      </div>
                      <div className="lf-score-breakdown-row">
                        {scoreRes.breakdown?.map(sig => <span key={sig.id} className={`lf-score-signal-pill ${sig.earned ? sig.id === "fast_reply" ? "earned cyan" : sig.id === "buying_intent" ? "earned gold" : "earned" : "unearned"}`} title={sig.description}>
                            {sig.earned ? <Check size={10} /> : <span>&times;</span>}
                            <span>{sig.label}</span>
                            <span style={{
                    opacity: 0.75
                  }}>({sig.earned ? `+${sig.points}` : "0"})</span>
                          </span>)}
                      </div>
                    </div>

                    {/* Procurement Matrix */}
                    <div className="lf-intel-matrix" style={{
              gridTemplateColumns: "1fr 1fr",
              padding: "10px 12px"
            }}>
                      <div className="lf-intel-item">
                        <span className="lf-intel-label">Volume / MOQ</span>
                        <span className="lf-intel-val text-white" style={{
                  fontSize: 12
                }}>
                          {meta.requestedVolume || "Unspecified"}
                        </span>
                      </div>
                      <div className="lf-intel-item">
                        <span className="lf-intel-label">Destination Port</span>
                        <span className="lf-intel-val blue" style={{
                  fontSize: 12
                }}>
                          {meta.destinationPort || "Direct"}
                        </span>
                      </div>
                    </div>

                    {/* Commodities */}
                    {meta.detectedProducts?.length > 0 && <div className="lf-detected-products-row">
                        <span className="lf-detected-label">Products:</span>
                        {meta.detectedProducts.map((p, idx) => <span key={idx} className="lf-badge-pill green sm">
                            <Package size={10} />
                            <span>{p}</span>
                          </span>)}
                      </div>}

                    {/* Inbound Message Snippet */}
                    <div style={{
              background: "var(--bg-surface-2)",
              padding: 12,
              borderRadius: "var(--radius-sm)",
              fontSize: 12.5,
              color: "var(--text-muted)",
              maxHeight: 80,
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}>
                      &ldquo;{firstMsg?.body || lead.body}&rdquo;
                    </div>

                    {/* One-Click Action */}
                    <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 6
            }}>
                      <span style={{
                fontSize: 11,
                color: "var(--text-faint)"
              }}>
                        Received: {firstMsg?.receivedAt?.slice(0, 10) || lead.first_contacted_at || "Recent"}
                      </span>

                      {canSend && firstMsg?.draftReply && <button type="button" className="lf-btn-primary gold xs" onClick={() => {
                setSelectedRepliedId(lead.id);
                setActiveTab("replied");
              }}>
                          <Send size={12} />
                          <span>Review & Reply</span>
                        </button>}
                    </div>
                  </div>;
        })}
            </div>}

          {/* Planned Feature Callout: Pixel Tracking */}
          <div className="lf-future-feature-callout">
            <Info size={16} />
            <div>
              <strong>Planned Feature:</strong> Email open and link click pixel-tracking will be integrated in a future release to contribute additional automated +2 engagement signals to this 10-point scoring model.
            </div>
          </div>
        </div>}
    </div>;
}
