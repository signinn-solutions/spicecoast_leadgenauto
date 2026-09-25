import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, XCircle, Info, X } from "lucide-react";

export default function Toast({ notice, onClose }) {
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [notice, onClose]);

  if (!notice) return null;

  const isSuccess = notice.type === "success";
  const isWarning = notice.type === "warning";
  const isError = notice.type === "error";

  return (
    <div
      className={`lf-toast ${notice.type || "info"}`}
      role="status"
      aria-live="polite"
    >
      <div className="lf-toast-icon">
        {isSuccess && <CheckCircle2 size={18} className="text-emerald" />}
        {isWarning && <AlertCircle size={18} className="text-amber" />}
        {isError && <XCircle size={18} className="text-rose" />}
        {!isSuccess && !isWarning && !isError && <Info size={18} className="text-blue" />}
      </div>
      <div className="lf-toast-content">
        <div className="lf-toast-title">
          {notice.title || (isSuccess ? "Success" : isWarning ? "Attention" : isError ? "Error" : "Notification")}
        </div>
        <div className="lf-toast-message">{notice.text}</div>
      </div>
      <button
        type="button"
        className="lf-toast-close"
        onClick={onClose}
        aria-label="Dismiss notification"
      >
        <X size={15} />
      </button>
    </div>
  );
}
