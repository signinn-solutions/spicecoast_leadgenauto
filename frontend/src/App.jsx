import React, { useState, useEffect, useCallback } from "react";
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

export default function LeadFinderApp() {
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

  // Today Date & Remaining calculation
  const todayStr = new Date().toISOString().slice(0, 10);
  const remainingLeads =
    leadUsage.date === todayStr
      ? Math.max(0, (leadUsage.limit || 50) - leadUsage.count)
      : leadUsage.limit || 50;

  // Primary Data Fetch
  const fetchAllData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      const [statusRes, leadsRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/leads"),
      ]);

      if (statusRes.ok && leadsRes.ok) {
        const [statusData, leadsData] = await Promise.all([
          statusRes.json(),
          leadsRes.json(),
        ]);
        setServerOnline(true);
        setServerStatus(statusData);
        setLeadUsage({
          date: statusData.date,
          count: statusData.count,
          limit: statusData.limit,
        });
        setAllLeads(leadsData.all_leads || []);
        setSearchHistory(leadsData.search_history || []);
      }

      // Fetch mailbox & outreach
      try {
        const [mStatusRes, mMsgsRes, outreachRes] = await Promise.all([
          fetch("/api/mailbox/status"),
          fetch("/api/mailbox/messages"),
          fetch("/api/mailbox/outreach"),
        ]);
        if (mStatusRes.ok) setMailboxStatus(await mStatusRes.json());
        if (mMsgsRes.ok) {
          const msgs = await mMsgsRes.json();
          setMailboxMessages(msgs.messages || []);
        }
        if (outreachRes.ok) {
          const oData = await outreachRes.json();
          setOutreachList(oData.outreach || []);
        }
      } catch (err) {
        console.warn("Mailbox fetch error:", err);
      }
    } catch (e) {
      setServerOnline(false);
      if (!isSilent) {
        setNotice({
          type: "error",
          title: "Connection Error",
          text: "Unable to communicate with the SpiceCoast automation API.",
        });
      }
    } finally {
      setLoading(false);
      if (!isSilent) setIsRefreshing(false);
    }
  }, []);

  // Mount effect
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Real-time silent polling every 4 seconds for webhook updates
  useEffect(() => {
    const timer = setInterval(() => {
      Promise.all([
        fetch("/api/mailbox/messages").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/mailbox/outreach").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/mailbox/status").then((r) => (r.ok ? r.json() : null)),
      ])
        .then(([msgsData, outreachData, statusData]) => {
          if (msgsData?.messages) setMailboxMessages(msgsData.messages);
          if (outreachData?.outreach) setOutreachList(outreachData.outreach);
          if (statusData) setMailboxStatus(statusData);
        })
        .catch(() => {});
    }, 4000);

    return () => clearInterval(timer);
  }, []);

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
    if (count > remainingLeads && searchMode !== "simulated") {
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

        // Update lead in memory
        lead.coldMailDraft = draft;
        setAllLeads((prev) =>
          prev.map((l) => (l.id === lead.id ? { ...l, coldMailDraft: draft } : l))
        );
        setCurrentResults((prev) =>
          prev.map((l) => (l.id === lead.id ? { ...l, coldMailDraft: draft } : l))
        );

        if (selectedLead && selectedLead.id === lead.id) {
          setSelectedLead({ ...lead, coldMailDraft: draft });
        }

        setNotice({
          type: "success",
          title: "Pitch Synthesized",
          text: `DeepSeek synthesized proposal for ${lead.name}.`,
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
          text: `Inquiry from ${payload.from_name} analyzed by DeepSeek.`,
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
    } catch {}
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
    const quote = (val) => `"${String(val ?? "").replaceAll('"', '""')}"`;
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
    if (item.source === "simulated") return false;
    const found = allLeads.find((l) => l.id === item.leadId);
    return found ? found.source !== "simulated" : true;
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
