import React, { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Header from "./components/Header.jsx";
import DashboardView from "./components/DashboardView.jsx";
import DiscoveryView from "./components/DiscoveryView.jsx";
import LeadsView from "./components/LeadsView.jsx";
import LeadDetailDrawer from "./components/LeadDetailDrawer.jsx";
import OutreachView from "./components/OutreachView.jsx";
import ColdMailModal from "./components/ColdMailModal.jsx";
import MailboxView from "./components/MailboxView.jsx";
import AnalyticsView from "./components/AnalyticsView.jsx";
import SystemHealthView from "./components/SystemHealthView.jsx";
import Toast from "./components/Toast.jsx";
import { Loader2 } from "lucide-react";
import { apiFetch as fetch } from './api.js';

export default function LeadFinderApp({ onLogout }) {
  // Navigation & Shell State
  const [activeView, setActiveView] = useState("dashboard"); // dashboard, search, results, outreach, mailbox, analytics, health
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Global Workspace State
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [serverOnline, setServerOnline] = useState(true);
  const [notice, setNotice] = useState(null);

  // Leads & Discovery State
  const [allLeads, setAllLeads] = useState([]);
  const [currentResults, setCurrentResults] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [leadUsage, setLeadUsage] = useState({ date: "", count: 0, limit: 50 });
  const [serverStatus, setServerStatus] = useState({});

  // Discovery Form State
  const [businessType, setBusinessType] = useState("Spice Importer & Wholesaler");
  const [city, setCity] = useState("Hamburg");
  const [country, setCountry] = useState("Germany");
  const [count, setCount] = useState(15);
  const [searchMode, setSearchMode] = useState("auto"); // auto, live, simulated
  const [searching, setSearching] = useState(false);
  const [lastSearchInfo, setLastSearchInfo] = useState(null);

  // Mailbox & Outreach State
  const [mailboxStatus, setMailboxStatus] = useState({
    mailbox: "sales@thespicecoast.com",
    auto_send: false,
    daily_limit: 30,
    used_today: 0,
    remaining_today: 30,
    has_deepseek_key: false,
    has_hostinger_token: false,
    has_webhook_token: false,
    deepseek_model: "deepseek-chat",
  });
  const [mailboxMessages, setMailboxMessages] = useState([]);
  const [outreachList, setOutreachList] = useState([]);

  // Active Modals & Drawers
  const [selectedLead, setSelectedLead] = useState(null);
  const [activeReviewDraft, setActiveReviewDraft] = useState(null);

  // Action Pending Spinners
  const [generatingDraftId, setGeneratingDraftId] = useState(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSendingPitchId, setIsSendingPitchId] = useState(null);
  const [isSendingReplyId, setIsSendingReplyId] = useState(null);
  const [isSimulatingInbound, setIsSimulatingInbound] = useState(false);
  const [isTogglingAutoSend, setIsTogglingAutoSend] = useState(false);
  const refreshPromiseRef = useRef(null);
  const lastFetchErrorRef = useRef(false);

  // The server returns today's usage in its own local date; avoid a UTC day rollover.
  const localNow = new Date();
  const todayStr = leadUsage.date || `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;
  const remainingLeads = Math.max(0, (leadUsage.limit ?? 50) - (leadUsage.count ?? 0));

  // Primary Data Fetch
  const fetchAllData = useCallback((isSilent = false) => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    if (!isSilent) setIsRefreshing(true);
    const request = (async () => {
      try {
        const urls = ["/api/status", "/api/leads", "/api/mailbox/status", "/api/mailbox/messages", "/api/mailbox/outreach"];
        const responses = await Promise.all(urls.map((url) => fetch(url, { signal: AbortSignal.timeout(10000) })));
        const failed = responses.find((response) => !response.ok);
        if (failed) throw new Error(`API returned HTTP ${failed.status}.`);
        const [statusData, leadsData, mailboxData, messagesData, outreachData] = await Promise.all(responses.map((response) => response.json()));
        setServerOnline(true);
        lastFetchErrorRef.current = false;
        setServerStatus(statusData);
        setLeadUsage({ date: statusData.date, count: statusData.count, limit: statusData.limit });
        setAllLeads(leadsData.all_leads || []);
        setSearchHistory(leadsData.search_history || []);
        setMailboxStatus(mailboxData);
        setMailboxMessages(messagesData.messages || []);
        setOutreachList(outreachData.outreach || []);
      } catch (error) {
        setServerOnline(false);
        if (!isSilent || !lastFetchErrorRef.current) {
          setNotice({ type: "error", title: "Connection Error", text: `Unable to refresh SpiceCoast data: ${error.message}` });
        }
        lastFetchErrorRef.current = true;
      } finally {
        setLoading(false);
        if (!isSilent) setIsRefreshing(false);
      }
    })();
    refreshPromiseRef.current = request;
    request.finally(() => { if (refreshPromiseRef.current === request) refreshPromiseRef.current = null; });
    return request;
  }, []);

  // Mount effect
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Poll after each request settles, so slow requests cannot stack up.
  useEffect(() => {
    let active = true;
    let timer;
    const poll = async () => {
      await fetchAllData(true);
      if (active) timer = setTimeout(poll, 4000);
    };
    timer = setTimeout(poll, 4000);
    return () => { active = false; clearTimeout(timer); };
  }, [fetchAllData]);

  // Lead Discovery Search Handler
  const handleSearch = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!businessType.trim() || !city.trim() || !country.trim()) {
      setNotice({
        type: "warning",
        title: "Incomplete Query",
        text: "Please provide a business niche, city, and country.",
      });
      return;
    }
    if (count > remainingLeads) {
      setNotice({
        type: "warning",
        title: "Daily Quota Exceeded",
        text: `Requested ${count} leads, but only ${remainingLeads} quota slots remain today.`,
      });
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
          count,
          mode: searchMode,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const leads = data.leads || [];
        if (data.usage) {
          setLeadUsage((prev) => ({
            ...prev,
            date: data.usage.date,
            count: data.usage.count,
          }));
        }

        // Deduplicate into allLeads
        const seenKeys = new Set();
        const newAll = [...leads, ...allLeads].filter((lead) => {
          const key =
            lead.id ||
            (lead.name ? lead.name.toLowerCase().replace(/[^a-z0-9]/g, "") : null);
          if (!key || seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });

        setAllLeads(newAll);
        setCurrentResults(leads);
        setLastSearchInfo({
          count: leads.length,
          duplicatesSkipped: data.duplicatesSkipped || 0,
          mode: data.mode,
        });

        // Accurate success notice (fixed copy-paste bug from legacy code!)
        setNotice({
          type: "success",
          title: "Discovery Complete",
          text: `Harvested ${leads.length} new unique lead(s) for ${city}, ${country}.`,
        });

        fetchAllData(true);
      } else {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Search operation failed.");
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Search Failed",
        text: err.message,
      });
    } finally {
      setSearching(false);
    }
  };

  // 1-Click Preset Discovery Launcher
  const handleQuickSearch = (niche, qCity, qCountry) => {
    setBusinessType(niche);
    setCity(qCity);
    setCountry(qCountry);
    setActiveView("search");
  };

  // 1-Click Re-run historical query
  const handleRerunSearch = (queryStr) => {
    const parts = queryStr.split(" · ");
    if (parts[0]) setBusinessType(parts[0]);
    if (parts[1]) {
      const loc = parts[1].split(", ");
      if (loc[0]) setCity(loc[0]);
      if (loc[1]) setCountry(loc[1]);
    }
    setActiveView("search");
  };

  // AI Cold Pitch Generation Handler
  const handleGeneratePitch = async (lead) => {
    if (!lead || !lead.email) {
      setNotice({
        type: "warning",
        title: "Missing Email",
        text: "Cannot generate outreach proposal without a verified executive email address.",
      });
      return;
    }

    setGeneratingDraftId(lead.id);
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
        const draft = data.draft;

        // Update lead in memory without mutating a React state object.
        setAllLeads((prev) =>
          prev.map((l) => (l.id === lead.id ? { ...l, coldMailDraft: draft } : l))
        );
        setCurrentResults((prev) =>
          prev.map((l) => (l.id === lead.id ? { ...l, coldMailDraft: draft } : l))
        );

        if (selectedLead && selectedLead.id === lead.id) {
          setSelectedLead((prev) => ({ ...prev, coldMailDraft: draft }));
        }

        setNotice({
          type: "success",
          title: "Draft Prepared",
          text: `Outreach draft prepared for ${lead.name}. Review it before sending.`,
        });

        fetchAllData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Could not synthesize cold proposal.");
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Synthesis Error",
        text: err.message,
      });
    } finally {
      setGeneratingDraftId(null);
    }
  };

  // Save Cold Mail Draft Changes
  const handleSaveDraft = async (leadId, subject, body) => {
    setIsSavingDraft(true);
    try {
      const res = await fetch("/api/mailbox/update-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `outreach-${leadId}`,
          subject,
          body,
        }),
      });

      if (res.ok) {
        // Update in memory
        setAllLeads((prev) =>
          prev.map((l) =>
            l.id === leadId
              ? {
                  ...l,
                  coldMailDraft: { ...l.coldMailDraft, subject, body },
                }
              : l
          )
        );
        setCurrentResults((prev) =>
          prev.map((l) =>
            l.id === leadId
              ? {
                  ...l,
                  coldMailDraft: { ...l.coldMailDraft, subject, body },
                }
              : l
          )
        );
        if (selectedLead && selectedLead.id === leadId) {
          setSelectedLead((prev) => ({
            ...prev,
            coldMailDraft: { ...prev.coldMailDraft, subject, body },
          }));
        }
        if (activeReviewDraft && activeReviewDraft.leadId === leadId) {
          setActiveReviewDraft((prev) => ({ ...prev, subject, body }));
        }

        setNotice({
          type: "success",
          title: "Draft Saved",
          text: "Cold outreach draft changes preserved in database.",
        });
        fetchAllData(true);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Could not update outreach draft.");
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Save Failed",
        text: err.message,
      });
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Send Cold Mail Dispatch Handler
  const handleSendPitch = async (leadId, toEmail, subject, body) => {
    setIsSendingPitchId(leadId);
    try {
      const res = await fetch("/api/mailbox/send-coldmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `outreach-${leadId}`,
          to: toEmail,
          subject,
          body,
        }),
      });

      if (res.ok) {
        const sentDate = new Date().toISOString().slice(0, 10);
        // Mark sent
        setAllLeads((prev) =>
          prev.map((l) =>
            l.id === leadId
              ? {
                  ...l,
                  coldMailDraft: { ...l.coldMailDraft, status: "sent", sentAt: sentDate },
                }
              : l
          )
        );
        setCurrentResults((prev) =>
          prev.map((l) =>
            l.id === leadId
              ? {
                  ...l,
                  coldMailDraft: { ...l.coldMailDraft, status: "sent", sentAt: sentDate },
                }
              : l
          )
        );
        if (selectedLead && selectedLead.id === leadId) {
          setSelectedLead((prev) => ({
            ...prev,
            coldMailDraft: { ...prev.coldMailDraft, status: "sent", sentAt: sentDate },
          }));
        }
        if (activeReviewDraft) {
          setActiveReviewDraft(null);
        }

        setNotice({
          type: "success",
          title: "Outreach Dispatched",
          text: `Email dispatched to ${toEmail} via Hostinger API.`,
        });

        fetchAllData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to dispatch email.");
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Dispatch Blocked",
        text: err.message,
      });
    } finally {
      setIsSendingPitchId(null);
    }
  };

  // Send Inbound Mailbox Reply
  const handleSendMailboxReply = async (msg) => {
    setIsSendingReplyId(msg.id);
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
          prev.map((m) =>
            m.id === msg.id
              ? { ...m, status: "sent", sentAt: new Date().toLocaleTimeString() }
              : m
          )
        );
        setNotice({
          type: "success",
          title: "Reply Dispatched",
          text: `Response sent to ${msg.sender}.`,
        });
        fetchAllData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to dispatch reply.");
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Reply Failed",
        text: err.message,
      });
    } finally {
      setIsSendingReplyId(null);
    }
  };

  // Inbound Webhook Simulator Handler
  const handleSimulateInbound = async (payload) => {
    setIsSimulatingInbound(true);
    try {
      const res = await fetch("/api/mailbox/test-incoming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setMailboxMessages((prev) => [data.message, ...prev]);
        }
        setNotice({
          type: "success",
          title: "Inbound Processed",
          text: `Test inquiry from ${payload.from_name || payload.from || "the sample sender"} was drafted.`,
        });
        fetchAllData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Simulation processing failed.");
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Simulation Error",
        text: err.message,
      });
    } finally {
      setIsSimulatingInbound(false);
    }
  };

  // Toggle Auto-Send Setting
  const handleToggleAutoSend = async () => {
    const nextState = !mailboxStatus.auto_send;
    setIsTogglingAutoSend(true);
    try {
      const res = await fetch("/api/mailbox/toggle-autosend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_send: nextState }),
      });

      if (res.ok) {
        setMailboxStatus((prev) => ({ ...prev, auto_send: nextState }));
        setNotice({
          type: "success",
          title: nextState ? "Auto-Send Activated" : "Review-First Mode",
          text: nextState
            ? "Autonomous dispatch enabled for inbound inquiries."
            : "All replies require operator confirmation before sending.",
        });
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Setting Error",
        text: "Could not update auto-send mode.",
      });
    } finally {
      setIsTogglingAutoSend(false);
    }
  };

  // Copy Webhook URL to clipboard
  const handleCopyWebhook = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice({
        type: "success",
        title: "URL Copied",
        text: "Inbound webhook endpoint copied to clipboard.",
      });
      return true;
    } catch {
      setNotice({ type: "error", title: "Copy Failed", text: "Could not copy the webhook URL. Copy it manually from this page." });
      return false;
    }
  };

  // Export CSV Handler
  const handleExportCSV = (leadsToExport = allLeads) => {
    if (!leadsToExport.length) return;
    const headers = [
      "Company Name",
      "Source",
      "Address",
      "Phone",
      "Phone Status",
      "Email",
      "Email Status",
      "Website",
      "Date Found",
    ];
    const rows = leadsToExport.map((l) => [
      l.name || "",
      l.source || "unknown",
      l.address || "",
      l.phone || "",
      l.source !== "simulated" ? l.phoneStatus || "" : "simulated",
      l.email || "",
      l.source !== "simulated" ? l.emailStatus || "" : "simulated",
      l.website || "",
      l.foundAt || "",
    ]);
    const quote = (val) => {
      const value = String(val ?? "");
      const safe = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) || /^[\u0000-\u001f]/u.test(value) ? `'${value}` : value;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = [headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spicecoast_leads_${todayStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);

    setNotice({
      type: "success",
      title: "CSV Exported",
      text: `Exported ${leadsToExport.length} lead record(s) to CSV.`,
    });
  };

  if (loading) {
    return (
      <div className="lf-loading-screen">
        <div className="lf-loading-card">
          <Loader2 size={32} className="spin text-amber" />
          <h2 className="lf-loading-title">Initializing SpiceCoast Lead Engine</h2>
          <p className="lf-loading-subtitle">
            Connecting to SQLite persistence & verifying API endpoints...
          </p>
        </div>
      </div>
    );
  }

  const isLiveOutreach = (item) => {
    if (item.source !== "live") return false;
    const found = allLeads.find((l) => l.id === item.leadId);
    return found?.source === "live";
  };

  const pendingOutreachCount = outreachList.filter(
    (o) => o.status === "pending_review" && isLiveOutreach(o)
  ).length;

  return (
    <div className="lf-app-shell">
      {/* Toast Notification */}
      <Toast notice={notice} onClose={() => setNotice(null)} />

      {/* Modern SaaS Sidebar */}
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        leadsCount={allLeads.length}
        pendingOutreachCount={pendingOutreachCount}
        inboxCount={mailboxMessages.length}
        serverOnline={serverOnline}
        leadUsage={leadUsage}
        replyUsage={{
          count: mailboxStatus.used_today || 0,
          limit: mailboxStatus.daily_limit || 30,
        }}
      />

      {/* Main Layout Area */}
      <div className={`lf-layout-wrap ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {/* Header */}
        <Header
          onLogout={onLogout}
          activeView={activeView}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onRefresh={() => fetchAllData(false)}
          isRefreshing={isRefreshing}
          mailboxStatus={mailboxStatus}
          onToggleAutoSend={handleToggleAutoSend}
          isTogglingAutoSend={isTogglingAutoSend}
          onCopyWebhook={handleCopyWebhook}
        />

        {/* View Router */}
        <main className="lf-main-content">
          {activeView === "dashboard" && (
            <DashboardView
              allLeads={allLeads}
              outreachList={outreachList}
              mailboxMessages={mailboxMessages}
              searchHistory={searchHistory}
              leadUsage={leadUsage}
              onNavigate={setActiveView}
              onSelectLead={setSelectedLead}
              onQuickSearch={handleQuickSearch}
            />
          )}

          {activeView === "search" && (
            <DiscoveryView
              businessType={businessType}
              setBusinessType={setBusinessType}
              city={city}
              setCity={setCity}
              country={country}
              setCountry={setCountry}
              count={count}
              setCount={setCount}
              searchMode={searchMode}
              setSearchMode={setSearchMode}
              searching={searching}
              onSearch={handleSearch}
              leadLimit={leadUsage.limit || 50}
              remainingLeads={remainingLeads}
              lastSearchInfo={lastSearchInfo}
              onViewResults={() => setActiveView("results")}
            />
          )}

          {activeView === "results" && (
            <LeadsView
              allLeads={allLeads}
              currentResults={currentResults}
              onSelectLead={setSelectedLead}
              onGeneratePitch={handleGeneratePitch}
              generatingDraftId={generatingDraftId}
              onExportCSV={handleExportCSV}
            />
          )}

          {activeView === "outreach" && (
            <OutreachView
              outreachList={outreachList}
              allLeads={allLeads}
              onOpenReviewModal={(item) =>
                setActiveReviewDraft({
                  leadId: item.leadId,
                  company: item.company || item.leadName,
                  recipient: item.recipient,
                  subject: item.subject,
                  body: item.body,
                  status: item.status,
                  source: isLiveOutreach(item) ? "live" : "simulated",
                })
              }
              onQuickSend={(item) =>
                handleSendPitch(item.leadId, item.recipient, item.subject, item.body)
              }
              isSendingId={isSendingPitchId}
              onRefresh={() => fetchAllData(false)}
            />
          )}

          {activeView === "mailbox" && (
            <MailboxView
              mailboxStatus={mailboxStatus}
              mailboxMessages={mailboxMessages}
              onRefresh={() => fetchAllData(false)}
              isRefreshing={isRefreshing}
              onSendReply={handleSendMailboxReply}
              isSendingReplyId={isSendingReplyId}
              onSimulateInbound={handleSimulateInbound}
              isSimulating={isSimulatingInbound}
            />
          )}

          {activeView === "analytics" && (
            <AnalyticsView
              allLeads={allLeads}
              outreachList={outreachList}
              mailboxMessages={mailboxMessages}
              searchHistory={searchHistory}
              onRerunSearch={handleRerunSearch}
            />
          )}

          {activeView === "health" && (
            <SystemHealthView
              serverStatus={serverStatus}
              mailboxStatus={mailboxStatus}
              allLeads={allLeads}
              outreachList={outreachList}
              mailboxMessages={mailboxMessages}
              onCopyWebhook={handleCopyWebhook}
            />
          )}
        </main>
      </div>

      {/* Slide-over Lead Detail Drawer */}
      {selectedLead && (
        <LeadDetailDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onGeneratePitch={handleGeneratePitch}
          isGeneratingPitch={generatingDraftId === selectedLead.id}
          onSaveDraft={handleSaveDraft}
          isSavingDraft={isSavingDraft}
          onSendPitch={handleSendPitch}
          isSendingPitch={isSendingPitchId === selectedLead.id}
          mailboxAddress={mailboxStatus.mailbox}
        />
      )}

      {/* Cold Mail Review Modal */}
      {activeReviewDraft && (
        <ColdMailModal
          modalData={activeReviewDraft}
          onClose={() => setActiveReviewDraft(null)}
          onSaveDraft={handleSaveDraft}
          isSavingDraft={isSavingDraft}
          onConfirmSend={handleSendPitch}
          isSending={isSendingPitchId === activeReviewDraft.leadId}
          mailboxAddress={mailboxStatus.mailbox}
        />
      )}
    </div>
  );
}
