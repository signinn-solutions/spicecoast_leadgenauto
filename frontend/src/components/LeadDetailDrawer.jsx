import React, { useState, useEffect } from "react";
import {
  X,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Copy,
  Check,
  Sparkles,
  Send,
  Loader2,
  Clock,
  ShieldCheck,
  Edit3,
} from "lucide-react";

export default function LeadDetailDrawer({
  lead,
  onClose,
  onGeneratePitch,
  isGeneratingPitch,
  onSaveDraft,
  isSavingDraft,
  onSendPitch,
  isSendingPitch,
  mailboxAddress = "sales@thespicecoast.com",
}) {
  const [copiedKey, setCopiedKey] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => {
    if (lead?.coldMailDraft) {
      setSubject(lead.coldMailDraft.subject || "");
      setBody(lead.coldMailDraft.body || "");
    } else {
      setSubject("");
      setBody("");
    }
    setConfirmSend(false);
    setIsEditing(false);
  }, [lead]);

  if (!lead) return null;

  const isLive = lead.source !== "simulated";
  const hasDeliverableEmail =
    lead.emailStatus === "deliverable" || lead.emailStatus === "valid";
  const isSent = lead.coldMailDraft?.status === "sent";

  const handleCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  const handleSave = async () => {
    await onSaveDraft(lead.id, subject, body);
    setIsEditing(false);
  };

  const handleSend = async () => {
    await onSendPitch(lead.id, lead.email, subject, body);
    setConfirmSend(false);
  };

  return (
    <div className="lf-drawer-backdrop" onClick={onClose}>
      <div
        className="lf-drawer-panel lf-animate-slide-left"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-company-title"
      >
        {/* Header */}
        <div className="lf-drawer-header">
          <div>
            <div className="lf-drawer-tag-row">
              <span className={`lf-badge-pill ${isLive ? "green" : "gold"}`}>
                {isLive ? "Live Verified Lead" : "Simulation Contact"}
              </span>
              <span className="lf-drawer-date">Added {lead.foundAt || "Recently"}</span>
            </div>
            <h2 id="drawer-company-title" className="lf-drawer-title">
              {lead.name}
            </h2>
          </div>
          <button
            type="button"
            className="lf-drawer-close"
            onClick={onClose}
            aria-label="Close lead dossier"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="lf-drawer-body">
          {/* Company Dossier Card */}
          <div className="lf-dossier-card">
            <h3 className="lf-card-section-title">Verified Contact Dossier</h3>

            <div className="lf-dossier-row">
              <div className="lf-dossier-label">
                <MapPin size={14} className="text-amber" />
                <span>Operating Address</span>
              </div>
              <div className="lf-dossier-val">
                <span>{lead.address || "Address unavailable"}</span>
                {lead.address && (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      `${lead.name} ${lead.address}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="lf-external-link"
                    title="View on Google Maps"
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>

            <div className="lf-dossier-row">
              <div className="lf-dossier-label">
                <Phone size={14} className="text-emerald" />
                <span>Telephone Line</span>
              </div>
              <div className="lf-dossier-val">
                <span className="lf-mono">{lead.phone || "—"}</span>
                {lead.phone && (
                  <button
                    type="button"
                    className="lf-btn-icon-xs"
                    onClick={() => handleCopy(lead.phone, "phone")}
                    title="Copy phone"
                  >
                    {copiedKey === "phone" ? (
                      <Check size={12} className="text-emerald" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                )}
                {lead.phoneStatus && (
                  <span
                    className={`lf-badge-pill sm ${
                      lead.phoneStatus === "valid" ? "green" : "muted"
                    }`}
                  >
                    {lead.phoneStatus}
                  </span>
                )}
              </div>
            </div>

            <div className="lf-dossier-row">
              <div className="lf-dossier-label">
                <Mail size={14} className="text-blue" />
                <span>Executive Inbox</span>
              </div>
              <div className="lf-dossier-val">
                <span className="lf-mono">{lead.email || "—"}</span>
                {lead.email && (
                  <button
                    type="button"
                    className="lf-btn-icon-xs"
                    onClick={() => handleCopy(lead.email, "email")}
                    title="Copy email"
                  >
                    {copiedKey === "email" ? (
                      <Check size={12} className="text-emerald" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                )}
                {lead.emailStatus && (
                  <span
                    className={`lf-badge-pill sm ${
                      hasDeliverableEmail
                        ? "green"
                        : lead.emailStatus === "risky"
                        ? "gold"
                        : "red"
                    }`}
                  >
                    {lead.emailStatus}
                  </span>
                )}
              </div>
            </div>

            <div className="lf-dossier-row">
              <div className="lf-dossier-label">
                <Globe size={14} className="text-amber" />
                <span>Domain & Web Presence</span>
              </div>
              <div className="lf-dossier-val">
                {lead.website && lead.website !== "#" ? (
                  <a
                    href={lead.website}
                    target="_blank"
                    rel="noreferrer"
                    className="lf-web-link"
                  >
                    <span>{lead.website}</span>
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <span className="text-muted">No website registered</span>
                )}
              </div>
            </div>
          </div>

          {/* AI Cold Pitch Studio Box */}
          <div className="lf-drawer-pitch-box">
            <div className="lf-pitch-box-header">
              <div className="lf-pitch-title-wrap">
                <Sparkles size={16} className="text-amber" />
                <span className="lf-pitch-title">DeepSeek AI B2B Cold Pitch</span>
              </div>
              {lead.coldMailDraft && (
                <span
                  className={`lf-badge-pill sm ${
                    isSent ? "green" : "gold"
                  }`}
                >
                  {isSent ? "Dispatched" : "Pending Review"}
                </span>
              )}
            </div>

            {!lead.coldMailDraft ? (
              <div className="lf-no-pitch-box">
                <p>
                  No AI cold proposal has been drafted for this prospect yet. Generate a customized wholesale spice pitch tailored to their business niche and location.
                </p>
                <button
                  type="button"
                  className="lf-btn-primary"
                  onClick={() => onGeneratePitch(lead)}
                  disabled={isGeneratingPitch || !hasDeliverableEmail}
                >
                  {isGeneratingPitch ? (
                    <>
                      <Loader2 size={15} className="spin" />
                      <span>Synthesizing Proposal with DeepSeek...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      <span>Generate AI Cold Pitch</span>
                    </>
                  )}
                </button>
                {!hasDeliverableEmail && (
                  <span className="lf-field-warning">
                    * Requires deliverable verified email to generate outreach.
                  </span>
                )}
              </div>
            ) : (
              <div className="lf-pitch-content-wrap">
                {/* Subject Line */}
                <div className="lf-pitch-field">
                  <div className="lf-field-label-row">
                    <label>Subject Line</label>
                    <button
                      type="button"
                      className="lf-btn-ghost-sm"
                      onClick={() => handleCopy(subject, "subject")}
                    >
                      {copiedKey === "subject" ? (
                        <>
                          <Check size={11} className="text-emerald" />
                          <span className="text-emerald">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    className="lf-input"
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value);
                      setIsEditing(true);
                    }}
                    disabled={isSent}
                  />
                </div>

                {/* Email Body */}
                <div className="lf-pitch-field">
                  <div className="lf-field-label-row">
                    <label>Personalized Body (Direct Origin Specification)</label>
                    <button
                      type="button"
                      className="lf-btn-ghost-sm"
                      onClick={() => handleCopy(body, "body")}
                    >
                      {copiedKey === "body" ? (
                        <>
                          <Check size={11} className="text-emerald" />
                          <span className="text-emerald">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    className="lf-textarea"
                    rows={8}
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      setIsEditing(true);
                    }}
                    disabled={isSent}
                  />
                </div>

                {/* Confirm Dispatch Protection Box */}
                {confirmSend && (
                  <div className="lf-confirm-box lf-animate-fade">
                    <div className="lf-confirm-title">
                      <ShieldCheck size={16} className="text-amber" />
                      <span>Outbound Dispatch Confirmation</span>
                    </div>
                    <p className="lf-confirm-text">
                      Are you sure you want to dispatch this email from <code>{mailboxAddress}</code> to <strong>{lead.email}</strong>?
                    </p>
                    <div className="lf-confirm-actions">
                      <button
                        type="button"
                        className="lf-btn-primary gold sm"
                        onClick={handleSend}
                        disabled={isSendingPitch}
                      >
                        {isSendingPitch ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <Send size={13} />
                        )}
                        <span>Confirm & Dispatch</span>
                      </button>
                      <button
                        type="button"
                        className="lf-btn-secondary sm"
                        onClick={() => setConfirmSend(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="lf-pitch-actions-row">
                  {isEditing && !isSent && (
                    <button
                      type="button"
                      className="lf-btn-secondary sm"
                      onClick={handleSave}
                      disabled={isSavingDraft}
                    >
                      {isSavingDraft ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                      <span>Save Draft Changes</span>
                    </button>
                  )}

                  {!isSent && isLive && !confirmSend && (
                    <button
                      type="button"
                      className="lf-btn-primary sm"
                      onClick={() => setConfirmSend(true)}
                    >
                      <Send size={14} />
                      <span>Review & Send Email</span>
                    </button>
                  )}

                  {!isLive && (
                    <span className="lf-badge-pill gold">
                      Simulation Mode &bull; Real dispatch blocked
                    </span>
                  )}

                  {isSent && (
                    <span className="lf-badge-pill green">
                      <CheckCircle2 size={13} /> Dispatched on {lead.coldMailDraft?.sentAt || "Today"}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
