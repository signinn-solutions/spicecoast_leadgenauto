import React, { useState, useEffect, useRef } from "react";
import useDialogFocus from "../hooks/useDialogFocus.js";
import {
  X,
  Sparkles,
  Send,
  ShieldCheck,
  Copy,
  Check,
  Loader2,
  Building2,
  Eye,
  Edit3,
  Mail,
} from "lucide-react";

export default function ColdMailModal({
  modalData,
  onClose,
  onSaveDraft,
  isSavingDraft,
  onConfirmSend,
  isSending,
  mailboxAddress = "sales@thespicecoast.com",
}) {
  const modalRef = useRef(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (modalData) {
      setSubject(modalData.subject || "");
      setBody(modalData.body || "");
      setConfirmStep(false);
      setPreviewMode(false);
    }
  }, [modalData]);

  useDialogFocus(Boolean(modalData), modalRef, onClose, "#outreach-subject:not([disabled])");

  if (!modalData) return null;

  const isLive = modalData.source !== "simulated";
  const isSent = modalData.status === "sent";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleSave = async () => {
    await onSaveDraft(modalData.leadId, subject, body);
  };

  const handleSend = async () => {
    await onConfirmSend(modalData.leadId, modalData.recipient, subject, body);
  };

  return (
    <div
      className="lf-modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="lf-modal-card lf-animate-scale"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-outreach-title"
        tabIndex={-1}
      >
        {/* Modal Header */}
        <div className="lf-modal-header">
          <div className="lf-modal-title-group">
            <div className="lf-modal-title" id="modal-outreach-title">
              <Sparkles size={18} className="text-amber" />
              <span>Review AI Cold Proposal</span>
            </div>
            <div className="lf-modal-subtitle">
              Recipient: <strong>{modalData.company}</strong> &lt;{modalData.recipient}&gt;
            </div>
          </div>

          <div className="lf-modal-header-actions">
            <button
              type="button"
              className={`lf-btn-ghost-sm ${previewMode ? "active" : ""}`}
              onClick={() => setPreviewMode(!previewMode)}
              title="Toggle preview mockup"
            >
              {previewMode ? <Edit3 size={13} /> : <Eye size={13} />}
              <span>{previewMode ? "Editor Mode" : "Inbox Mockup"}</span>
            </button>

            <button
              type="button"
              className="lf-modal-close"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="lf-modal-body">
          {previewMode ? (
            /* Realistic Inbox Client Mockup */
            <div className="lf-email-mockup">
              <div className="lf-mockup-header">
                <div className="lf-mockup-meta-row">
                  <span className="lf-mockup-label">From:</span>
                  <span className="lf-mockup-val">
                    The SpiceCoast Export Desk &lt;{mailboxAddress}&gt;
                  </span>
                </div>
                <div className="lf-mockup-meta-row">
                  <span className="lf-mockup-label">To:</span>
                  <span className="lf-mockup-val">
                    {modalData.company} &lt;{modalData.recipient}&gt;
                  </span>
                </div>
                <div className="lf-mockup-meta-row">
                  <span className="lf-mockup-label">Subject:</span>
                  <span className="lf-mockup-val bold">{subject}</span>
                </div>
              </div>
              <div className="lf-mockup-body">
                {body.split("\n").map((line, idx) => (
                  <p key={idx}>{line || "\u00A0"}</p>
                ))}
              </div>
            </div>
          ) : (
            /* Editable Form */
            <div className="lf-modal-form">
              <div className="lf-modal-field">
                <label htmlFor="outreach-subject">Subject Line</label>
                <input
                  id="outreach-subject"
                  type="text"
                  className="lf-input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={isSent}
                />
              </div>

              <div className="lf-modal-field">
                <label htmlFor="outreach-body">
                  Personalized Export Pitch (B2B Wholesale Specs)
                </label>
                <textarea
                  id="outreach-body"
                  className="lf-textarea"
                  rows={10}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={isSent}
                />
              </div>
            </div>
          )}

          {/* Explicit Safety Confirmation Box */}
          {confirmStep && (
            <div className="lf-confirm-box lf-animate-fade">
              <div className="lf-confirm-title">
                <ShieldCheck size={16} className="text-amber" />
                <span>Verify Real Outbound Email Dispatch</span>
              </div>
              <p className="lf-confirm-text">
                This will dispatch a live email to <strong>{modalData.recipient}</strong> using your Hostinger Mailbox API token.
              </p>
              <div className="lf-confirm-actions">
                <button
                  type="button"
                  className="lf-btn-primary gold sm"
                  onClick={handleSend}
                  disabled={isSending}
                >
                  {isSending ? (
                    <Loader2 size={13} className="spin" />
                  ) : (
                    <Send size={13} />
                  )}
                  <span>Confirm and Dispatch Real Email</span>
                </button>
                <button
                  type="button"
                  className="lf-btn-secondary sm"
                  onClick={() => setConfirmStep(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="lf-modal-footer">
          <button
            type="button"
            className="lf-btn-secondary sm"
            onClick={handleSave}
            disabled={isSavingDraft || isSent}
          >
            {isSavingDraft ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
            <span>Save Edits</span>
          </button>

          <div className="lf-footer-right-actions">
            <button
              type="button"
              className="lf-btn-secondary sm"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check size={13} className="text-emerald" />
                  <span className="text-emerald">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>Copy to Clipboard</span>
                </>
              )}
            </button>

            {!isSent && isLive && !confirmStep && (
              <button
                type="button"
                className="lf-btn-primary gold sm"
                onClick={() => setConfirmStep(true)}
              >
                <Send size={13} />
                <span>Dispatch Email</span>
              </button>
            )}

            {!isLive && (
              <span className="lf-badge-pill gold">
                Simulation Contact &bull; Sending Disabled
              </span>
            )}

            {isSent && (
              <span className="lf-badge-pill green">
                <CheckCircle2 size={13} /> Outreach Dispatched
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
