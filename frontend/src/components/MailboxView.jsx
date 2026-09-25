import React, { useState } from "react";
import {
  Inbox,
  Sparkles,
  RefreshCw,
  Mail,
  UserCheck,
  Package,
  Clock,
  Bot,
  Send,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Shield,
  Zap,
  ChevronRight,
  MapPin,
  Anchor,
} from "lucide-react";

export default function MailboxView({
  mailboxStatus = {},
  mailboxMessages = [],
  onRefresh,
  isRefreshing,
  onSendReply,
  isSendingReplyId,
  onSimulateInbound,
  isSimulating,
}) {
  const [subTab, setSubTab] = useState("inbox"); // inbox, simulator
  const [selectedMessageId, setSelectedMessageId] = useState(
    mailboxMessages[0]?.id || null
  );
  const [copiedKey, setCopiedKey] = useState(null);

  // Simulator preset scenarios
  const simScenarios = [
    {
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
EuroSpice Distribution GmbH, Hamburg`,
    },
    {
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
Gulf Commodity Trading LLC, Dubai, UAE`,
    },
    {
      title: "Rotterdam &bull; Organic Turmeric 10 MT",
      from: "eva.janssen@hollandorganics.nl",
      name: "Eva Janssen (Holland Organics BV)",
      subject: "Bulk Order: Organic Alleppey Turmeric Finger (Curcumin > 5%)",
      body: `Good day,

Holland Organics is expanding our organic raw material line and we require 10 Metric Tons of organic certified Alleppey Turmeric Fingers with guaranteed minimum 5% curcumin content.

Destination: Port of Rotterdam. Please send product specs, organic transaction certificates, and sea-freight timeline.

Kind regards,
Eva Janssen
Holland Organics BV, Rotterdam`,
    },
    {
      title: "New York &bull; Cloves 1 FCL",
      from: "david.miller@nyflavourimports.com",
      name: "David Miller (New York Flavour Imports)",
      subject: "Inquiry: Tellicherry Hand-Picked Cloves Container Pricing",
      body: `Hi SpiceCoast Sales,

We are sourcing 1 FCL of premium hand-picked Tellicherry cloves (headless < 2%) for private label packaging in New York.

Could you share FOB Cochin container quotes and send sample packages to our Manhattan test kitchen?

Thank you,
David Miller
Director of Imports, NY Flavour Imports`,
    },
  ];

  // Simulator form state
  const [simFrom, setSimFrom] = useState(simScenarios[0].from);
  const [simName, setSimName] = useState(simScenarios[0].name);
  const [simSubject, setSimSubject] = useState(simScenarios[0].subject);
  const [simBody, setSimBody] = useState(simScenarios[0].body);

  const activeMessage =
    mailboxMessages.find((m) => m.id === selectedMessageId) ||
    mailboxMessages[0] ||
    null;

  const handleSelectScenario = (sc) => {
    setSimFrom(sc.from);
    setSimName(sc.name);
    setSimSubject(sc.subject);
    setSimBody(sc.body);
  };

  const handleCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {}
  };

  const handleSimSubmit = async (e) => {
    e.preventDefault();
    await onSimulateInbound({
      from: simFrom,
      from_name: simName,
      subject: simSubject,
      message: simBody,
    });
    setSubTab("inbox");
  };

  return (
    <div className="lf-view-container lf-animate-fade">
      {/* Subtab Bar */}
      <div className="lf-crm-toolbar">
        <div className="lf-scope-tabs">
          <button
            type="button"
            className={`lf-scope-tab ${subTab === "inbox" ? "active" : ""}`}
            onClick={() => setSubTab("inbox")}
          >
            <Inbox size={14} />
            <span>Inbound Webhook Feed ({mailboxMessages.length})</span>
          </button>
          <button
            type="button"
            className={`lf-scope-tab ${subTab === "simulator" ? "active" : ""}`}
            onClick={() => setSubTab("simulator")}
          >
            <Sparkles size={14} className="text-amber" />
            <span>Webhook Simulator (Test Inbound)</span>
          </button>
        </div>

        <div className="lf-mailbox-live-tag">
          <span className="lf-pulse-dot" />
          <span>Real-time Webhook Poller Active (4s)</span>
        </div>
      </div>

      {/* SUBTAB 1: 2-COLUMN INBOUND MAILBOX */}
      {subTab === "inbox" && (
        <div className="lf-mailbox-split-view">
          {/* Left Column: Thread List */}
          <div className="lf-mailbox-list-pane">
            <div className="lf-list-pane-header">
              <span className="lf-pane-title">Inquiries & Quotes</span>
              <button
                type="button"
                className="lf-btn-icon-xs"
                onClick={onRefresh}
                title="Refresh inbox"
              >
                <RefreshCw size={12} className={isRefreshing ? "spin" : ""} />
              </button>
            </div>

            {mailboxMessages.length === 0 ? (
              <div className="lf-empty-pane">
                <Inbox size={32} className="text-muted" />
                <p>No inbound emails received yet.</p>
                <button
                  type="button"
                  className="lf-btn-secondary xs"
                  onClick={() => setSubTab("simulator")}
                >
                  <Sparkles size={12} />
                  <span>Test with Simulator</span>
                </button>
              </div>
            ) : (
              <div className="lf-thread-items">
                {mailboxMessages.map((msg) => {
                  const isSelected = activeMessage?.id === msg.id;
                  const meta = msg.metadata || {};
                  const isDispatched = msg.status === "sent";

                  return (
                    <div
                      key={msg.id}
                      className={`lf-thread-item ${isSelected ? "active" : ""}`}
                      onClick={() => setSelectedMessageId(msg.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="lf-thread-item-top">
                        <span className="lf-thread-sender">
                          {meta.buyerName || msg.senderName || msg.sender}
                        </span>
                        <span className="lf-thread-time lf-mono">
                          {msg.receivedAt || "Today"}
                        </span>
                      </div>

                      <div className="lf-thread-subject">{msg.subject}</div>

                      <div className="lf-thread-badges">
                        <span className="lf-badge-pill gold sm">
                          {meta.intent || "Quote Request"}
                        </span>
                        {meta.priority && (
                          <span
                            className={`lf-badge-pill sm ${
                              meta.priority === "High" ? "red" : "blue"
                            }`}
                          >
                            {meta.priority}
                          </span>
                        )}
                        {isDispatched ? (
                          <span className="lf-badge-pill green sm">
                            <CheckCircle2 size={10} /> Dispatched
                          </span>
                        ) : (
                          <span className="lf-badge-pill amber sm">
                            Review Ready
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Active Conversation & Reply Studio */}
          <div className="lf-mailbox-detail-pane">
            {!activeMessage ? (
              <div className="lf-empty-detail">
                <Mail size={40} className="text-muted" />
                <h3>Select an inbound conversation to inspect procurement details</h3>
              </div>
            ) : (
              <div className="lf-conversation-wrap lf-animate-fade">
                {/* Sender / Receiver Identity Dossier */}
                <div className="lf-parties-grid">
                  <div className="lf-party-card from">
                    <div className="lf-party-role">
                      <UserCheck size={12} className="text-emerald" />
                      <span>Sender / Commercial Buyer</span>
                    </div>
                    <div className="lf-party-name">
                      {activeMessage.metadata?.buyerName ||
                        activeMessage.senderName ||
                        "Buyer Representative"}
                    </div>
                    <div className="lf-party-addr lf-mono">
                      &lt;{activeMessage.sender}&gt;
                    </div>
                  </div>

                  <div className="lf-party-card to">
                    <div className="lf-party-role">
                      <Mail size={12} className="text-amber" />
                      <span>Receiver / Mailbox Desk</span>
                    </div>
                    <div className="lf-party-name">
                      {activeMessage.receiverName || "SpiceCoast Export Desk"}
                    </div>
                    <div className="lf-party-addr lf-mono">
                      &lt;{activeMessage.receiver || mailboxStatus.mailbox}&gt;
                    </div>
                  </div>
                </div>

                {/* Procurement Intelligence Matrix */}
                <div className="lf-intel-matrix">
                  <div className="lf-intel-item">
                    <span className="lf-intel-label">Extracted Intent</span>
                    <span className="lf-intel-val gold">
                      {activeMessage.metadata?.intent || "Price Quote Request"}
                    </span>
                  </div>
                  <div className="lf-intel-item">
                    <span className="lf-intel-label">Requested MOQ / Volume</span>
                    <span className="lf-intel-val text-white">
                      {activeMessage.metadata?.requestedVolume || "Unspecified"}
                    </span>
                  </div>
                  <div className="lf-intel-item">
                    <span className="lf-intel-label">Destination Port</span>
                    <span className="lf-intel-val blue">
                      {activeMessage.metadata?.destinationPort || "Not specified"}
                    </span>
                  </div>
                  <div className="lf-intel-item">
                    <span className="lf-intel-label">Triage Priority</span>
                    <span
                      className={`lf-intel-val ${
                        activeMessage.metadata?.priority === "High"
                          ? "red"
                          : "emerald"
                      }`}
                    >
                      {activeMessage.metadata?.priority || "Medium"}
                    </span>
                  </div>
                </div>

                {/* Detected Products Chips */}
                {activeMessage.metadata?.detectedProducts?.length > 0 && (
                  <div className="lf-detected-products-row">
                    <span className="lf-detected-label">Detected Commodities:</span>
                    {activeMessage.metadata.detectedProducts.map((prod, i) => (
                      <span key={i} className="lf-badge-pill green">
                        <Package size={11} />
                        <span>{prod}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Inbound Message Content */}
                <div className="lf-email-body-box">
                  <div className="lf-body-box-title">
                    <Mail size={13} className="text-muted" />
                    <span>Inbound Message Text</span>
                  </div>
                  <div className="lf-email-body-text">
                    {activeMessage.body}
                  </div>
                </div>

                {/* DeepSeek Suggested Contextual Reply */}
                {activeMessage.draftReply && (
                  <div className="lf-ai-reply-box">
                    <div className="lf-reply-box-header">
                      <div className="lf-reply-box-title">
                        <Bot size={15} className="text-emerald" />
                        <span>DeepSeek Contextual Response</span>
                        <span className="lf-badge-pill blue sm">
                          {activeMessage.model || "deepseek-chat"}
                        </span>
                      </div>
                      <div className="lf-reply-header-actions">
                        <button
                          type="button"
                          className="lf-btn-icon-xs"
                          onClick={() =>
                            handleCopy(activeMessage.draftReply, `reply-${activeMessage.id}`)
                          }
                          title="Copy reply text"
                        >
                          {copiedKey === `reply-${activeMessage.id}` ? (
                            <Check size={12} className="text-emerald" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="lf-reply-text">
                      {activeMessage.draftReply}
                    </div>

                    <div className="lf-reply-actions-row">
                      {activeMessage.status !== "sent" ? (
                        <button
                          type="button"
                          className="lf-btn-primary gold sm"
                          onClick={() => onSendReply(activeMessage)}
                          disabled={isSendingReplyId === activeMessage.id}
                        >
                          {isSendingReplyId === activeMessage.id ? (
                            <Loader2 size={13} className="spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          <span>Dispatch Reply via Hostinger</span>
                        </button>
                      ) : (
                        <span className="lf-badge-pill green">
                          <CheckCircle2 size={13} /> Reply Dispatched on {activeMessage.sentAt || "Today"}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: WEBHOOK TEST SIMULATOR */}
      {subTab === "simulator" && (
        <div className="lf-panel lf-simulator-panel lf-animate-fade">
          <div className="lf-panel-header">
            <div>
              <h3 className="lf-panel-title">Inbound Webhook Test Simulator</h3>
              <p className="lf-panel-desc">
                Simulate inbound commercial trade inquiries sent to your Hostinger webhook to test automatic metadata extraction and contextual DeepSeek reply drafting.
              </p>
            </div>
            <Sparkles size={18} className="text-amber" />
          </div>

          {/* Quick Scenario Picker */}
          <div className="lf-scenarios-row">
            <span className="lf-scenarios-title">1-Click Trade Scenarios:</span>
            {simScenarios.map((sc, i) => (
              <button
                key={i}
                type="button"
                className={`lf-scenario-btn ${simSubject === sc.subject ? "active" : ""}`}
                onClick={() => handleSelectScenario(sc)}
              >
                <span dangerouslySetInnerHTML={{ __html: sc.title }} />
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSimSubmit} className="lf-form-grid" style={{ marginTop: 20 }}>
            <div className="lf-form-field">
              <label>From Sender Email</label>
              <input
                type="email"
                className="lf-input"
                value={simFrom}
                onChange={(e) => setSimFrom(e.target.value)}
                required
              />
            </div>

            <div className="lf-form-field">
              <label>Buyer / Company Name</label>
              <input
                type="text"
                className="lf-input"
                value={simName}
                onChange={(e) => setSimName(e.target.value)}
                required
              />
            </div>

            <div className="lf-form-field span-2">
              <label>Inbound Email Subject</label>
              <input
                type="text"
                className="lf-input"
                value={simSubject}
                onChange={(e) => setSimSubject(e.target.value)}
                required
              />
            </div>

            <div className="lf-form-field span-2">
              <label>Inquiry Message Content</label>
              <textarea
                className="lf-textarea"
                rows={7}
                value={simBody}
                onChange={(e) => setSimBody(e.target.value)}
                required
              />
            </div>

            <div className="lf-form-action-row span-2">
              <button
                type="submit"
                className="lf-btn-submit"
                disabled={isSimulating}
              >
                {isSimulating ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>Extracting Commercial Procurement Intent & Drafting Reply...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Process Inbound Inquiry via Webhook</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
