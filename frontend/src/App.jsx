import React, { lazy, Suspense, useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search, BarChart3, List, Phone, Mail, Globe, CheckCircle, CheckCircle2, XCircle,
  AlertCircle, Loader2, MapPin, Tag, ChevronRight, Sprout, Download,
  RefreshCw, Filter, Sparkles, Database, ExternalLink, Send, Bot,
  Inbox, Copy, Check, Settings, ShieldCheck, ArrowUpRight, Zap,
  Edit3, Eye, FileText, Clock, Compass, Anchor, Package, UserCheck, Radio
} from "lucide-react";

const AnalyticsChart = lazy(() => import("./AnalyticsChart.jsx"));


const isLiveLead = (lead) => lead.source !== "simulated";
const isLiveOutreach = (item, leads) => item.source !== "simulated" && leads.find((lead) => lead.id === item.leadId)?.source !== "simulated";

const PhoneBadge = ({ status, simulated }) => {
  if (simulated) return <span className="lf-badge gold">Demo contact</span>;
  if (status === "valid") return <span className="lf-badge green"><CheckCircle2 size={12} /> Valid</span>;
  return <span className="lf-badge red"><XCircle size={12} /> Invalid</span>;
};

const EmailBadge = ({ status, simulated }) => {
  if (simulated) return <span className="lf-badge gold">Demo email</span>;
  if (status === "deliverable" || status === "valid") return <span className="lf-badge green"><CheckCircle2 size={12} /> Deliverable</span>;
  if (status === "risky" || status === "accept_all") return <span className="lf-badge gold"><AlertCircle size={12} /> Risky</span>;
  return <span className="lf-badge red"><XCircle size={12} /> Not found</span>;
};

export default function LeadFinderApp() {
  const [view, setView] = useState("dashboard"); // dashboard | search | results | outreach | mailbox | analytics
  const [mailboxSubTab, setMailboxSubTab] = useState("inbound"); // inbound | outreach | simulate
  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [filterMode, setFilterMode] = useState("all"); // all, emails, phones, both
  const [searchMode, setSearchMode] = useState("auto"); // auto, live, simulated

  const [businessType, setBusinessType] = useState("spice importer");
  const [city, setCity] = useState("Hamburg");
  const [country, setCountry] = useState("Germany");
  const [count, setCount] = useState(15);

  const [usage, setUsage] = useState({ date: "", count: 0 });
  const [leadLimit, setLeadLimit] = useState(50);
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
  const modalRef = useRef(null);
  const [editingSubject, setEditingSubject] = useState("");
  const [editingBody, setEditingBody] = useState("");
  const [generatingDraftForLeadId, setGeneratingDraftForLeadId] = useState(null);
  const [confirmSendId, setConfirmSendId] = useState(null);
  const [lastSearchInfo, setLastSearchInfo] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const remaining = usage.date === today ? Math.max(0, leadLimit - usage.count) : leadLimit;

  // Load all initial data
  const fetchAllData = useCallback(async () => {
    try {
      const [statusRes, leadsRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/leads"),
      ]);
      if (!statusRes.ok || !leadsRes.ok) throw new Error("Could not load lead data from the API.");
      const [statusData, leadsData] = await Promise.all([statusRes.json(), leadsRes.json()]);
      setServerOnline(true);
      setUsage({ date: statusData.date, count: statusData.count });
      setLeadLimit(statusData.limit);
      setAllLeads(leadsData.all_leads || []);
      setSearchHistory(leadsData.search_history || []);
      setCurrentResults((previous) => previous.length ? previous : (leadsData.all_leads || []));

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

    } catch (e) {
      setServerOnline(false);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const modalOpen = Boolean(activeColdMailModal);
  useEffect(() => {
    if (!modalOpen) return;
    const previousFocus = document.activeElement;
    modalRef.current?.querySelector('input')?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveColdMailModal(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...(modalRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]') || [])];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [modalOpen]);

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
      setError(`Only ${remaining} leads remain in today's daily limit of ${leadLimit}.`);
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
        if (data.usage) {
          setUsage(data.usage);
        }

        const seenLeadKeys = new Set();
        const newAllLeads = [...leads, ...allLeads].filter((lead) => {
          const key = lead.id || (lead.name ? lead.name.toLowerCase().replace(/[^a-z0-9]/g, '') : null);
          if (!key || seenLeadKeys.has(key)) return false;
          seenLeadKeys.add(key);
          return true;
        });

        setAllLeads(newAllLeads);
        setCurrentResults(leads);
        setLastSearchInfo({
          count: leads.length,
          duplicatesSkipped: data.duplicatesSkipped || 0,
          mode: data.mode,
        });

        // Refresh saved lead and outreach history from the API.
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
        source: lead.source,
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
      const response = await fetch("/api/mailbox/update-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `outreach-${activeColdMailModal.leadId}`,
          subject: editingSubject,
          body: editingBody,
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not save draft.");

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
      setError(e.message);
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
      } else {
        throw new Error((await res.json().catch(() => ({}))).error || "Could not send outreach email.");
      }
    } catch (err) {
      setError(err.message);
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
      const hasDeliverableEmail = isLiveLead(lead) && (lead.emailStatus === "deliverable" || lead.emailStatus === "valid");
      const hasValidPhone = isLiveLead(lead) && lead.phoneStatus === "valid";
      if (filterMode === "emails") return hasDeliverableEmail;
      if (filterMode === "phones") return hasValidPhone;
      if (filterMode === "both") return hasDeliverableEmail && hasValidPhone;
      return true;
    });
  }, [currentResults, filterMode]);

  const summary = useMemo(() => {
    const total = currentResults.length;
    const validEmails = currentResults.filter((l) => isLiveLead(l) && (l.emailStatus === "deliverable" || l.emailStatus === "valid")).length;
    const validPhones = currentResults.filter((l) => isLiveLead(l) && l.phoneStatus === "valid").length;
    const bothValid = currentResults.filter(
      (l) => isLiveLead(l) && (l.emailStatus === "deliverable" || l.emailStatus === "valid") && l.phoneStatus === "valid"
    ).length;
    return { total, validEmails, validPhones, bothValid };
  }, [currentResults]);

  const chartData = useMemo(() => {
    const liveLeads = allLeads.filter(isLiveLead);
    const deliverable = liveLeads.filter((l) => l.emailStatus === "deliverable" || l.emailStatus === "valid").length;
    const risky = liveLeads.filter((l) => l.emailStatus === "risky" || l.emailStatus === "accept_all").length;
    const notFound = liveLeads.filter((l) => l.emailStatus === "not_found" || l.emailStatus === "invalid").length;
    return [
      { name: "Deliverable", value: deliverable, color: "var(--cardamom)" },
      { name: "Risky / Accept All", value: risky, color: "var(--turmeric)" },
      { name: "Not Found", value: notFound, color: "var(--paprika)" },
      { name: "Simulation", value: allLeads.length - liveLeads.length, color: "var(--text-faint)" },
    ];
  }, [allLeads]);

  const exportCSV = () => {
    if (filteredResults.length === 0) return;
    const headers = ["Company Name", "Source", "Address", "Phone", "Phone Status", "Email", "Email Status", "Website", "Date Found"];
    const rows = filteredResults.map((lead) => [
      lead.name, lead.source || "unknown", lead.address, lead.phone,
      isLiveLead(lead) ? lead.phoneStatus : "simulated",
      lead.email, isLiveLead(lead) ? lead.emailStatus : "simulated",
      lead.website, lead.foundAt,
    ]);
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `spicecoast_leads_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (loading) {
    return (
      <div className="lf-root">
        <div className="lf-loading"><Loader2 size={24} className="spin" /> Initializing SpiceCoast Automation...</div>
      </div>
    );
  }

  return (
    <div className="lf-root">

      <aside className="lf-nav" aria-label="Workspace navigation">
        <div className="lf-brand">
          <div className="lf-brand-mark"><Sprout size={20} /></div>
          <div>
            <div className="lf-brand-name lf-display">SpiceCoast</div>
            <div className="lf-brand-sub">Lead workspace</div>
          </div>
        </div>

        <div className="lf-tabs" aria-label="Main navigation">
          <button aria-current={view === "dashboard" ? "page" : undefined} className={`lf-tab ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>
            <Compass size={16} /> Overview
          </button>
          <button aria-current={view === "search" ? "page" : undefined} className={`lf-tab ${view === "search" ? "active" : ""}`} onClick={() => setView("search")}>
            <Search size={16} /> Discovery
          </button>
          <button aria-current={view === "results" ? "page" : undefined} className={`lf-tab ${view === "results" ? "active" : ""}`} onClick={() => setView("results")}>
            <List size={16} /> Leads {currentResults.length > 0 && <span className="lf-nav-count">{currentResults.length}</span>}
          </button>
          <button aria-current={view === "outreach" ? "page" : undefined} className={`lf-tab ${view === "outreach" ? "active" : ""}`} onClick={() => { setMailboxSubTab("outreach"); setView("outreach"); }}>
            <Send size={16} /> Outreach {outreachList.filter(o => o.status === "pending_review" && isLiveOutreach(o, allLeads)).length > 0 && <span className="lf-nav-count">{outreachList.filter(o => o.status === "pending_review" && isLiveOutreach(o, allLeads)).length}</span>}
          </button>
          <button aria-current={view === "mailbox" ? "page" : undefined} className={`lf-tab ${view === "mailbox" ? "active" : ""}`} onClick={() => { setMailboxSubTab("inbound"); setView("mailbox"); }}>
            <Mail size={16} /> Mailbox {mailboxMessages.length > 0 && <span className="lf-nav-count">{mailboxMessages.length}</span>}
          </button>
          <button aria-current={view === "analytics" ? "page" : undefined} className={`lf-tab ${view === "analytics" ? "active" : ""}`} onClick={() => setView("analytics")}>
            <BarChart3 size={16} /> Analytics
          </button>
        </div>

        <div className="lf-nav-right">
          <div className={`lf-live-indicator ${serverOnline ? "" : "offline"}`} title={serverOnline ? "API server reachable" : "API server unavailable"}>
            <span className="lf-live-dot"></span>
            <span>{serverOnline ? "API online" : "API offline"}</span>
          </div>

          <div className="lf-budget" title={`Daily lead limit resets at midnight. Max ${leadLimit}/day.`}>
            <span className="lf-budget-label">Leads</span>
            <span className="lf-budget-count">{Math.max(0, usage.date === today ? usage.count : 0)}/{leadLimit}</span>
          </div>
          <div className="lf-budget" title={`Daily AI replies quota.`}>
            <span className="lf-budget-label">Replies</span>
            <span className="lf-budget-count" style={{ color: "var(--turmeric)" }}>{mailboxStatus.used_today}/{mailboxStatus.daily_limit}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="lf-main" id="main-content">
        {error && (
          <div role="alert" style={{ background: "var(--paprika-soft)", border: "1px solid var(--paprika)", color: "#f87171", padding: "14px 18px", borderRadius: 12, marginBottom: 24, fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {view === "dashboard" && (
          <>
            <div className="lf-hero lf-dashboard-hero">
              <div>
                <span className="lf-eyebrow">Workspace overview</span>
                <h1>Find the right buyers. Move the conversation forward.</h1>
                <p>Discover businesses, review verified contacts and drafts, then manage replies from one workspace.</p>
              </div>
              <button className="lf-action-btn gold" onClick={() => setView("search")}><Search size={16} /> Start discovery <ChevronRight size={16} /></button>
            </div>
            <div className="lf-summary-row" aria-label="Workspace metrics">
              <div className="lf-stat"><div className="lf-stat-label">Live leads</div><div className="lf-stat-value lf-mono">{allLeads.filter(isLiveLead).length}</div></div>
              <div className="lf-stat"><div className="lf-stat-label">Deliverable email</div><div className="lf-stat-value green lf-mono">{allLeads.filter(l => isLiveLead(l) && (l.emailStatus === "deliverable" || l.emailStatus === "valid")).length}</div></div>
              <div className="lf-stat"><div className="lf-stat-label">Live drafts pending</div><div className="lf-stat-value gold lf-mono">{outreachList.filter(o => o.status === "pending_review" && isLiveOutreach(o, allLeads)).length}</div></div>
              <div className="lf-stat"><div className="lf-stat-label">Inbound messages</div><div className="lf-stat-value lf-mono">{mailboxMessages.length}</div></div>
            </div>
            <div className="lf-dashboard-grid">
              <section className="lf-panel">
                <h2>Continue your workflow</h2>
                <div className="lf-workflow-list">
                  <button onClick={() => setView("search")}><span className="lf-step-icon"><Search size={18} /></span><span><strong>Discover businesses</strong><small>Search by industry and location</small></span><ChevronRight size={17} /></button>
                  <button onClick={() => setView("results")}><span className="lf-step-icon"><List size={18} /></span><span><strong>Review leads</strong><small>Filter contacts and export the current batch</small></span><ChevronRight size={17} /></button>
                  <button onClick={() => { setMailboxSubTab("outreach"); setView("outreach"); }}><span className="lf-step-icon"><Send size={18} /></span><span><strong>Review outreach</strong><small>Edit and approve generated drafts</small></span><ChevronRight size={17} /></button>
                  <button onClick={() => { setMailboxSubTab("inbound"); setView("mailbox"); }}><span className="lf-step-icon"><Inbox size={18} /></span><span><strong>Handle replies</strong><small>Inspect inbound messages and draft responses</small></span><ChevronRight size={17} /></button>
                </div>
              </section>
              <section className="lf-panel">
                <h2>Recent searches</h2>
                {searchHistory.length === 0 ? <p className="lf-dashboard-empty">Your completed searches will appear here.</p> : searchHistory.slice(0, 5).map(h => (
                  <button className="lf-recent-search" key={h.id} onClick={() => setView("analytics")}>
                    <span><Search size={15} /><strong>{h.query}</strong></span><small>{h.count} leads · {new Date(h.date).toLocaleDateString()}</small>
                  </button>
                ))}
              </section>
            </div>
          </>
        )}

        {/* SEARCH VIEW */}
        {view === "search" && (
          <>
            <div className="lf-hero">
              <h1 className="lf-display">Discover businesses</h1>
              <p>Search by business type and location. Review verified contact details and generated outreach drafts after the search finishes.</p>
            </div>

            <div className="lf-card">
              <form onSubmit={handleSearch}>
                <div className="lf-form-grid">
                  <div className="lf-field">
                    <label htmlFor="business-type"><Tag size={12} /> Business type</label>
                    <input id="business-type" className="lf-input" placeholder="e.g. spice importer, food distributor" value={businessType} onChange={(e) => setBusinessType(e.target.value)} required />
                  </div>
                  <div className="lf-field">
                    <label htmlFor="search-city"><MapPin size={12} /> City</label>
                    <input id="search-city" className="lf-input" placeholder="e.g. Hamburg, Dubai, Kochi" value={city} onChange={(e) => setCity(e.target.value)} required />
                  </div>
                  <div className="lf-field">
                    <label htmlFor="search-country"><Globe size={12} /> Country</label>
                    <input id="search-country" className="lf-input" placeholder="e.g. Germany, UAE, India" value={country} onChange={(e) => setCountry(e.target.value)} required />
                  </div>
                  <div className="lf-field">
                    <label htmlFor="search-count">Number to find (max 50)</label>
                    <input
                      id="search-count"
                      className="lf-input" type="number" min={1} max={50}
                      value={count} onChange={(e) => setCount(parseInt(e.target.value || "0", 10))}
                    />
                  </div>

                  <div className="lf-field span-2">
                    <label><Sparkles size={12} /> Search Mode</label>
                    <div className="lf-mode-selector">
                      <button type="button" aria-pressed={searchMode === "auto"} className={`lf-mode-chip ${searchMode === "auto" ? "active" : ""}`} onClick={() => setSearchMode("auto")}>
                        <Database size={13} /> Auto (Live API + Fallback)
                      </button>
                      <button type="button" aria-pressed={searchMode === "live"} className={`lf-mode-chip ${searchMode === "live" ? "active" : ""}`} onClick={() => setSearchMode("live")}>
                        <Globe size={13} /> Live Places & Hunter.io
                      </button>
                      <button type="button" aria-pressed={searchMode === "simulated"} className={`lf-mode-chip ${searchMode === "simulated" ? "active" : ""}`} onClick={() => setSearchMode("simulated")}>
                        <Sparkles size={13} /> Simulated test data (no API credits)
                      </button>
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
              <h1 className="lf-display">Review leads</h1>
              <p>Filter the latest search, inspect contact verification, export a CSV, or open a draft for review.</p>
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
                  <div className="lf-stat"><div className="lf-stat-label">Records shown</div><div className="lf-stat-value lf-mono">{summary.total}</div></div>
                  <div className="lf-stat"><div className="lf-stat-label">Deliverable Email</div><div className="lf-stat-value green lf-mono">{summary.validEmails}</div></div>
                  <div className="lf-stat"><div className="lf-stat-label">Valid Phone</div><div className="lf-stat-value green lf-mono">{summary.validPhones}</div></div>
                  <div className="lf-stat"><div className="lf-stat-label">Live drafts ready</div><div className="lf-stat-value gold lf-mono">{currentResults.filter(l => isLiveLead(l) && l.coldMailDraft?.status === "pending_review").length}</div></div>
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
                <p>{currentResults.length === 0 ? "No results yet. Run a discovery search to build your first lead list." : "No leads match the selected filter."}</p>
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
                        <div className="lf-company-name">{lead.name} {lead.source === "simulated" && <span className="lf-badge gold">Simulation</span>}</div>
                        <div className="lf-company-addr"><MapPin size={11} /> {lead.address}</div>
                      </div>
                      <div>
                        <PhoneBadge status={lead.phoneStatus} simulated={!isLiveLead(lead)} />
                        <span className="lf-badge-sub">{lead.phone}</span>
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <EmailBadge status={lead.emailStatus} simulated={!isLiveLead(lead)} />
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
        {(view === "mailbox" || view === "outreach") && (
          <>
            <div className="lf-hero">
              <h1 className="lf-display">{view === "outreach" ? "Outreach drafts" : "Mailbox"}</h1>
              <p>{view === "outreach" ? "Review personalized cold email drafts and approve sending when the contact and copy are ready." : "Review inbound inquiries, extracted details, and drafted replies. Test the inbound flow from the simulator."}</p>
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
                  onClick={() => copyToClipboard(`${window.location.origin}/webhook`, "webhook-url")}
                >
                  {copiedId === "webhook-url" ? <Check size={12} color="var(--cardamom)" /> : <Copy size={12} />}
                  <span>Copy Webhook URL</span>
                </button>
              </div>
            </div>

            {/* Subtab Navigation for Mailbox */}
            {view === "mailbox" && <div className="lf-subtab-bar">
              <button
                className={`lf-subtab-btn ${mailboxSubTab === "inbound" ? "active" : ""}`}
                onClick={() => setMailboxSubTab("inbound")}
              >
                <Inbox size={14} /> Inbound Webhook Inquiries ({mailboxMessages.length})
              </button>
              <button
                className={`lf-subtab-btn ${mailboxSubTab === "simulate" ? "active" : ""}`}
                onClick={() => setMailboxSubTab("simulate")}
              >
                <Sparkles size={14} /> Test Webhook Simulator
              </button>
            </div>}

            {/* SUBTAB 1: INBOUND INQUIRIES & REPLIES (WITH SENDER, RECEIVER & MAIN DATA) */}
            {view === "mailbox" && mailboxSubTab === "inbound" && (
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
            {view === "outreach" && (
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
                            {!isLiveOutreach(item, allLeads) && <span className="lf-badge gold">Simulation · sending unavailable</span>}
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
                                source: isLiveOutreach(item, allLeads) ? "live" : "simulated",
                              });
                              setEditingSubject(item.subject);
                              setEditingBody(item.body);
                              setConfirmSendId(null);
                            }}
                          >
                            <Edit3 size={12} />
                            <span>Edit & Review</span>
                          </button>

                          {item.status !== "sent" && isLiveOutreach(item, allLeads) && (
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
                                  source: "live",
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
            {view === "mailbox" && mailboxSubTab === "simulate" && (
              <div className="lf-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Sparkles size={16} color="var(--turmeric)" /> Simulate Inbound Inquiry / Reply
                  </h3>
                  <span style={{ fontSize: "12px", color: "var(--text-faint)" }}>Uses local draft templates; no AI or mail delivery calls</span>
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
              <div className="lf-stat"><div className="lf-stat-label">Live leads</div><div className="lf-stat-value gold lf-mono">{allLeads.filter(isLiveLead).length}</div></div>
              <div className="lf-stat"><div className="lf-stat-label">Deliverable Emails</div><div className="lf-stat-value green lf-mono">{allLeads.filter(l => isLiveLead(l) && (l.emailStatus === "deliverable" || l.emailStatus === "valid")).length}</div></div>
              <div className="lf-stat"><div className="lf-stat-label">Live outreach drafts</div><div className="lf-stat-value gold lf-mono">{outreachList.filter(o => isLiveOutreach(o, allLeads)).length}</div></div>
              <div className="lf-stat"><div className="lf-stat-label">Inbound Inquiries</div><div className="lf-stat-value green lf-mono">{mailboxMessages.length}</div></div>
            </div>

            <div className="lf-analytics-grid">
              <div className="lf-panel">
                <h3>Email Deliverability Breakdown</h3>
                {allLeads.length === 0 ? (
                  <div className="lf-empty" style={{ padding: "30px 0" }}><p>No data yet — run a search first.</p></div>
                ) : (
                  <Suspense fallback={<div className="lf-loading" style={{ height: 220 }}>Loading chart…</div>}>
                    <AnalyticsChart data={chartData} />
                  </Suspense>
                )}
              </div>

              <div className="lf-panel">
                <h3>Recent Search Queries</h3>
                {searchHistory.length === 0 ? (
                  <div className="lf-empty" style={{ padding: "30px 0" }}><p>Your search history will appear here.</p></div>
                ) : (
                  <div>
                    {searchHistory.slice(0, 8).map((h) => (
                      <button
                        type="button"
                        className="lf-search-history-item"
                        key={h.id}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "12px 0", border: 0, borderBottom: "1px solid var(--border-soft)", background: "transparent", textAlign: "left", fontSize: "13px", cursor: "pointer" }}
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
                      </button>
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
          <div ref={modalRef} className="lf-modal-card" role="dialog" aria-modal="true" aria-labelledby="cold-mail-title" onClick={(e) => e.stopPropagation()}>
            <div className="lf-modal-header">
              <div>
                <div id="cold-mail-title" className="lf-modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles size={18} color="var(--turmeric)" />
                  Review Cold Email Draft
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  To: <strong>{activeColdMailModal.company}</strong> &lt;{activeColdMailModal.recipient}&gt;
                </div>
              </div>
              <button className="lf-modal-close" aria-label="Close email review" onClick={() => setActiveColdMailModal(null)}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="cold-mail-subject" style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Subject Line
              </label>
              <input
                id="cold-mail-subject"
                className="lf-input"
                value={editingSubject}
                onChange={(e) => setEditingSubject(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label htmlFor="cold-mail-body" style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Personalized Email Body (Editable)
              </label>
              <textarea
                id="cold-mail-body"
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

                {activeColdMailModal.status !== "sent" && activeColdMailModal.source !== "simulated" && !confirmSendId && (
                  <button
                    className="lf-action-btn gold"
                    onClick={() => setConfirmSendId(activeColdMailModal.leadId)}
                  >
                    <Send size={13} />
                    <span>Send Email (Requires Confirmation)</span>
                  </button>
                )}

                {activeColdMailModal.source === "simulated" && <span className="lf-badge gold">Simulation — sending unavailable</span>}

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
