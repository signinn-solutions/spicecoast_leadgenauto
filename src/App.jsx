import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import {
  Search, BarChart3, List, Phone, Mail, Globe, CheckCircle, CheckCircle2, XCircle,
  AlertCircle, Loader2, MapPin, Tag, ChevronRight, Sprout, Download,
  RefreshCw, Filter, Sparkles, Database, ExternalLink, Send, Bot,
  Inbox, Copy, Check, Settings, ShieldCheck, ArrowUpRight, Zap,
  Edit3, Eye, FileText, Clock, Compass, Anchor, Package, UserCheck, Radio
} from "lucide-react";

const DAILY_LIMIT = 50;

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

  .lf-root {
    --ink: #17140f;
    --surface: #211c15;
    --surface-2: #2a2318;
    --surface-hover: #332b1d;
    --border: #3c3324;
    --border-soft: #2d2718;
    --turmeric: #e3a22e;
    --turmeric-soft: rgba(227, 162, 46, 0.14);
    --turmeric-glow: rgba(227, 162, 46, 0.25);
    --paprika: #c04b32;
    --paprika-soft: rgba(192, 75, 50, 0.14);
    --cardamom: #7ea86e;
    --cardamom-soft: rgba(126, 168, 110, 0.14);
    --blue: #38bdf8;
    --blue-soft: rgba(56, 189, 248, 0.14);
    --text: #f3ecdd;
    --text-muted: #b3a892;
    --text-faint: #7d735f;
    font-family: 'Inter', -apple-system, sans-serif;
    background: var(--ink);
    background-image:
      radial-gradient(circle at 1px 1px, rgba(227,162,46,0.06) 1px, transparent 0);
    background-size: 22px 22px;
    color: var(--text);
    min-height: 100vh;
    width: 100%;
    box-sizing: border-box;
  }
  .lf-display { font-family: 'Fraunces', serif; }
  .lf-mono { font-family: 'IBM Plex Mono', monospace; }

  .lf-nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 28px; border-bottom: 1px solid var(--border-soft);
    background: rgba(23,20,15,0.92); backdrop-filter: blur(8px);
    position: sticky; top: 0; z-index: 20; gap: 16px; flex-wrap: wrap;
  }
  .lf-brand { display: flex; align-items: center; gap: 12px; }
  .lf-brand-mark {
    width: 36px; height: 36px; border-radius: 10px;
    background: linear-gradient(155deg, var(--turmeric), #b5761e);
    display: flex; align-items: center; justify-content: center;
    color: #1a1509; flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(227, 162, 46, 0.2);
  }
  .lf-brand-name { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; color: var(--text); }
  .lf-brand-sub { font-size: 11px; color: var(--text-faint); margin-top: -2px; font-family: 'IBM Plex Mono', monospace; }

  .lf-tabs { display: flex; gap: 4px; background: var(--surface); padding: 4px; border-radius: 11px; border: 1px solid var(--border-soft); }
  .lf-tab {
    display: flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 8px;
    font-size: 13.5px; font-weight: 500; color: var(--text-muted); cursor: pointer;
    border: none; background: transparent; transition: all 0.15s ease;
  }
  .lf-tab:hover { color: var(--text); background: var(--surface-hover); }
  .lf-tab.active { background: var(--turmeric-soft); color: var(--turmeric); }

  .lf-nav-right { display: flex; align-items: center; gap: 12px; }
  .lf-budget {
    display: flex; align-items: center; gap: 9px; padding: 7px 14px;
    background: var(--surface); border: 1px solid var(--border-soft); border-radius: 100px;
  }
  .lf-budget-label { font-size: 12px; color: var(--text-muted); }
  .lf-budget-count { font-family: 'IBM Plex Mono', monospace; font-weight: 600; color: var(--text); }

  .lf-live-indicator {
    display: flex; align-items: center; gap: 6px; font-size: 11px; font-family: 'IBM Plex Mono', monospace;
    color: var(--cardamom); background: var(--cardamom-soft); padding: 4px 10px; border-radius: 100px;
    border: 1px solid rgba(126, 168, 110, 0.3);
  }
  .lf-live-dot {
    width: 7px; height: 7px; border-radius: 50%; background: var(--cardamom);
    box-shadow: 0 0 8px var(--cardamom); animation: pulse-live 1.8s infinite;
  }
  @keyframes pulse-live { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  .lf-main { max-width: 1080px; margin: 0 auto; padding: 36px 24px 80px; }

  .lf-hero { margin-bottom: 28px; }
  .lf-hero h1 { font-size: 32px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.015em; color: var(--text); }
  .lf-hero p { color: var(--text-muted); font-size: 14.5px; margin: 0; max-width: 650px; line-height: 1.5; }

  .lf-card {
    background: var(--surface); border: 1px solid var(--border-soft);
    border-radius: 16px; padding: 28px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    margin-bottom: 24px;
  }

  .lf-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; }
  .lf-field { display: flex; flex-direction: column; gap: 7px; }
  .lf-field.span-2 { grid-column: span 2; }
  .lf-field label {
    font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-faint); display: flex; align-items: center; gap: 6px;
  }
  .lf-input {
    background: var(--ink); border: 1px solid var(--border); border-radius: 9px;
    padding: 12px 14px; color: var(--text); font-size: 14.5px; font-family: inherit;
    outline: none; transition: all 0.15s ease; width: 100%; box-sizing: border-box;
  }
  .lf-textarea {
    background: var(--ink); border: 1px solid var(--border); border-radius: 9px;
    padding: 12px 14px; color: var(--text); font-size: 13.5px; font-family: inherit;
    outline: none; transition: all 0.15s ease; width: 100%; box-sizing: border-box; resize: vertical;
    min-height: 95px; line-height: 1.45;
  }
  .lf-input:focus, .lf-textarea:focus { border-color: var(--turmeric); box-shadow: 0 0 0 3px var(--turmeric-soft); }
  .lf-input::placeholder, .lf-textarea::placeholder { color: var(--text-faint); }
  .lf-hint { font-size: 12px; color: var(--text-faint); margin-top: 4px; display: flex; align-items: center; gap: 6px; }

  .lf-mode-selector {
    display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap;
  }
  .lf-mode-chip {
    display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px;
    font-size: 12px; cursor: pointer; border: 1px solid var(--border); background: var(--ink);
    color: var(--text-muted); transition: all 0.15s ease;
  }
  .lf-mode-chip.active {
    border-color: var(--turmeric); background: var(--turmeric-soft); color: var(--turmeric); font-weight: 500;
  }

  .lf-submit {
    margin-top: 24px; display: flex; align-items: center; justify-content: center; gap: 10px;
    width: 100%; padding: 14px; border-radius: 10px; border: none; cursor: pointer;
    background: linear-gradient(155deg, var(--turmeric), #c98722); color: #1a1509;
    font-weight: 600; font-size: 15px; transition: all 0.15s ease;
    box-shadow: 0 4px 14px rgba(227, 162, 46, 0.25);
  }
  .lf-submit:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
  .lf-submit:active:not(:disabled) { transform: translateY(0); }
  .lf-submit:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(0.5); }

  .lf-summary-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
  .lf-stat {
    background: var(--surface); border: 1px solid var(--border-soft); border-radius: 14px; padding: 18px 20px;
    transition: border-color 0.2s ease;
  }
  .lf-stat:hover { border-color: var(--border); }
  .lf-stat-label { font-size: 11px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .lf-stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 24px; font-weight: 600; }
  .lf-stat-value.gold { color: var(--turmeric); }
  .lf-stat-value.green { color: var(--cardamom); }
  .lf-stat-value.red { color: var(--paprika); }
  .lf-stat-value.blue { color: var(--blue); }

  .lf-toolbar {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
    flex-wrap: wrap; gap: 12px;
  }
  .lf-filters { display: flex; gap: 6px; flex-wrap: wrap; }
  .lf-filter-btn {
    padding: 5px 11px; border-radius: 7px; font-size: 12px; cursor: pointer;
    background: var(--surface); border: 1px solid var(--border-soft); color: var(--text-muted);
    transition: all 0.15s ease;
  }
  .lf-filter-btn:hover { color: var(--text); background: var(--surface-hover); }
  .lf-filter-btn.active { background: var(--turmeric-soft); color: var(--turmeric); border-color: var(--turmeric); }

  .lf-action-btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 8px;
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    font-size: 12.5px; font-weight: 500; cursor: pointer; transition: all 0.15s ease;
  }
  .lf-action-btn:hover { background: var(--surface-hover); border-color: var(--turmeric); color: var(--turmeric); }
  .lf-action-btn.gold { background: var(--turmeric-soft); border-color: var(--turmeric); color: var(--turmeric); }
  .lf-action-btn.gold:hover { background: var(--turmeric); color: #1a1509; }
  .lf-action-btn.green { background: var(--cardamom-soft); border-color: var(--cardamom); color: var(--cardamom); }
  .lf-action-btn.green:hover { background: var(--cardamom); color: #1a1509; }

  .lf-table-wrap { border: 1px solid var(--border-soft); border-radius: 14px; overflow: hidden; background: var(--surface); }
  .lf-row {
    display: grid; grid-template-columns: 1.6fr 1fr 1.3fr 0.9fr; gap: 14px;
    padding: 16px 20px; align-items: center; border-bottom: 1px solid var(--border-soft);
    background: var(--surface); transition: background 0.1s ease;
  }
  .lf-row:hover:not(.header) { background: var(--surface-hover); }
  .lf-row:last-child { border-bottom: none; }
  .lf-row.header {
    background: var(--surface-2); font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--text-faint); font-weight: 600; padding: 12px 20px;
  }
  .lf-company-name { font-weight: 600; font-size: 14.5px; margin-bottom: 3px; color: var(--text); }
  .lf-company-addr { font-size: 12px; color: var(--text-faint); display: flex; align-items: center; gap: 5px; }

  .lf-badge {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 100px;
    font-size: 11.5px; font-weight: 500; font-family: 'IBM Plex Mono', monospace;
  }
  .lf-badge.green { background: var(--cardamom-soft); color: var(--cardamom); }
  .lf-badge.gold { background: var(--turmeric-soft); color: var(--turmeric); }
  .lf-badge.red { background: var(--paprika-soft); color: var(--paprika); }
  .lf-badge.blue { background: var(--blue-soft); color: var(--blue); }
  .lf-badge-sub { display: block; font-size: 11px; color: var(--text-faint); margin-top: 4px; font-family: 'IBM Plex Mono', monospace; }

  .lf-subtab-bar {
    display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border-soft);
    padding-bottom: 12px;
  }
  .lf-subtab-btn {
    display: flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 8px;
    font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid var(--border-soft);
    background: var(--surface); color: var(--text-muted); transition: all 0.15s ease;
  }
  .lf-subtab-btn:hover { color: var(--text); background: var(--surface-hover); }
  .lf-subtab-btn.active { background: var(--turmeric-soft); border-color: var(--turmeric); color: var(--turmeric); font-weight: 600; }

  /* RICH INBOUND EMAIL CARD */
  .lf-inbound-card {
    background: var(--surface); border: 1px solid var(--border-soft); border-radius: 16px;
    padding: 24px; margin-bottom: 20px; box-shadow: 0 6px 20px rgba(0,0,0,0.25);
    transition: all 0.2s ease;
  }
  .lf-inbound-card:hover { border-color: var(--border); }
  
  .lf-inbound-header-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 12px;
    padding: 16px; margin-bottom: 16px;
  }
  .lf-party-box { display: flex; flex-direction: column; gap: 3px; }
  .lf-party-label {
    font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-faint); display: flex; align-items: center; gap: 5px;
  }
  .lf-party-name { font-size: 14px; font-weight: 600; color: var(--text); }
  .lf-party-email { font-size: 12px; font-family: 'IBM Plex Mono', monospace; color: var(--turmeric); }

  .lf-data-matrix {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;
  }
  .lf-matrix-item {
    background: var(--ink); border: 1px solid var(--border-soft); border-radius: 8px; padding: 10px 12px;
  }
  .lf-matrix-label { font-size: 10.5px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
  .lf-matrix-val { font-size: 12.5px; font-weight: 600; color: var(--text); }
  .lf-matrix-val.gold { color: var(--turmeric); }
  .lf-matrix-val.green { color: var(--cardamom); }
  .lf-matrix-val.blue { color: var(--blue); }

  .lf-chips-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
  .lf-meta-chip {
    display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 6px;
    font-size: 11.5px; font-family: 'IBM Plex Mono', monospace; background: var(--ink); border: 1px solid var(--border-soft);
    color: var(--text-muted);
  }
  .lf-meta-chip.product { border-color: rgba(126, 168, 110, 0.4); color: var(--cardamom); background: rgba(126, 168, 110, 0.08); }
  .lf-meta-chip.intent { border-color: rgba(227, 162, 46, 0.4); color: var(--turmeric); background: rgba(227, 162, 46, 0.08); }
  .lf-meta-chip.priority { border-color: rgba(192, 75, 50, 0.4); color: #f87171; background: rgba(192, 75, 50, 0.08); }

  .lf-msg-body-preview {
    background: var(--ink); border: 1px solid var(--border-soft); border-radius: 10px;
    padding: 14px 16px; font-size: 13px; color: var(--text); line-height: 1.5;
    white-space: pre-wrap; margin-bottom: 16px;
  }
  .lf-draft-box {
    background: rgba(227, 162, 46, 0.04); border: 1px dashed var(--turmeric);
    border-radius: 12px; padding: 18px; margin-top: 12px;
  }
  .lf-draft-header {
    display: flex; align-items: center; justify-content: space-between; font-size: 12px;
    font-weight: 600; color: var(--turmeric); text-transform: uppercase; letter-spacing: 0.05em;
    margin-bottom: 10px;
  }
  .lf-draft-text {
    font-size: 13.5px; color: var(--text); line-height: 1.55; white-space: pre-wrap;
    font-family: 'Inter', sans-serif;
  }
  .lf-draft-actions {
    display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 16px;
    flex-wrap: wrap;
  }

  /* MODAL STYLES */
  .lf-modal-backdrop {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(15, 12, 8, 0.82); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center; z-index: 100;
    padding: 20px; box-sizing: border-box;
  }
  .lf-modal-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 18px;
    width: 100%; max-width: 680px; max-height: 90vh; overflow-y: auto;
    padding: 28px; box-shadow: 0 16px 40px rgba(0,0,0,0.5);
  }
  .lf-modal-header {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;
  }
  .lf-modal-title { font-size: 18px; font-weight: 600; color: var(--text); }
  .lf-modal-close {
    background: transparent; border: none; color: var(--text-faint); cursor: pointer;
    font-size: 18px; display: flex; align-items: center; justify-content: center;
  }
  .lf-modal-close:hover { color: var(--text); }

  .lf-empty {
    text-align: center; padding: 70px 20px; color: var(--text-faint);
  }
  .lf-empty svg { margin-bottom: 14px; opacity: 0.5; color: var(--turmeric); }
  .lf-empty p { font-size: 14px; margin: 0; }

  .lf-analytics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 24px; }
  .lf-panel { background: var(--surface); border: 1px solid var(--border-soft); border-radius: 16px; padding: 24px; }
  .lf-panel h3 { font-size: 13px; font-weight: 600; margin: 0 0 18px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

  .lf-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 80px 0; color: var(--text-muted); }
  .spin { animation: lf-spin 0.9s linear infinite; }
  @keyframes lf-spin { to { transform: rotate(360deg); } }

  @media (max-width: 768px) {
    .lf-form-grid { grid-template-columns: 1fr; }
    .lf-field.span-2 { grid-column: span 1; }
    .lf-summary-row { grid-template-columns: 1fr 1fr; }
    .lf-analytics-grid { grid-template-columns: 1fr; }
    .lf-data-matrix { grid-template-columns: 1fr 1fr; }
    .lf-inbound-header-grid { grid-template-columns: 1fr; }
    .lf-row { grid-template-columns: 1fr; gap: 8px; }
    .lf-row.header { display: none; }
    .lf-nav { padding: 14px 16px; }
  }
`;

// Cross-environment storage wrapper
const storage = {
  get: async (key) => {
    try {
      if (typeof window !== "undefined" && window.storage?.get) {
        return await window.storage.get(key);
      }
      const val = localStorage.getItem(`spicecoast_${key}`);
      return val ? { value: val } : null;
    } catch {
      return null;
    }
  },
  set: async (key, value) => {
    try {
      if (typeof window !== "undefined" && window.storage?.set) {
        return await window.storage.set(key, value);
      }
      localStorage.setItem(`spicecoast_${key}`, value);
    } catch (e) {
      console.warn("Storage error:", e);
    }
  },
};

const PhoneBadge = ({ status }) => {
  if (status === "valid") return <span className="lf-badge green"><CheckCircle2 size={12} /> Valid</span>;
  return <span className="lf-badge red"><XCircle size={12} /> Invalid</span>;
};

const EmailBadge = ({ status }) => {
  if (status === "deliverable" || status === "valid") return <span className="lf-badge green"><CheckCircle2 size={12} /> Deliverable</span>;
  if (status === "risky" || status === "accept_all") return <span className="lf-badge gold"><AlertCircle size={12} /> Risky</span>;
  return <span className="lf-badge red"><XCircle size={12} /> Not found</span>;
};

export default function LeadFinderApp() {
  const [view, setView] = useState("search"); // search | results | mailbox | analytics
  const [mailboxSubTab, setMailboxSubTab] = useState("inbound"); // inbound | outreach | simulate
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [filterMode, setFilterMode] = useState("all"); // all, emails, phones, both
  const [searchMode, setSearchMode] = useState("auto"); // auto, live, simulated

  const [businessType, setBusinessType] = useState("spice importer");
  const [city, setCity] = useState("Hamburg");
  const [country, setCountry] = useState("Germany");
  const [count, setCount] = useState(15);

  const [usage, setUsage] = useState({ date: "", count: 0 });
  const [currentResults, setCurrentResults] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);

  // MAILBOX & OUTREACH STATE
  const [mailboxStatus, setMailboxStatus] = useState({
    mailbox: "sales@thespicecoast.com",
    auto_send: false,
    daily_limit: 30,
    used_today: 0,
    remaining_today: 30,
    has_deepseek_key: false,
    has_hostinger_token: false,
    deepseek_model: "deepseek-chat",
    outreachStats: { total: 0, pendingDrafts: 0, sentOutreach: 0 }
  });
  const [mailboxMessages, setMailboxMessages] = useState([]);
  const [outreachList, setOutreachList] = useState([]);
  const [simulatingMail, setSimulatingMail] = useState(false);
  const [simSender, setSimSender] = useState("inquiry@eurospice-hamburg.de");
  const [simName, setSimName] = useState("Markus Weber");
  const [simSubject, setSimSubject] = useState("Inquiry: Bulk Malabar Black Pepper 550GL & Cardamom FOB quotation");
  const [simBody, setSimBody] = useState("Dear SpiceCoast Sales Team,\n\nWe are looking to purchase 2 FCL containers of Malabar Black Pepper (550 GL) and 5 Metric Tons of 8mm Alleppey Green Cardamom for delivery to Hamburg port, Germany.\n\nPlease share your current product specification sheet, pesticide compliance report, and FOB price list.\n\nBest regards,\nMarkus Weber\nSenior Procurement Manager\nEuroSpice Distribution GmbH, Hamburg");
  const [copiedId, setCopiedId] = useState(null);
  const [sendingMsgId, setSendingMsgId] = useState(null);

  // REVIEW & EDIT MODAL STATE
  const [activeColdMailModal, setActiveColdMailModal] = useState(null);
  const [editingSubject, setEditingSubject] = useState("");
  const [editingBody, setEditingBody] = useState("");
  const [generatingDraftForLeadId, setGeneratingDraftForLeadId] = useState(null);
  const [confirmSendId, setConfirmSendId] = useState(null);
  const [lastSearchInfo, setLastSearchInfo] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const remaining = usage.date === today ? Math.max(0, DAILY_LIMIT - usage.count) : DAILY_LIMIT;

  // Load all initial data
  const fetchAllData = useCallback(async () => {
    try {
      // Backend Status
      try {
        const res = await fetch("/api/status");
        if (res.ok) {
          const data = await res.json();
          if (data.date) setUsage({ date: data.date, count: data.count });
        }
      } catch {}

      // Mailbox & Outreach Data
      try {
        const [mRes, msgsRes, outreachRes] = await Promise.all([
          fetch("/api/mailbox/status"),
          fetch("/api/mailbox/messages"),
          fetch("/api/mailbox/outreach"),
        ]);
        if (mRes.ok) setMailboxStatus(await mRes.json());
        if (msgsRes.ok) {
          const msgsData = await msgsRes.json();
          setMailboxMessages(msgsData.messages || []);
        }
        if (outreachRes.ok) {
          const oData = await outreachRes.json();
          setOutreachList(oData.outreach || []);
        }
      } catch {}

      const [u, leads, hist] = await Promise.all([
        storage.get("usage").catch(() => null),
        storage.get("all-leads").catch(() => null),
        storage.get("search-history").catch(() => null),
      ]);
      if (u?.value && !usage.date) setUsage(JSON.parse(u.value));
      if (leads?.value) setAllLeads(JSON.parse(leads.value));
      if (hist?.value) setSearchHistory(JSON.parse(hist.value));
    } catch (e) {
      console.warn("Storage initial load issue:", e);
    } finally {
      setLoading(false);
    }
  }, [usage.date]);

  // Initial load
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Real-time automatic polling every 4 seconds to pick up live Webhook events seamlessly
  useEffect(() => {
    const pollInterval = setInterval(() => {
      // Fetch fresh mailbox messages & outreach silently in the background
      Promise.all([
        fetch("/api/mailbox/messages").then(r => r.ok ? r.json() : null),
        fetch("/api/mailbox/outreach").then(r => r.ok ? r.json() : null),
        fetch("/api/mailbox/status").then(r => r.ok ? r.json() : null),
      ]).then(([msgsData, outreachData, statusData]) => {
        if (msgsData?.messages) setMailboxMessages(msgsData.messages);
        if (outreachData?.outreach) setOutreachList(outreachData.outreach);
        if (statusData) setMailboxStatus(statusData);
      }).catch(() => {});
    }, 4000);

    return () => clearInterval(pollInterval);
  }, []);

  const persist = useCallback(async (key, value) => {
    try {
      await storage.set(key, JSON.stringify(value));
    } catch (e) {
      console.warn("Error saving locally:", e);
    }
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    setError(null);
    if (!businessType.trim() || !city.trim() || !country.trim()) {
      setError("Please fill in business type, city, and country.");
      return;
    }
    if (count < 1 || count > 50) {
      setError("Number of businesses must be between 1 and 50.");
      return;
    }
    if (count > remaining) {
      setError(`Only ${remaining} searches remaining in today's daily limit of ${DAILY_LIMIT}.`);
      return;
    }

    setSearching(true);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_type: businessType.trim(),
          city: city.trim(),
          country: country.trim(),
          count: count,
          mode: searchMode,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const leads = data.leads || [];
        const isLive = data.mode === "live";

        if (data.usage) {
          setUsage(data.usage);
          await persist("usage", data.usage);
        }

        const seenLeadKeys = new Set();
        const newAllLeads = [...leads, ...allLeads].filter((lead) => {
          const key = lead.id || (lead.name ? lead.name.toLowerCase().replace(/[^a-z0-9]/g, '') : null);
          if (!key || seenLeadKeys.has(key)) return false;
          seenLeadKeys.add(key);
          return true;
        });

        const newHistory = [
          {
            id: Date.now(),
            query: `${businessType} · ${city}, ${country}`,
            count: leads.length,
            date: new Date().toISOString(),
            isLive,
          },
          ...searchHistory,
        ].slice(0, 30);

        setAllLeads(newAllLeads);
        setSearchHistory(newHistory);
        setCurrentResults(leads);
        setLastSearchInfo({
          count: leads.length,
          duplicatesSkipped: data.duplicatesSkipped || 0,
          mode: data.mode,
        });
        await persist("all-leads", newAllLeads);
        await persist("search-history", newHistory);

        // Refresh outreach list as new cold drafts are generated
        fetchAllData();

        setSearching(false);
        setView("results");
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Search request failed");
      }
    } catch (err) {
      setError(err.message);
      setSearching(false);
    }
  };

  // Generate / View Cold Mail for Lead
  const handleOpenColdMailModal = async (lead) => {
    let draft = lead.coldMailDraft;

    if (!draft) {
      setGeneratingDraftForLeadId(lead.id);
      try {
        const res = await fetch("/api/leads/generate-coldmail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            name: lead.name,
            email: lead.email,
            city: lead.city || city,
            country: lead.country || country,
            businessType: lead.businessType || businessType,
            address: lead.address,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          draft = data.draft;
          lead.coldMailDraft = draft;
        }
      } catch (e) {
        console.warn("Failed to generate cold draft:", e);
      } finally {
        setGeneratingDraftForLeadId(null);
      }
    }

    if (draft) {
      setActiveColdMailModal({
        leadId: lead.id,
        company: lead.name,
        recipient: lead.email,
        subject: draft.subject,
        body: draft.body,
        status: draft.status || "pending_review",
      });
      setEditingSubject(draft.subject);
      setEditingBody(draft.body);
      setConfirmSendId(null);
    }
  };

  // Save changes to draft
  const handleSaveDraftChanges = async () => {
    if (!activeColdMailModal) return;
    try {
      await fetch("/api/mailbox/update-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `outreach-${activeColdMailModal.leadId}`,
          subject: editingSubject,
          body: editingBody,
        }),
      });

      setActiveColdMailModal((prev) => ({
        ...prev,
        subject: editingSubject,
        body: editingBody,
      }));

      // Update in current results
      setCurrentResults((prev) =>
        prev.map((l) =>
          l.id === activeColdMailModal.leadId
            ? { ...l, coldMailDraft: { ...l.coldMailDraft, subject: editingSubject, body: editingBody } }
            : l
        )
      );

      fetchAllData();
    } catch (e) {
      console.warn("Failed to save draft:", e);
    }
  };

  // Confirm and Send Cold Mail
  const handleConfirmAndSendColdMail = async () => {
    if (!activeColdMailModal) return;
    setSendingMsgId(activeColdMailModal.leadId);

    try {
      const res = await fetch("/api/mailbox/send-coldmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `outreach-${activeColdMailModal.leadId}`,
          to: activeColdMailModal.recipient,
          subject: editingSubject,
          body: editingBody,
        }),
      });

      if (res.ok) {
        setActiveColdMailModal((prev) => ({ ...prev, status: "sent" }));

        // Mark sent in current results
        setCurrentResults((prev) =>
          prev.map((l) =>
            l.id === activeColdMailModal.leadId
              ? { ...l, coldMailDraft: { ...l.coldMailDraft, status: "sent" } }
              : l
          )
        );

        fetchAllData();
      }
    } catch (err) {
      console.warn("Failed to send cold mail:", err);
    } finally {
      setSendingMsgId(null);
      setConfirmSendId(null);
    }
  };

  // Simulate Inbound Email
  const handleSimulateInboundMail = async (e) => {
    e.preventDefault();
    if (!simSender.trim() || !simSubject.trim() || !simBody.trim()) return;

    setSimulatingMail(true);
    try {
      const res = await fetch("/api/mailbox/test-incoming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: simSender.trim(),
          from_name: simName.trim(),
          to: mailboxStatus.mailbox,
          to_name: "The Spice Coast (Sales Desk)",
          subject: simSubject.trim(),
          message: simBody.trim(),
          auto_send: mailboxStatus.auto_send,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setMailboxMessages((prev) => [data.message, ...prev]);
        }
        fetchAllData();
        setMailboxSubTab("inbound");
      }
    } catch (err) {
      console.warn("Error running mail simulation:", err);
    } finally {
      setSimulatingMail(false);
    }
  };

  const handleToggleAutoSend = async () => {
    const nextState = !mailboxStatus.auto_send;
    try {
      const res = await fetch("/api/mailbox/toggle-autosend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_send: nextState }),
      });
      if (res.ok) {
        setMailboxStatus((prev) => ({ ...prev, auto_send: nextState }));
      }
    } catch (err) {
      console.warn("Error toggling auto-send:", err);
    }
  };

  const handleSendDraft = async (msg) => {
    setSendingMsgId(msg.id);
    try {
      const res = await fetch("/api/mailbox/send-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: msg.id,
          to: msg.sender,
          subject: msg.subject,
          reply: msg.draftReply,
        }),
      });
      if (res.ok) {
        setMailboxMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, status: "sent", sentAt: new Date().toLocaleTimeString() } : m))
        );
      }
    } catch (err) {
      console.warn("Failed to dispatch draft:", err);
    } finally {
      setSendingMsgId(null);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredResults = useMemo(() => {
    return currentResults.filter((lead) => {
      const hasDeliverableEmail = lead.emailStatus === "deliverable" || lead.emailStatus === "valid";
      const hasValidPhone = lead.phoneStatus === "valid";
      if (filterMode === "emails") return hasDeliverableEmail;
      if (filterMode === "phones") return hasValidPhone;
      if (filterMode === "both") return hasDeliverableEmail && hasValidPhone;
      return true;
    });
  }, [currentResults, filterMode]);

  const summary = useMemo(() => {
    const total = currentResults.length;
    const validEmails = currentResults.filter((l) => l.emailStatus === "deliverable" || l.emailStatus === "valid").length;
    const validPhones = currentResults.filter((l) => l.phoneStatus === "valid").length;
    const bothValid = currentResults.filter(
      (l) => (l.emailStatus === "deliverable" || l.emailStatus === "valid") && l.phoneStatus === "valid"
    ).length;
    return { total, validEmails, validPhones, bothValid };
  }, [currentResults]);

  const chartData = useMemo(() => {
    const deliverable = allLeads.filter((l) => l.emailStatus === "deliverable" || l.emailStatus === "valid").length;
    const risky = allLeads.filter((l) => l.emailStatus === "risky" || l.emailStatus === "accept_all").length;
    const notFound = allLeads.filter((l) => l.emailStatus === "not_found" || l.emailStatus === "invalid").length;
    return [
      { name: "Deliverable", value: deliverable, color: "var(--cardamom)" },
      { name: "Risky / Accept All", value: risky, color: "var(--turmeric)" },
      { name: "Not Found", value: notFound, color: "var(--paprika)" },
    ];
  }, [allLeads]);

  const exportCSV = () => {
    if (filteredResults.length === 0) return;
    const headers = ["Company Name", "Address", "Phone", "Phone Status", "Email", "Email Status", "Website", "Date Found"];
    const rows = filteredResults.map((l) => [
      `"${(l.name || "").replace(/"/g, '""')}"`,
      `"${(l.address || "").replace(/"/g, '""')}"`,
      `"${l.phone || ""}"`,
      `"${l.phoneStatus || ""}"`,
      `"${l.email || ""}"`,
      `"${l.emailStatus || ""}"`,
      `"${l.website || ""}"`,
      `"${l.foundAt || ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `spicecoast_leads_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="lf-root">
        <style>{STYLES}</style>
        <div className="lf-loading"><Loader2 size={24} className="spin" /> Initializing SpiceCoast Automation...</div>
      </div>
    );
  }

  return (
    <div className="lf-root">
      <style>{STYLES}</style>

      {/* Navigation */}
      <nav className="lf-nav">
        <div className="lf-brand">
          <div className="lf-brand-mark"><Sprout size={20} /></div>
          <div>
            <div className="lf-brand-name lf-display">SpiceCoast</div>
            <div className="lf-brand-sub">B2B Automation & AI Mailbox</div>
          </div>
        </div>

        <div className="lf-tabs">
          <button className={`lf-tab ${view === "search" ? "active" : ""}`} onClick={() => setView("search")}>
            <Search size={15} /> Search
          </button>
          <button className={`lf-tab ${view === "results" ? "active" : ""}`} onClick={() => setView("results")}>
            <List size={15} /> Results {currentResults.length > 0 && `(${currentResults.length})`}
          </button>
          <button className={`lf-tab ${view === "mailbox" ? "active" : ""}`} onClick={() => setView("mailbox")}>
            <Mail size={15} /> Inbound Webhooks & AI Mailbox {mailboxMessages.length > 0 && `(${mailboxMessages.length})`}
          </button>
          <button className={`lf-tab ${view === "analytics" ? "active" : ""}`} onClick={() => setView("analytics")}>
            <BarChart3 size={15} /> Analytics
          </button>
        </div>

        <div className="lf-nav-right">
          <div className="lf-live-indicator" title="Live Webhook listener active on Cloudflare Tunnel">
            <span className="lf-live-dot"></span>
            <span>Webhook Live</span>
          </div>

          <div className="lf-budget" title={`Daily lead limit resets at midnight. Max ${DAILY_LIMIT}/day.`}>
            <span className="lf-budget-label">Leads</span>
            <span className="lf-budget-count">{Math.max(0, usage.date === today ? usage.count : 0)}/{DAILY_LIMIT}</span>
          </div>
          <div className="lf-budget" title={`Daily AI replies quota.`}>
            <span className="lf-budget-label">Replies</span>
            <span className="lf-budget-count" style={{ color: "var(--turmeric)" }}>{mailboxStatus.used_today}/{mailboxStatus.daily_limit}</span>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="lf-main">
        {error && (
          <div style={{ background: "var(--paprika-soft)", border: "1px solid var(--paprika)", color: "#f87171", padding: "14px 18px", borderRadius: 12, marginBottom: 24, fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* SEARCH VIEW */}
        {view === "search" && (
          <>
            <div className="lf-hero">
              <h1 className="lf-display">Discover & Verify B2B Leads</h1>
              <p>Find targeted spice importers with Google Places, verify deliverability via Hunter.io, and automatically generate personalized DeepSeek AI cold emails.</p>
            </div>

            <div className="lf-card">
              <form onSubmit={handleSearch}>
                <div className="lf-form-grid">
                  <div className="lf-field">
                    <label><Tag size={12} /> Business type</label>
                    <input className="lf-input" placeholder="e.g. spice importer, food distributor" value={businessType} onChange={(e) => setBusinessType(e.target.value)} />
                  </div>
                  <div className="lf-field">
                    <label><MapPin size={12} /> City</label>
                    <input className="lf-input" placeholder="e.g. Hamburg, Dubai, Kochi" value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div className="lf-field">
                    <label><Globe size={12} /> Country</label>
                    <input className="lf-input" placeholder="e.g. Germany, UAE, India" value={country} onChange={(e) => setCountry(e.target.value)} />
                  </div>
                  <div className="lf-field">
                    <label>Number to find (max 50)</label>
                    <input
                      className="lf-input" type="number" min={1} max={50}
                      value={count} onChange={(e) => setCount(parseInt(e.target.value || "0", 10))}
                    />
                  </div>

                  <div className="lf-field span-2">
                    <label><Sparkles size={12} /> Search Mode</label>
                    <div className="lf-mode-selector">
                      <div className={`lf-mode-chip ${searchMode === "auto" ? "active" : ""}`} onClick={() => setSearchMode("auto")}>
                        <Database size={13} /> Auto (Live API + Fallback)
                      </div>
                      <div className={`lf-mode-chip ${searchMode === "live" ? "active" : ""}`} onClick={() => setSearchMode("live")}>
                        <Globe size={13} /> Live Places & Hunter.io
                      </div>
                      <div className={`lf-mode-chip ${searchMode === "simulated" ? "active" : ""}`} onClick={() => setSearchMode("simulated")}>
                        <Sparkles size={13} /> Simulation Test (No API credits used)
                      </div>
                    </div>
                  </div>
                </div>

                <button className="lf-submit" type="submit" disabled={searching}>
                  {searching ? <><Loader2 size={16} className="spin" /> Searching, Verifying & Drafting Cold Emails...</> : <><Search size={16} /> Harvest Leads ({count})</>}
                </button>
              </form>
            </div>
          </>
        )}

        {/* RESULTS VIEW */}
        {view === "results" && (
          <>
            <div className="lf-hero">
              <h1 className="lf-display">Harvested Leads & Cold Email Drafts</h1>
              <p>Deliverable emails have AI-personalized cold outreach drafts generated by DeepSeek. Review and confirm before dispatching.</p>
            </div>

            {lastSearchInfo && (
              <div style={{ background: '#1c2419', border: '1px solid #2e4d28', color: '#88e070', padding: '12px 18px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                <CheckCircle size={18} color="#88e070" />
                <span>
                  <strong>Search Complete ({lastSearchInfo.mode === 'live' ? 'Live Places API' : 'Simulated Mode'}):</strong> Found <strong>{lastSearchInfo.count}</strong> new unique lead(s).
                  {lastSearchInfo.duplicatesSkipped > 0 ? (
                    <> <strong>{lastSearchInfo.duplicatesSkipped}</strong> previously saved duplicate(s) automatically filtered out!</>
                  ) : (
                    <> Checked local database (0 duplicates detected).</>
                  )}
                </span>
              </div>
            )}

            {currentResults.length > 0 && (
              <>
                <div className="lf-summary-row">
                  <div className="lf-stat"><div className="lf-stat-label">Total Found</div><div className="lf-stat-value lf-mono">{summary.total}</div></div>
                  <div className="lf-stat"><div className="lf-stat-label">Deliverable Email</div><div className="lf-stat-value green lf-mono">{summary.validEmails}</div></div>
                  <div className="lf-stat"><div className="lf-stat-label">Valid Phone</div><div className="lf-stat-value green lf-mono">{summary.validPhones}</div></div>
                  <div className="lf-stat"><div className="lf-stat-label">AI Drafts Ready</div><div className="lf-stat-value gold lf-mono">{currentResults.filter(l => l.coldMailDraft).length}</div></div>
                </div>

                <div className="lf-toolbar">
                  <div className="lf-filters">
                    <button className={`lf-filter-btn ${filterMode === "all" ? "active" : ""}`} onClick={() => setFilterMode("all")}>
                      All ({currentResults.length})
                    </button>
                    <button className={`lf-filter-btn ${filterMode === "emails" ? "active" : ""}`} onClick={() => setFilterMode("emails")}>
                      Deliverable Email ({summary.validEmails})
                    </button>
                    <button className={`lf-filter-btn ${filterMode === "phones" ? "active" : ""}`} onClick={() => setFilterMode("phones")}>
                      Valid Phone ({summary.validPhones})
                    </button>
                    <button className={`lf-filter-btn ${filterMode === "both" ? "active" : ""}`} onClick={() => setFilterMode("both")}>
                      Fully Verified ({summary.bothValid})
                    </button>
                  </div>

                  <button className="lf-action-btn" onClick={exportCSV}>
                    <Download size={14} /> Export CSV
                  </button>
                </div>
              </>
            )}

            {filteredResults.length === 0 ? (
              <div className="lf-card lf-empty">
                <Search size={32} />
                <p>{currentResults.length === 0 ? "No results yet. Go to Search to harvest your first batch of leads." : "No leads match the selected filter."}</p>
              </div>
            ) : (
              <div className="lf-table-wrap">
                <div className="lf-row header">
                  <div>Company & Location</div><div>Contact Info</div><div>Verified Email & AI Outreach</div><div>Actions</div>
                </div>
                {filteredResults.map((lead) => {
                  const hasEmail = lead.emailStatus === "deliverable" || lead.emailStatus === "valid";
                  const isSent = lead.coldMailDraft?.status === "sent";

                  return (
                    <div className="lf-row" key={lead.id}>
                      <div>
                        <div className="lf-company-name">{lead.name}</div>
                        <div className="lf-company-addr"><MapPin size={11} /> {lead.address}</div>
                      </div>
                      <div>
                        <PhoneBadge status={lead.phoneStatus} />
                        <span className="lf-badge-sub">{lead.phone}</span>
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <EmailBadge status={lead.emailStatus} />
                          {hasEmail && (
                            <button
                              className={`lf-action-btn ${isSent ? "green" : "gold"}`}
                              style={{ padding: "3px 8px", fontSize: "11px" }}
                              disabled={generatingDraftForLeadId === lead.id}
                              onClick={() => handleOpenColdMailModal(lead)}
                            >
                              {generatingDraftForLeadId === lead.id ? (
                                <Loader2 size={11} className="spin" />
                              ) : isSent ? (
                                <CheckCircle2 size={11} />
                              ) : (
                                <Sparkles size={11} />
                              )}
                              <span>{isSent ? "Outreach Sent" : lead.coldMailDraft ? "Review AI Draft" : "Generate Draft"}</span>
                            </button>
                          )}
                        </div>
                        <span className="lf-badge-sub">{lead.email}</span>
                      </div>
                      <div>
                        {lead.website && lead.website !== "#" ? (
                          <a className="lf-website-link" href={lead.website} target="_blank" rel="noreferrer">
                            Visit <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* AI MAILBOX VIEW */}
        {view === "mailbox" && (
          <>
            <div className="lf-hero">
              <h1 className="lf-display">Inbound Webhooks & AI Mailbox</h1>
              <p>Real-time incoming inquiries captured from Hostinger webhooks, with sender/receiver details, structured lead data extraction, and AI drafted replies.</p>
            </div>

            {/* Mailbox Status & Webhook Info Card */}
            <div className="lf-mail-header-banner" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, background: "linear-gradient(145deg, rgba(227,162,46,0.1), rgba(192,75,50,0.08))", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px", marginBottom: 24, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                <Mail size={16} color="var(--turmeric)" />
                <span>Primary Mailbox:</span>
                <span className="lf-mono" style={{ fontWeight: 600, color: "var(--text)" }}>{mailboxStatus.mailbox}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                <Bot size={16} color="var(--cardamom)" />
                <span>AI Engine:</span>
                <span className="lf-mono" style={{ fontWeight: 600, color: "var(--text)" }}>{mailboxStatus.deepseek_model}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                <ShieldCheck size={16} color="var(--turmeric)" />
                <span>Auto-Send:</span>
                <button
                  className={`lf-action-btn ${mailboxStatus.auto_send ? "gold" : ""}`}
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                  onClick={handleToggleAutoSend}
                >
                  <Zap size={12} /> {mailboxStatus.auto_send ? "Auto-Send Enabled" : "Review-First Mode"}
                </button>
              </div>

              <div>
                <button
                  className="lf-action-btn"
                  style={{ fontSize: "12px", padding: "4px 10px" }}
                  onClick={() => copyToClipboard(typeof window !== "undefined" && window.location.host.includes("trycloudflare.com") ? `${window.location.origin}/webhook` : "https://surgeon-rome-dangerous-metabolism.trycloudflare.com/webhook", "webhook-url")}
                >
                  {copiedId === "webhook-url" ? <Check size={12} color="var(--cardamom)" /> : <Copy size={12} />}
                  <span>Copy Webhook URL</span>
                </button>
              </div>
            </div>

            {/* Subtab Navigation for Mailbox */}
            <div className="lf-subtab-bar">
              <button
                className={`lf-subtab-btn ${mailboxSubTab === "inbound" ? "active" : ""}`}
                onClick={() => setMailboxSubTab("inbound")}
              >
                <Inbox size={14} /> Inbound Webhook Inquiries ({mailboxMessages.length})
              </button>
              <button
                className={`lf-subtab-btn ${mailboxSubTab === "outreach" ? "active" : ""}`}
                onClick={() => setMailboxSubTab("outreach")}
              >
                <Send size={14} /> Outbound Cold Drafts ({outreachList.filter(o => o.status === "pending_review").length} Pending)
              </button>
              <button
                className={`lf-subtab-btn ${mailboxSubTab === "simulate" ? "active" : ""}`}
                onClick={() => setMailboxSubTab("simulate")}
              >
                <Sparkles size={14} /> Test Webhook Simulator
              </button>
            </div>

            {/* SUBTAB 1: INBOUND INQUIRIES & REPLIES (WITH SENDER, RECEIVER & MAIN DATA) */}
            {mailboxSubTab === "inbound" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text)" }}>
                      Live Inbound Emails via Webhook
                    </h3>
                    <div className="lf-live-indicator" style={{ padding: "2px 8px", fontSize: "10.5px" }}>
                      <span className="lf-live-dot"></span> Live Polling
                    </div>
                  </div>
                  <button className="lf-action-btn" onClick={fetchAllData}>
                    <RefreshCw size={13} /> Refresh Inbox
                  </button>
                </div>

                {mailboxMessages.length === 0 ? (
                  <div className="lf-card lf-empty">
                    <Inbox size={34} />
                    <p>No inbound emails received yet. When leads reply to your emails or send inquiries via Hostinger, they will automatically appear here with extracted metadata.</p>
                  </div>
                ) : (
                  <div>
                    {mailboxMessages.map((msg) => {
                      const meta = msg.metadata || {};
                      const buyerName = meta.buyerName || msg.senderName || msg.sender.split('@')[0];
                      const receiverEmail = msg.receiver || meta.receiverEmail || mailboxStatus.mailbox;
                      const receiverName = msg.receiverName || meta.receiverName || "The Spice Coast (Sales Desk)";

                      return (
                        <div className="lf-inbound-card" key={msg.id}>
                          {/* SENDER & RECEIVER HEADER BOX */}
                          <div className="lf-inbound-header-grid">
                            <div className="lf-party-box">
                              <span className="lf-party-label">
                                <UserCheck size={12} color="var(--cardamom)" /> From (Sender / Buyer)
                              </span>
                              <div className="lf-party-name">{buyerName} {meta.buyerCompany && `· ${meta.buyerCompany}`}</div>
                              <div className="lf-party-email">&lt;{msg.sender}&gt;</div>
                            </div>

                            <div className="lf-party-box">
                              <span className="lf-party-label">
                                <Mail size={12} color="var(--turmeric)" /> To (Receiver / Mailbox)
                              </span>
                              <div className="lf-party-name">{receiverName}</div>
                              <div className="lf-party-email">&lt;{receiverEmail}&gt;</div>
                            </div>
                          </div>

                          {/* MAIN DATA MATRIX */}
                          <div className="lf-data-matrix">
                            <div className="lf-matrix-item">
                              <div className="lf-matrix-label">Intent / Purpose</div>
                              <div className="lf-matrix-val gold">{meta.intent || "Price Quote Inquiry"}</div>
                            </div>
                            <div className="lf-matrix-item">
                              <div className="lf-matrix-label">Est. Volume / MOQ</div>
                              <div className="lf-matrix-val">{meta.requestedVolume || "Not specified"}</div>
                            </div>
                            <div className="lf-matrix-item">
                              <div className="lf-matrix-label">Destination Port</div>
                              <div className="lf-matrix-val blue">{meta.destinationPort || "Not specified"}</div>
                            </div>
                            <div className="lf-matrix-item">
                              <div className="lf-matrix-label">Priority & Status</div>
                              <div className={`lf-matrix-val ${meta.priority === "High" ? "gold" : "green"}`}>
                                {meta.priority || "Medium"} · {msg.status === "sent" ? "Dispatched" : "Review Ready"}
                              </div>
                            </div>
                          </div>

                          {/* SUBJECT & DATE BANNER */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>
                              <span style={{ color: "var(--text-faint)", fontWeight: 500, marginRight: 6 }}>Subject:</span>
                              {msg.subject}
                            </div>
                            <div style={{ fontSize: "11.5px", fontFamily: "IBM Plex Mono, monospace", color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 5 }}>
                              <Clock size={12} /> {msg.receivedAt || "Today"}
                            </div>
                          </div>

                          {/* DETECTED SPICES CHIPS */}
                          {meta.detectedProducts && meta.detectedProducts.length > 0 && (
                            <div className="lf-chips-row">
                              <span style={{ fontSize: "11px", color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 600, alignSelf: "center", marginRight: 4 }}>
                                Requested Spices:
                              </span>
                              {meta.detectedProducts.map((p, i) => (
                                <span className="lf-meta-chip product" key={i}>
                                  <Package size={11} /> {p}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* EMAIL CONTENT PREVIEW */}
                          <div className="lf-msg-body-preview">
                            <strong style={{ color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                              Inbound Message Body:
                            </strong>
                            {msg.body}
                          </div>

                          {/* DEEPSEEK CONTEXTUAL AI REPLY */}
                          {msg.draftReply && (
                            <div className="lf-draft-box">
                              <div className="lf-draft-header">
                                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <Bot size={14} /> DeepSeek AI Contextual Reply
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--text-faint)", fontFamily: "IBM Plex Mono, monospace" }}>
                                  {msg.model || "deepseek-chat"}
                                </span>
                              </div>
                              <div className="lf-draft-text">{msg.draftReply}</div>

                              <div className="lf-draft-actions">
                                <button
                                  className="lf-action-btn"
                                  style={{ fontSize: "12px" }}
                                  onClick={() => copyToClipboard(msg.draftReply, msg.id)}
                                >
                                  {copiedId === msg.id ? <Check size={12} color="var(--cardamom)" /> : <Copy size={12} />}
                                  {copiedId === msg.id ? "Copied" : "Copy Reply"}
                                </button>

                                {msg.status !== "sent" && (
                                  <button
                                    className="lf-action-btn gold"
                                    style={{ fontSize: "12px" }}
                                    disabled={sendingMsgId === msg.id}
                                    onClick={() => handleSendDraft(msg)}
                                  >
                                    {sendingMsgId === msg.id ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
                                    <span>Dispatch Reply via Hostinger</span>
                                  </button>
                                )}

                                {msg.status === "sent" && (
                                  <span className="lf-badge green" style={{ padding: "4px 10px" }}>
                                    <CheckCircle2 size={12} /> Reply Dispatched
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SUBTAB 2: OUTBOUND COLD DRAFTS */}
            {mailboxSubTab === "outreach" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text)" }}>
                    Personalized Cold Email Outreach Drafts
                  </h3>
                  <button className="lf-action-btn" onClick={fetchAllData}>
                    <RefreshCw size={13} /> Refresh List
                  </button>
                </div>

                {outreachList.length === 0 ? (
                  <div className="lf-card lf-empty">
                    <Send size={34} />
                    <p>No cold outreach drafts created yet. Run a lead search to automatically generate personalized drafts for deliverable contacts.</p>
                  </div>
                ) : (
                  <div>
                    {outreachList.map((item) => (
                      <div className="lf-msg-card" key={item.id}>
                        <div className="lf-msg-top">
                          <div>
                            <div className="lf-msg-sender">{item.leadName || item.company} &lt;{item.recipient}&gt;</div>
                            <div className="lf-msg-subject">{item.subject}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span className={`lf-badge ${item.status === "sent" ? "green" : "gold"}`}>
                              {item.status === "sent" ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                              {item.status === "sent" ? `Sent on ${item.sentAt || "Today"}` : "Pending Review"}
                            </span>
                            <span className="lf-msg-date">{item.createdAt}</span>
                          </div>
                        </div>

                        <div className="lf-msg-body-preview" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
                          {item.body}
                        </div>

                        <div className="lf-draft-actions">
                          <button
                            className="lf-action-btn"
                            style={{ fontSize: "12px" }}
                            onClick={() => copyToClipboard(item.body, item.id)}
                          >
                            {copiedId === item.id ? <Check size={12} color="var(--cardamom)" /> : <Copy size={12} />}
                            <span>Copy Email</span>
                          </button>

                          <button
                            className="lf-action-btn"
                            style={{ fontSize: "12px" }}
                            onClick={() => {
                              setActiveColdMailModal({
                                leadId: item.leadId,
                                company: item.company || item.leadName,
                                recipient: item.recipient,
                                subject: item.subject,
                                body: item.body,
                                status: item.status,
                              });
                              setEditingSubject(item.subject);
                              setEditingBody(item.body);
                              setConfirmSendId(null);
                            }}
                          >
                            <Edit3 size={12} />
                            <span>Edit & Review</span>
                          </button>

                          {item.status !== "sent" && (
                            <button
                              className="lf-action-btn gold"
                              style={{ fontSize: "12px" }}
                              onClick={() => {
                                setActiveColdMailModal({
                                  leadId: item.leadId,
                                  company: item.company || item.leadName,
                                  recipient: item.recipient,
                                  subject: item.subject,
                                  body: item.body,
                                  status: item.status,
                                });
                                setEditingSubject(item.subject);
                                setEditingBody(item.body);
                                setConfirmSendId(item.id);
                              }}
                            >
                              <Send size={12} />
                              <span>Approve & Send</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SUBTAB 3: INBOUND TEST SIMULATOR */}
            {mailboxSubTab === "simulate" && (
              <div className="lf-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Sparkles size={16} color="var(--turmeric)" /> Simulate Inbound Inquiry / Reply
                  </h3>
                  <span style={{ fontSize: "12px", color: "var(--text-faint)" }}>Tests live DeepSeek metadata extraction & contextual reply drafting</span>
                </div>

                <form onSubmit={handleSimulateInboundMail}>
                  <div className="lf-form-grid" style={{ marginTop: 10 }}>
                    <div className="lf-field">
                      <label>From Sender Email</label>
                      <input className="lf-input" value={simSender} onChange={(e) => setSimSender(e.target.value)} />
                    </div>
                    <div className="lf-field">
                      <label>Buyer / Contact Name</label>
                      <input className="lf-input" value={simName} onChange={(e) => setSimName(e.target.value)} />
                    </div>
                    <div className="lf-field span-2">
                      <label>Subject Line</label>
                      <input className="lf-input" value={simSubject} onChange={(e) => setSimSubject(e.target.value)} />
                    </div>
                    <div className="lf-field span-2">
                      <label>Inbound Message Content</label>
                      <textarea className="lf-textarea" value={simBody} onChange={(e) => setSimBody(e.target.value)} />
                    </div>
                  </div>

                  <button className="lf-submit" type="submit" disabled={simulatingMail} style={{ marginTop: 18 }}>
                    {simulatingMail ? (
                      <><Loader2 size={16} className="spin" /> DeepSeek Extracting Metadata & Drafting Reply...</>
                    ) : (
                      <><Bot size={16} /> Process & View In Dashboard</>
                    )}
                  </button>
                </form>
              </div>
            )}
          </>
        )}

        {/* ANALYTICS VIEW */}
        {view === "analytics" && (
          <>
            <div className="lf-hero">
              <h1 className="lf-display">Harvest Analytics</h1>
              <p>Performance insights and deliverability statistics across all your SpiceCoast search sessions.</p>
            </div>

            <div className="lf-summary-row">
              <div className="lf-stat"><div className="lf-stat-label">Total Leads Harvested</div><div className="lf-stat-value gold lf-mono">{allLeads.length}</div></div>
              <div className="lf-stat"><div className="lf-stat-label">Deliverable Emails</div><div className="lf-stat-value green lf-mono">{allLeads.filter(l => l.emailStatus === "deliverable" || l.emailStatus === "valid").length}</div></div>
              <div className="lf-stat"><div className="lf-stat-label">Outbound Drafts</div><div className="lf-stat-value gold lf-mono">{outreachList.length}</div></div>
              <div className="lf-stat"><div className="lf-stat-label">Inbound Inquiries</div><div className="lf-stat-value green lf-mono">{mailboxMessages.length}</div></div>
            </div>

            <div className="lf-analytics-grid">
              <div className="lf-panel">
                <h3>Email Deliverability Breakdown</h3>
                {allLeads.length === 0 ? (
                  <div className="lf-empty" style={{ padding: "30px 0" }}><p>No data yet — run a search first.</p></div>
                ) : (
                  <div style={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3c3324" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: "#b3a892", fontSize: 12 }} axisLine={{ stroke: "#3c3324" }} tickLine={false} />
                        <YAxis tick={{ fill: "#b3a892", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: "#211c15", border: "1px solid #3c3324", borderRadius: 8, fontSize: 12.5 }} labelStyle={{ color: "#f3ecdd" }} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {chartData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="lf-panel">
                <h3>Recent Search Queries</h3>
                {searchHistory.length === 0 ? (
                  <div className="lf-empty" style={{ padding: "30px 0" }}><p>Your search history will appear here.</p></div>
                ) : (
                  <div>
                    {searchHistory.slice(0, 8).map((h) => (
                      <div
                        className="lf-search-history-item"
                        key={h.id}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border-soft)", fontSize: "13px", cursor: "pointer" }}
                        onClick={() => {
                          const parts = h.query.split(" · ");
                          if (parts[0]) setBusinessType(parts[0]);
                          if (parts[1]) {
                            const loc = parts[1].split(", ");
                            if (loc[0]) setCity(loc[0]);
                            if (loc[1]) setCountry(loc[1]);
                          }
                          setView("search");
                        }}
                      >
                        <span style={{ color: "var(--text)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}><Search size={12} color="var(--turmeric)" /> {h.query}</span>
                        <span style={{ color: "var(--text-faint)", fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }}>{h.count} leads · {new Date(h.date).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* COLD EMAIL REVIEW & CONFIRMATION MODAL */}
      {activeColdMailModal && (
        <div className="lf-modal-backdrop" onClick={() => setActiveColdMailModal(null)}>
          <div className="lf-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="lf-modal-header">
              <div>
                <div className="lf-modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles size={18} color="var(--turmeric)" />
                  Review Cold Email Draft
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  To: <strong>{activeColdMailModal.company}</strong> &lt;{activeColdMailModal.recipient}&gt;
                </div>
              </div>
              <button className="lf-modal-close" onClick={() => setActiveColdMailModal(null)}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Subject Line
              </label>
              <input
                className="lf-input"
                value={editingSubject}
                onChange={(e) => setEditingSubject(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Personalized Email Body (Editable)
              </label>
              <textarea
                className="lf-textarea"
                style={{ minHeight: 220 }}
                value={editingBody}
                onChange={(e) => setEditingBody(e.target.value)}
              />
            </div>

            {/* Confirmation Box when clicked */}
            {confirmSendId && (
              <div style={{ background: "rgba(227, 162, 46, 0.12)", border: "1px solid var(--turmeric)", borderRadius: 10, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--turmeric)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <ShieldCheck size={16} /> Confirmation Required
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text)" }}>
                  Are you sure you want to dispatch this email to <strong>{activeColdMailModal.recipient}</strong> from <code>{mailboxStatus.mailbox}</code>?
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    className="lf-action-btn gold"
                    style={{ fontSize: 12 }}
                    disabled={sendingMsgId === activeColdMailModal.leadId}
                    onClick={handleConfirmAndSendColdMail}
                  >
                    {sendingMsgId === activeColdMailModal.leadId ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
                    <span>Yes, Dispatch Email Now</span>
                  </button>
                  <button
                    className="lf-action-btn"
                    style={{ fontSize: 12 }}
                    onClick={() => setConfirmSendId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <button className="lf-action-btn" onClick={handleSaveDraftChanges}>
                <Check size={13} /> Save Edits
              </button>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="lf-action-btn"
                  onClick={() => copyToClipboard(`${editingSubject}\n\n${editingBody}`, "modal-copy")}
                >
                  {copiedId === "modal-copy" ? <Check size={13} color="var(--cardamom)" /> : <Copy size={13} />}
                  <span>{copiedId === "modal-copy" ? "Copied" : "Copy to Clipboard"}</span>
                </button>

                {activeColdMailModal.status !== "sent" && !confirmSendId && (
                  <button
                    className="lf-action-btn gold"
                    onClick={() => setConfirmSendId(activeColdMailModal.leadId)}
                  >
                    <Send size={13} />
                    <span>Send Email (Requires Confirmation)</span>
                  </button>
                )}

                {activeColdMailModal.status === "sent" && (
                  <span className="lf-badge green" style={{ padding: "6px 12px" }}>
                    <CheckCircle2 size={13} /> Email Dispatched
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
