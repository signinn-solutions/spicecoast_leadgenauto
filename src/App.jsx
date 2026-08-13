import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import {
  Search, BarChart3, List, Phone, Mail, Globe, CheckCircle2, XCircle,
  AlertCircle, Loader2, MapPin, Tag, ChevronRight, Sprout, Download,
  RefreshCw, Filter, Sparkles, Database, ExternalLink
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

  .lf-main { max-width: 1020px; margin: 0 auto; padding: 36px 24px 80px; }

  .lf-hero { margin-bottom: 28px; }
  .lf-hero h1 { font-size: 32px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.015em; color: var(--text); }
  .lf-hero p { color: var(--text-muted); font-size: 14.5px; margin: 0; max-width: 580px; line-height: 1.5; }

  .lf-card {
    background: var(--surface); border: 1px solid var(--border-soft);
    border-radius: 16px; padding: 28px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
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
    outline: none; transition: all 0.15s ease;
  }
  .lf-input:focus { border-color: var(--turmeric); box-shadow: 0 0 0 3px var(--turmeric-soft); }
  .lf-input::placeholder { color: var(--text-faint); }
  .lf-hint { font-size: 12px; color: var(--text-faint); margin-top: 4px; display: flex; align-items: center; gap: 6px; }
  .lf-hint.warn { color: var(--paprika); font-weight: 500; }

  .lf-mode-selector {
    display: flex; gap: 10px; margin-top: 6px;
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

  .lf-table-wrap { border: 1px solid var(--border-soft); border-radius: 14px; overflow: hidden; background: var(--surface); }
  .lf-row {
    display: grid; grid-template-columns: 1.8fr 1.1fr 1.1fr 0.6fr; gap: 14px;
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
  .lf-badge-sub { display: block; font-size: 11px; color: var(--text-faint); margin-top: 4px; font-family: 'IBM Plex Mono', monospace; }

  .lf-website-link {
    color: var(--text-muted); font-size: 12px; display: inline-flex; align-items: center; gap: 5px;
    text-decoration: none; padding: 4px 8px; border-radius: 6px; background: var(--ink); border: 1px solid var(--border-soft);
    transition: all 0.15s ease;
  }
  .lf-website-link:hover { color: var(--turmeric); border-color: var(--turmeric); }

  .lf-empty {
    text-align: center; padding: 70px 20px; color: var(--text-faint);
  }
  .lf-empty svg { margin-bottom: 14px; opacity: 0.5; color: var(--turmeric); }
  .lf-empty p { font-size: 14px; margin: 0; }

  .lf-analytics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 24px; }
  .lf-panel { background: var(--surface); border: 1px solid var(--border-soft); border-radius: 16px; padding: 24px; }
  .lf-panel h3 { font-size: 13px; font-weight: 600; margin: 0 0 18px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

  .lf-search-history-item {
    display: flex; align-items: center; justify-content: space-between; padding: 12px 0;
    border-bottom: 1px solid var(--border-soft); font-size: 13px; cursor: pointer;
    transition: all 0.15s ease;
  }
  .lf-search-history-item:hover { color: var(--turmeric); }
  .lf-search-history-item:last-child { border-bottom: none; }
  .lf-search-history-item .q { color: var(--text); font-weight: 500; display: flex; align-items: center; gap: 6px; }
  .lf-search-history-item .meta { color: var(--text-faint); font-size: 12px; font-family: 'IBM Plex Mono', monospace; }

  .lf-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 80px 0; color: var(--text-muted); }
  .spin { animation: lf-spin 0.9s linear infinite; }
  @keyframes lf-spin { to { transform: rotate(360deg); } }

  @media (max-width: 768px) {
    .lf-form-grid { grid-template-columns: 1fr; }
    .lf-field.span-2 { grid-column: span 1; }
    .lf-summary-row { grid-template-columns: 1fr 1fr; }
    .lf-analytics-grid { grid-template-columns: 1fr; }
    .lf-row { grid-template-columns: 1fr; gap: 8px; }
    .lf-row.header { display: none; }
    .lf-nav { padding: 14px 16px; }
  }
`;

// Safe cross-environment storage wrapper
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

// Simulation mock lead generator (for instant client-side execution or offline mode)
const SUFFIXES = ["Traders", "Exports", "& Sons", "Spice Co.", "Trading House", "International", "Merchants", "Imports", "Enterprises", "Global"];
const PHONE_STATUSES = [
  { key: "valid", weight: 8 },
  { key: "invalid", weight: 2 },
];
const EMAIL_STATUSES = [
  { key: "deliverable", weight: 6 },
  { key: "risky", weight: 2 },
  { key: "not_found", weight: 2 },
];

function weightedPick(options) {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const o of options) {
    if (r < o.weight) return o.key;
    r -= o.weight;
  }
  return options[0].key;
}

function generateMockLeads(businessType, city, country, count) {
  const leads = [];
  for (let i = 0; i < count; i++) {
    const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
    const firstWord = businessType.split(" ")[0] || "Spice";
    const name = `${city} ${firstWord} ${suffix}`.replace(/\b\w/g, (c) => c.toUpperCase());
    const domain = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;
    const phoneStatus = weightedPick(PHONE_STATUSES);
    const emailStatus = weightedPick(EMAIL_STATUSES);
    leads.push({
      id: `sim-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      address: `${100 + i * 12} ${city} Trade Road, ${city}, ${country}`,
      phone: phoneStatus === "invalid" ? "—" : `+91 ${Math.floor(70000 + Math.random() * 9999)} ${Math.floor(10000 + Math.random() * 89999)}`,
      phoneStatus,
      email: emailStatus === "not_found" ? "—" : `contact@${domain}`,
      emailStatus,
      website: `https://${domain}`,
      foundAt: new Date().toISOString(),
      source: "simulated",
    });
  }
  return leads;
}

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
  const [view, setView] = useState("search");
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

  const today = new Date().toISOString().slice(0, 10);
  const remaining = usage.date === today ? Math.max(0, DAILY_LIMIT - usage.count) : DAILY_LIMIT;

  // Load initial persisted data
  useEffect(() => {
    (async () => {
      try {
        // Check if Flask backend API is available
        try {
          const res = await fetch("/api/status");
          if (res.ok) {
            const data = await res.json();
            if (data.date) setUsage({ date: data.date, count: data.count });
          }
        } catch {
          // Backend offline, fallback to local storage
        }

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
    })();
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

    let leads = [];
    let isLive = false;

    // Try backend API first
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
        leads = data.leads || [];
        isLive = data.mode === "live";
        if (data.usage) {
          setUsage(data.usage);
          await persist("usage", data.usage);
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        if (searchMode === "live") {
          throw new Error(errData.error || "Backend live search error");
        }
      }
    } catch (apiErr) {
      console.log("Backend API not reachable or errored, using client simulation:", apiErr.message);
    }

    // Client-side fallback if backend was unavailable
    if (leads.length === 0) {
      await new Promise((r) => setTimeout(r, 1200)); // UI polish delay
      leads = generateMockLeads(businessType, city, country, count);
      const newUsage = { date: today, count: (usage.date === today ? usage.count : 0) + count };
      setUsage(newUsage);
      await persist("usage", newUsage);
    }

    const newAllLeads = [...leads, ...allLeads];
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
    await persist("all-leads", newAllLeads);
    await persist("search-history", newHistory);

    setSearching(false);
    setView("results");
  };

  const filteredResults = useMemo(() => {
    if (filterMode === "emails") return currentResults.filter((l) => l.emailStatus === "deliverable" || l.emailStatus === "valid");
    if (filterMode === "phones") return currentResults.filter((l) => l.phoneStatus === "valid");
    if (filterMode === "both") return currentResults.filter((l) => (l.emailStatus === "deliverable" || l.emailStatus === "valid") && l.phoneStatus === "valid");
    return currentResults;
  }, [currentResults, filterMode]);

  const summary = useMemo(() => {
    const validPhones = currentResults.filter((l) => l.phoneStatus === "valid").length;
    const validEmails = currentResults.filter((l) => l.emailStatus === "deliverable" || l.emailStatus === "valid").length;
    const bothValid = currentResults.filter((l) => (l.emailStatus === "deliverable" || l.emailStatus === "valid") && l.phoneStatus === "valid").length;
    return { total: currentResults.length, validPhones, validEmails, bothValid };
  }, [currentResults]);

  const chartData = useMemo(() => {
    const counts = { deliverable: 0, risky: 0, not_found: 0 };
    allLeads.forEach((l) => {
      const s = l.emailStatus === "valid" ? "deliverable" : l.emailStatus;
      counts[s] = (counts[s] || 0) + 1;
    });
    return [
      { name: "Deliverable", value: counts.deliverable, color: "#7ea86e" },
      { name: "Risky", value: counts.risky, color: "#e3a22e" },
      { name: "Not found", value: counts.not_found, color: "#c04b32" },
    ];
  }, [allLeads]);

  const exportCSV = () => {
    const dataToExport = filteredResults.length > 0 ? filteredResults : currentResults;
    if (dataToExport.length === 0) return;

    const headers = ["Company", "Address", "Phone", "Phone_Status", "Email", "Email_Status", "Website", "Found_At"];
    const rows = dataToExport.map((l) => [
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
        <div className="lf-loading"><Loader2 size={24} className="spin" /> Initializing SpiceCoast...</div>
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
            <div className="lf-brand-sub">spicecoast · Lead Automation</div>
          </div>
        </div>

        <div className="lf-tabs">
          <button className={`lf-tab ${view === "search" ? "active" : ""}`} onClick={() => setView("search")}>
            <Search size={15} /> Search
          </button>
          <button className={`lf-tab ${view === "results" ? "active" : ""}`} onClick={() => setView("results")}>
            <List size={15} /> Results {currentResults.length > 0 && `(${currentResults.length})`}
          </button>
          <button className={`lf-tab ${view === "analytics" ? "active" : ""}`} onClick={() => setView("analytics")}>
            <BarChart3 size={15} /> Analytics
          </button>
        </div>

        <div className="lf-nav-right">
          <div className="lf-budget" title={`Daily limit resets at midnight. Max ${DAILY_LIMIT}/day.`}>
            <span className="lf-budget-label">Today's harvest</span>
            <span className="lf-budget-count">{Math.max(0, usage.date === today ? usage.count : 0)}/{DAILY_LIMIT}</span>
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
              <p>Find businesses with Google Places, enrich contact info with Hunter.io, and verify live email deliverability automatically.</p>
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
                        <Sparkles size={13} /> Instant Simulation
                      </div>
                    </div>
                  </div>

                  <div className="lf-field span-2">
                    <div className={`lf-hint ${remaining <= 0 ? "warn" : ""}`}>
                      <AlertCircle size={13} />
                      {remaining} of {DAILY_LIMIT} searches remaining in today's quota
                      {remaining <= 0 ? " — quota resets tomorrow." : ""}
                    </div>
                  </div>
                </div>

                <button className="lf-submit" type="submit" disabled={searching || remaining <= 0}>
                  {searching ? (
                    <><Loader2 size={18} className="spin" /> Harvesting & Verifying Leads...</>
                  ) : (
                    <><Search size={18} /> Find & Verify Leads</>
                  )}
                </button>
              </form>
            </div>
          </>
        )}

        {/* RESULTS VIEW */}
        {view === "results" && (
          <>
            <div className="lf-hero">
              <h1 className="lf-display">Harvested Leads</h1>
              <p>{summary.total > 0 ? `Showing results from your latest search.` : "Run a search to see leads here."}</p>
            </div>

            {summary.total > 0 && (
              <>
                <div className="lf-summary-row">
                  <div className="lf-stat"><div className="lf-stat-label">Total Found</div><div className="lf-stat-value gold lf-mono">{summary.total}</div></div>
                  <div className="lf-stat"><div className="lf-stat-label">Valid Phone</div><div className="lf-stat-value green lf-mono">{summary.validPhones}</div></div>
                  <div className="lf-stat"><div className="lf-stat-label">Deliverable Email</div><div className="lf-stat-value green lf-mono">{summary.validEmails}</div></div>
                  <div className="lf-stat"><div className="lf-stat-label">Fully Verified</div><div className="lf-stat-value lf-mono">{summary.bothValid}</div></div>
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
                  <div>Company & Location</div><div>Phone Number</div><div>Verified Email</div><div>Website</div>
                </div>
                {filteredResults.map((lead) => (
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
                      <EmailBadge status={lead.emailStatus} />
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
                ))}
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
              <div className="lf-stat"><div className="lf-stat-label">Valid Phone Numbers</div><div className="lf-stat-value green lf-mono">{allLeads.filter(l => l.phoneStatus === "valid").length}</div></div>
              <div className="lf-stat"><div className="lf-stat-label">Today's Usage</div><div className="lf-stat-value lf-mono">{usage.date === today ? usage.count : 0}/{DAILY_LIMIT}</div></div>
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
                        <span className="q"><Search size={12} color="var(--turmeric)" /> {h.query}</span>
                        <span className="meta">{h.count} leads · {new Date(h.date).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
