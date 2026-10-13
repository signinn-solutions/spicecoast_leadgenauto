import { outreachBlockReason } from './outreachEligibility.js';
import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Header from "./components/Header.jsx";
const DashboardView = lazy(() => import("./components/DashboardView.jsx"));
const DiscoveryView = lazy(() => import("./components/DiscoveryView.jsx"));
const LeadsView = lazy(() => import("./components/LeadsView.jsx"));
const LeadDetailDrawer = lazy(() => import("./components/LeadDetailDrawer.jsx"));
const OutreachView = lazy(() => import("./components/OutreachView.jsx"));
const ColdMailModal = lazy(() => import("./components/ColdMailModal.jsx"));
const MailboxView = lazy(() => import("./components/MailboxView.jsx"));
const AnalyticsView = lazy(() => import("./components/AnalyticsView.jsx"));
const SuperadminView = lazy(() => import("./components/SuperadminView.jsx"));
import Toast from "./components/Toast.jsx";
import { Loader2 } from "lucide-react";
import { apiFetch as fetch } from './api.js';
import { createRequestCache, PAGE_RESOURCES, WORKSPACE_RESOURCES } from './requestCache.js';

export default function LeadFinderApp({ onLogout, currentUser = null }) {
  const isSuperadmin = currentUser?.role === "superadmin";

  // Navigation & Shell State
  const [activeView, setActiveView] = useState(() => (isSuperadmin ? "admin" : "dashboard"));
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (isSuperadmin) {
      if (activeView !== "admin") {
        setActiveView("admin");
      }
    } else {
      if (activeView === "admin" || activeView === "health") {
        setActiveView("dashboard");
      }
    }
  }, [isSuperadmin, activeView]);

  // Global Workspace State
  const [loading, setLoading] = useState(!isSuperadmin);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [serverOnline, setServerOnline] = useState(true);
  const [notice, setNotice] = useState(null);

  // Leads & Discovery State
  const [allLeads, setAllLeads] = useState([]);
  const [currentResults, setCurrentResults] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [leadUsage, setLeadUsage] = useState({ date: "", count: 0, limit: 200 });
  const [serverStatus, setServerStatus] = useState({});

  // Discovery Form State
  const [businessType, setBusinessType] = useState("Spice Importer & Wholesaler");
  const [city, setCity] = useState("Hamburg");
  const [country, setCountry] = useState("Germany");
  const [count, setCount] = useState(15);
  const [searching, setSearching] = useState(false);
  const [lastSearchInfo, setLastSearchInfo] = useState(null);
  const [discoveryEngine, setDiscoveryEngine] = useState("scraper");

  // Mailbox & Outreach State
  const [mailboxStatus, setMailboxStatus] = useState({
    mailbox: "sales@thespicecoast.com",
    auto_send: false,
    daily_limit: 30,
    used_today: 0,
    remaining_today: 30,
    has_groq_key: false,
    has_hostinger_token: false,
    has_webhook_token: false,
    groq_model: "openai/gpt-oss-120b",
  });
  const [mailboxMessages, setMailboxMessages] = useState([]);
  const [outreachList, setOutreachList] = useState([]);
  const [mailLifecycle, setMailLifecycle] = useState(null);

  // Active Modals & Drawers
  const [selectedLead, setSelectedLead] = useState(null);
  const [activeReviewDraft, setActiveReviewDraft] = useState(null);
  const [outreachQueueLeads, setOutreachQueueLeads] = useState([]);

  // Navigate selected leads to Outreach Studio
  const handleSendToOutreach = (selectedLeads) => {
    const eligible = selectedLeads.filter(lead => !outreachBlockReason(lead));
    const blocked = selectedLeads.filter(lead => outreachBlockReason(lead));
    if (blocked.length) setNotice({type:'warning',title:'Leads blocked from Outreach',text:blocked.map(lead => lead.name + ': ' + outreachBlockReason(lead)).join(' ')});
    if (!eligible.length) return;
    setOutreachQueueLeads(eligible);
    setActiveView("outreach");
  };

  // Action Pending Spinners
  const [generatingDraftId, setGeneratingDraftId] = useState(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSendingPitchId, setIsSendingPitchId] = useState(null);
  const [isSendingReplyId, setIsSendingReplyId] = useState(null);
  const [isSendingFollowUpId, setIsSendingFollowUpId] = useState(null);
  const [isSimulatingInbound, setIsSimulatingInbound] = useState(false);
  const [isTogglingAutoSend, setIsTogglingAutoSend] = useState(false);
  const [isTogglingHunter, setIsTogglingHunter] = useState(false);
  const [searchProgress, setSearchProgress] = useState(null);
  const requestCacheRef = useRef(null);
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  const refreshCountRef = useRef(0);
  const lastFetchErrorRef = useRef(false);
  const pageErrorsRef = useRef(new Map());

  // The server returns today's usage in its own local date; avoid a UTC day rollover.
  const localNow = new Date();
  const todayStr = leadUsage.date || `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;
  const remainingLeads = Math.max(0, (leadUsage.limit ?? 200) - (leadUsage.count ?? 0));

  if (!requestCacheRef.current) {
    requestCacheRef.current = createRequestCache(fetch, (url, data) => {
      if (url === WORKSPACE_RESOURCES.status) {
        setServerStatus(data);
        setDiscoveryEngine(data.hunter_enabled === true ? "hunter" : "scraper");
        setLeadUsage({ date: data.date, count: data.count, limit: data.limit });
      } else if (url === WORKSPACE_RESOURCES.leads) {
        setAllLeads(data.all_leads || []);
        setSearchHistory(data.search_history || []);
      } else if (url === WORKSPACE_RESOURCES.mailboxStatus) setMailboxStatus(data);
      else if (url === WORKSPACE_RESOURCES.messages) setMailboxMessages(data.messages || []);
      else if (url === WORKSPACE_RESOURCES.outreach) setOutreachList(data.outreach || []);
      else if (url === WORKSPACE_RESOURCES.lifecycle) setMailLifecycle(data);
    });
  }

  const loadPageData = useCallback(async ({ force = false, silent = false, resources } = {}) => {
    const page = activeViewRef.current;
    const names = resources || PAGE_RESOURCES[page] || [];
    if (!names.length) { setLoading(false); return; }
    if (!silent) { refreshCountRef.current += 1; setIsRefreshing(true); }
    try {
      await requestCacheRef.current.loadMany(names.map(name => WORKSPACE_RESOURCES[name]), { force });
      pageErrorsRef.current.delete(page);
      setServerOnline(true);
      lastFetchErrorRef.current = false;
    } catch (error) {
      pageErrorsRef.current.set(page, error.message);
      setServerOnline(false);
      if (!silent || !lastFetchErrorRef.current) {
        setNotice({ type: "error", title: "Connection Error", text: `Unable to load page data: ${error.message}` });
      }
      lastFetchErrorRef.current = true;
    } finally {
      setLoading(false);
      if (!silent) {
        refreshCountRef.current -= 1;
        setIsRefreshing(refreshCountRef.current > 0);
      }
    }
  }, []);

  const refreshAffected = useCallback((names, { reload = true } = {}) => {
    requestCacheRef.current.invalidate(names.map(name => WORKSPACE_RESOURCES[name]));
    const visible = (PAGE_RESOURCES[activeViewRef.current] || []).filter(name => names.includes(name));
    if (reload && visible.length) return loadPageData({ silent: true, resources: visible });
    return Promise.resolve();
  }, [loadPageData]);

  // Navigation and explicit actions trigger reads; idle/hidden pages do not poll.
  useEffect(() => {
    loadPageData();
  }, [activeView, loadPageData]);

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

    const applySearchSuccess = (data) => {
      const leads = data?.leads || [];
      if (data?.usage) {
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
        contactsMissing: data.contactsMissing || 0,
        warnings: data.warnings || [],
        mode: data.mode,
        query: { businessType, city, country, count },
      });

      if (leads.length > 0) {
        setNotice({
          type: "success",
          title: "Discovery Complete",
          text: `Harvested ${leads.length} new unique lead(s) for ${city}, ${country}.`,
        });
      } else {
        setNotice({
          type: "info",
          title: "No New Leads Discovered",
          text: data.duplicatesSkipped > 0
            ? `Found matching companies, but all ${data.duplicatesSkipped} already exist in your CRM.`
            : data.contactsMissing > 0
            ? `Found businesses, but ${data.contactsMissing} had no published phone or email. Try another buyer segment or location.`
            : `No matching B2B listings found for "${businessType}" in ${city}, ${country}. Try broader keywords or an alternative trade hub.`,
        });
      }

      refreshAffected(["status", "leads"]);
    };

    setSearching(true);
    setSearchProgress({
      current: 0,
      total: count,
      percent: 0,
      message: `Initiating discovery for ${businessType} in ${city}, ${country}...`,
      logs: [],
    });

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_type: businessType.trim(),
          city: city.trim(),
          country: country.trim(),
          count,
          mode: "live",
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Search operation failed.");
      }

      const initialData = await response.json();

      // If server returned an asynchronous job (HTTP 202 Accepted)
      if (initialData.jobId) {
        await new Promise((resolve, reject) => {
          let settled = false;
          let pollTimer = null;

          const finishSuccess = (result) => {
            if (settled) return;
            settled = true;
            if (pollTimer) clearTimeout(pollTimer);
            applySearchSuccess(result);
            resolve();
          };

          const finishError = (err) => {
            if (settled) return;
            settled = true;
            if (pollTimer) clearTimeout(pollTimer);
            reject(err);
          };

          // 1. Try real-time streaming via EventSource (SSE)
          let es = null;
          try {
            es = new EventSource(`/api/jobs/${initialData.jobId}/stream`);

            es.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                if (data.type === "progress" || data.type === "init") {
                  setSearchProgress((prev) => ({
                    ...prev,
                    ...data.progress,
                    logs: data.log
                      ? [...(prev?.logs || []).slice(-20), data.log]
                      : data.logs || prev?.logs || [],
                  }));
                } else if (data.type === "completed") {
                  es.close();
                  finishSuccess(data.result);
                } else if (data.type === "failed") {
                  es.close();
                  finishError(new Error(data.error || "Search failed"));
                }
              } catch (parseErr) {
                console.warn("[SSE parse error]", parseErr);
              }
            };

            es.onerror = () => {
              // On SSE error or proxy disconnect, fallback to polling
              if (es) {
                es.close();
                es = null;
              }
              startPolling();
            };
          } catch {
            startPolling();
          }

          // 2. Fallback polling mechanism if SSE closes or fails
          function startPolling() {
            if (settled || pollTimer) return;
            const poll = async () => {
              try {
                const response = await fetch(`/api/jobs/${initialData.jobId}`, { signal: AbortSignal.timeout(10000) });
                if (!response.ok) throw new Error("Job polling error");
                const jobData = await response.json();
                setSearchProgress((prev) => ({ ...prev, ...jobData.progress, logs: jobData.logs || prev?.logs || [] }));
                if (jobData.status === "completed") finishSuccess(jobData.result);
                else if (jobData.status === "failed") finishError(new Error(jobData.error || "Search failed"));
              } catch (error) {
                finishError(error);
              }
              if (!settled) pollTimer = setTimeout(poll, 1000);
            };
            pollTimer = setTimeout(poll, 1000);
          }

        });
      } else {
        // Direct synchronous response
        applySearchSuccess(initialData);
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Search Failed",
        text: err.message,
      });
    } finally {
      setSearching(false);
      setSearchProgress(null);
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
  const handleGeneratePitch = async (lead, { force = false, silent = false, onProgress } = {}) => {
    if (!lead || !lead.email) {
      if (!silent) {
        setNotice({
          type: "warning",
          title: "Missing Email",
          text: "Cannot generate outreach proposal without a verified executive email address.",
        });
      }
      return null;
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
          force,
          async: true,
          city: lead.city || city,
          country: lead.country || country,
          businessType: lead.businessType || businessType,
          address: lead.address,
        }),
      });

      if (res.ok) {
        let data = await res.json();
        if (res.status === 202 && data.jobId) {
          const jobId = data.jobId;
          const deadline = Date.now() + 10 * 60 * 1000;
          while (true) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const progressResponse = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { signal: AbortSignal.timeout(10000) });
            const progress = await progressResponse.json();
            onProgress?.(progress.progress?.message || "Preparing draft...");
            if (!progressResponse.ok) throw new Error(progress.error || 'Draft job could not be read.');
            if (progress.status === 'failed') throw new Error(progress.error || 'Draft generation failed.');
            if (progress.status === 'completed') { data = progress.result; break; }
            if (Date.now() > deadline) throw new Error('Draft is still queued. Refresh Outreach later to check for the saved draft.');
          }
        }
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

        if (!silent) {
          setNotice({
            type: draft?.source === "template_fallback" ? "warning" : "success",
            title: draft?.source === "template_fallback" ? "Template Fallback Draft" : "Draft Prepared",
            text: draft?.fallbackReason || `Outreach draft prepared for ${lead.name}. Review it before sending.`,
          });
        }

        refreshAffected(["leads", "outreach"], { reload: !silent });
        return { draft, outreachRecord: data.outreachRecord };
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Could not synthesize cold proposal.");
      }
    } catch (err) {
      if (!silent) {
        setNotice({
          type: "error",
          title: "Synthesis Error",
          text: err.message,
        });
      }
      throw err;
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
        refreshAffected(["leads", "outreach"]);
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
  const handleSendPitch = async (leadId, toEmail, subject, body, { silent = false } = {}) => {
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

        refreshAffected(["leads", "outreach", "lifecycle", "mailboxStatus"], { reload: false });
        if (!silent) {
          setNotice({
            type: "success",
            title: "Outreach Dispatched",
            text: `Email dispatched to ${toEmail} via Hostinger API.`,
          });
          refreshAffected(["leads", "outreach", "lifecycle", "mailboxStatus"]);
        }
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        if (!silent) {
          setNotice({
            type: "error",
            title: "Dispatch Blocked",
            text: err.error || "Failed to dispatch email.",
          });
        }
        return false;
      }
    } catch (err) {
      if (!silent) {
        setNotice({
          type: "error",
          title: "Dispatch Blocked",
          text: err.message,
        });
      }
      return false;
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
        refreshAffected(["messages", "lifecycle", "mailboxStatus"]);
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
        refreshAffected(["messages", "lifecycle", "mailboxStatus"]);
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

  // Dispatch Reviewed Follow-Up Email
  const handleSendFollowUp = async (leadId, { subject, body, to }) => {
    setIsSendingFollowUpId(leadId);
    try {
      const res = await fetch("/api/mailbox/send-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, subject, body, to }),
      });

      if (res.ok) {
        setNotice({
          type: "success",
          title: "Follow-Up Dispatched",
          text: `Follow-up email dispatched to ${to}.`,
        });
        refreshAffected(["leads", "outreach", "messages", "lifecycle", "mailboxStatus"]);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to dispatch follow-up.");
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Dispatch Failed",
        text: err.message,
      });
      return false;
    } finally {
      setIsSendingFollowUpId(null);
    }
  };

  // Update Follow-Up Draft Subject/Body
  const handleUpdateFollowUpDraft = async (leadId, { subject, body }) => {
    try {
      const res = await fetch("/api/mailbox/update-followup-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, subject, body }),
      });

      if (res.ok) {
        setNotice({
          type: "success",
          title: "Follow-Up Draft Saved",
          text: "Changes saved to follow-up draft.",
        });
        refreshAffected(["lifecycle"]);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save draft changes.");
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Save Failed",
        text: err.message,
      });
      return false;
    }
  };

  // Reopen Closed Lead
  const handleReopenLead = async (leadId) => {
    try {
      const res = await fetch("/api/mailbox/reopen-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });

      if (res.ok) {
        setNotice({
          type: "success",
          title: "Lead Reopened",
          text: "Lead has been restored and queued for follow-up.",
        });
        refreshAffected(["lifecycle", "leads"]);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to reopen lead.");
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Reopen Failed",
        text: err.message,
      });
      return false;
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
        refreshAffected(["mailboxStatus"], { reload: false });
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

  // Toggle Hunter.io API vs Inbuilt Mail Scraper
  const handleToggleHunter = async (targetState) => {
    const currentState = serverStatus.hunter_enabled !== false;
    const nextState = typeof targetState === "boolean" ? targetState : !currentState;
    setIsTogglingHunter(true);
    try {
      const res = await fetch("/api/settings/toggle-hunter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextState }),
      });

      if (res.ok) {
        const data = await res.json();
        setServerStatus((prev) => ({
          ...prev,
          hunter_enabled: data.hunter_enabled,
          use_inbuilt_scraper: data.use_inbuilt_scraper,
        }));
        setNotice({
          type: "success",
          title: nextState ? "Hunter.io API Enabled" : "Inbuilt Mail Scraper Active",
          text: nextState
            ? "External Hunter.io enrichment API is now active."
            : "Hunter API turned off. Lead discovery is now using the zero-cost inbuilt mail scraper & MX engine.",
        });
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to toggle email enrichment engine.");
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Setting Error",
        text: err.message || "Could not update email enrichment setting.",
      });
    } finally {
      setIsTogglingHunter(false);
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

  const pageHasData = requestCacheRef.current.hasLoaded(
    (PAGE_RESOURCES[activeView] || []).map(name => WORKSPACE_RESOURCES[name])
  );
  const pageError = pageErrorsRef.current.get(activeView);

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
        currentUser={currentUser}
        onLogout={onLogout}
      />

      {/* Main Layout Area */}
      <div className={`lf-layout-wrap ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {/* Header */}
        <Header
          onLogout={onLogout}
          activeView={activeView}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onRefresh={() => loadPageData({ force: true })}
          isRefreshing={isRefreshing}
          mailboxStatus={mailboxStatus}
          onToggleAutoSend={handleToggleAutoSend}
          isTogglingAutoSend={isTogglingAutoSend}
          onCopyWebhook={handleCopyWebhook}
          currentUser={currentUser}
        />

        {/* View Router */}
        <main className="lf-main-content">
          <Suspense fallback={<div className="lf-loading" role="status">Loading page...</div>}>
          {!pageHasData ? (
            pageError && !isRefreshing ? (
              <section className="lf-panel">
                <p role="alert">{pageError}</p>
                <button type="button" className="lf-btn-secondary" onClick={() => loadPageData({ force: true })}>Retry</button>
              </section>
            ) : <div className="lf-loading" role="status">Loading page data...</div>
          ) : <>
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
              searching={searching}
              searchProgress={searchProgress}
              onSearch={handleSearch}
              leadLimit={leadUsage.limit || 200}
              remainingLeads={remainingLeads}
              lastSearchInfo={lastSearchInfo}
              onViewResults={() => setActiveView("results")}
              discoveryEngine={discoveryEngine}
              onToggleEngine={(mode) => handleToggleHunter(mode === "hunter")}
              isTogglingHunter={isTogglingHunter}
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
              onSendToOutreach={handleSendToOutreach}
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
              onQuickSend={(item, options) =>
                handleSendPitch(
                  item.leadId || item.lead?.id || (item.id || "").replace(/^outreach-/, "").replace(/^queue-/, ""),
                  item.recipient,
                  item.subject,
                  item.body,
                  options
                )
              }
              isSendingId={isSendingPitchId}
              onRefresh={() => loadPageData({ resources: ["leads", "outreach"] })}
              queueLeads={outreachQueueLeads}
              onClearQueue={() => setOutreachQueueLeads([])}
              onGeneratePitch={handleGeneratePitch}
              onSaveDraft={handleSaveDraft}
            />
          )}

          {activeView === "mailbox" && (
            <MailboxView
              mailboxStatus={mailboxStatus}
              mailLifecycle={mailLifecycle}
              mailboxMessages={mailboxMessages}
              onRefresh={() => loadPageData({ force: true })}
              isRefreshing={isRefreshing}
              onSendReply={handleSendMailboxReply}
              isSendingReplyId={isSendingReplyId}
              onSendFollowUp={handleSendFollowUp}
              isSendingFollowUpId={isSendingFollowUpId}
              onUpdateFollowUpDraft={handleUpdateFollowUpDraft}
              onReopenLead={handleReopenLead}
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

          {activeView === "admin" && isSuperadmin && (
            <SuperadminView
              currentUser={currentUser}
              onNotify={(notice) => {
                setNotice(notice);
                if (notice.title === 'User Deleted') refreshAffected(['leads', 'outreach', 'messages', 'lifecycle'], { reload: false });
              }}
              mailboxStatus={mailboxStatus}
              onCopyWebhook={handleCopyWebhook}
            />
          )}
          </>}
          </Suspense>
        </main>
      </div>

      <Suspense fallback={<div className="lf-loading" role="status">Loading details...</div>}>
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
      </Suspense>
    </div>
  );
}
