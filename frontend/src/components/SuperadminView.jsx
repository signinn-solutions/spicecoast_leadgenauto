import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Server,
  Users,
  Activity,
  Cpu,
  Database,
  Key,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Globe,
  Mail,
  Bot,
  Lock,
  UserCheck,
  UserX,
  Sliders,
  RotateCcw,
  Check,
  X,
  Loader2,
  Search,
  Filter,
  Download,
  ArrowUpRight,
  TrendingUp,
  HardDrive,
  Layers,
  Terminal,
} from "lucide-react";
import { createRequestCache, ADMIN_RESOURCES, ADMIN_TAB_RESOURCES } from "../requestCache.js";
import WebhookConfiguration from "./WebhookConfiguration.jsx";
import useDialogFocus from "../hooks/useDialogFocus.js";
import { apiFetch as fetch } from "../api.js";

export default function SuperadminView({ currentUser, onNotify, mailboxStatus = {}, onCopyWebhook }) {
  const [activeTab, setActiveTab] = useState("overview"); // 'overview', 'users', 'integrations', 'audit'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [resettingUsage, setResettingUsage] = useState(null);
  const [resettingHunter, setResettingHunter] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const providerTestRef = useRef(false);
  const adminCacheRef = useRef(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const adminRefreshCountRef = useRef(0);
  const [updatingUserId, setUpdatingUserId] = useState(null);

  // System Health state
  const [healthData, setHealthData] = useState(null);
  const [testingService, setTestingService] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [isSwitchingEngine, setIsSwitchingEngine] = useState(false);
  const [switchingEngine, setSwitchingEngine] = useState(null);
  const engineSwitchRef = useRef(false);

  // Users state
  const [usersList, setUsersList] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  useEffect(() => { setDeleteConfirmation(''); }, [isDeleteModalOpen, selectedUser?.id]);
  const adminDialogRef = useRef(null);
  const closeAdminDialog = () => {
    if (submittingUser) return;
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setIsDeleteModalOpen(false);
  };
  useDialogFocus(isCreateModalOpen || isEditModalOpen || isDeleteModalOpen, adminDialogRef, closeAdminDialog, ".lf-modal-close");

  const [submittingUser, setSubmittingUser] = useState(false);

  // Create User Form State
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
    notes: "",
  });

  // Edit User Form State
  const [editFormData, setEditFormData] = useState({
    name: "",
    role: "user",
    status: "active",
    newPassword: "",
    notes: "",
  });

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditCategoryFilter, setAuditCategoryFilter] = useState("all");

  if (!adminCacheRef.current) {
    adminCacheRef.current = createRequestCache(fetch, (url, data) => {
      if (url === ADMIN_RESOURCES.health) setHealthData(data);
      else if (url === ADMIN_RESOURCES.users) setUsersList(data.users || []);
      else if (url === ADMIN_RESOURCES.audit) setAuditLogs(data.logs || []);
    });
  }

  const loadAdminData = async (silent = false, { force = !silent, resources } = {}) => {
    const names = resources || ADMIN_TAB_RESOURCES[activeTabRef.current];
    if (!silent) { adminRefreshCountRef.current += 1; setRefreshing(true); }
    try {
      await adminCacheRef.current.loadMany(names.map(name => ADMIN_RESOURCES[name]), { force });
      setLoadError("");
    } catch (err) {
      setLoadError(err.message || "Failed to load admin data.");
      onNotify?.({ type: "error", title: "Admin Data Error", text: err.message });
    } finally {
      setLoading(false);
      if (!silent) {
        adminRefreshCountRef.current -= 1;
        setRefreshing(adminRefreshCountRef.current > 0);
      }
    }
  };

  const refreshAdminAfterAction = async (names) => {
    adminCacheRef.current.invalidate(names.map(name => ADMIN_RESOURCES[name]));
    const visible = ADMIN_TAB_RESOURCES[activeTabRef.current].filter(name => names.includes(name));
    if (visible.length) await loadAdminData(true, { resources: visible });
  };

  useEffect(() => {
    loadAdminData(false, { force: false });
  }, [activeTab]);

  // Format seconds to human uptime
  const formatUptime = (sec = 0) => {
    const d = Math.floor(sec / (3600 * 24));
    const h = Math.floor((sec % (3600 * 24)) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${d > 0 ? `${d}d ` : ""}${h}h ${m}m`;
  };

  // Run provider live test
  const runProviderTest = async (serviceName) => {
    setTestingService(serviceName);
    try {
      const res = await fetch("/api/admin/system/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceName }),
      });
      const data = await res.json();
      const resultOk = res.ok && data.ok === true;
      setTestResults((prev) => ({
        ...prev,
        [serviceName]: {
          timestamp: new Date().toLocaleTimeString(),
          ok: resultOk,
          error: data.error || data.message || "Provider test failed.",
          latency: data.latency,
          message: data.message || data.error,
          details: data.account || null,
        },
      }));
      if (resultOk) {
        if (onNotify) {
          onNotify({
            type: data.verified === false ? "info" : "success",
            title: data.verified === false ? "Configuration checked" : `${serviceName.toUpperCase()} Connection Verified`,
            text: data.message || `Connection confirmed in ${data.latency}ms.`,
          });
        }
      } else {
        if (onNotify) {
          onNotify({
            type: "error",
            title: `${serviceName.toUpperCase()} Test Failed`,
            text: data.error || "Service endpoint unreachable.",
          });
        }
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [serviceName]: {
          timestamp: new Date().toLocaleTimeString(),
          ok: false,
          error: err.message,
          message: err.message,
        },
      }));
    } finally {
      setTestingService(null);
    }
  };

  const handleTestConnection = async (serviceName) => {
    if (providerTestRef.current) return;
    providerTestRef.current = true;
    try { await runProviderTest(serviceName); }
    finally { providerTestRef.current = false; }
  };

  const handleTestAllIntegrations = async () => {
    if (providerTestRef.current) return;
    providerTestRef.current = true;
    setTestingAll(true);
    try {
      for (const service of ["google_places", "hunter", "groq", "hostinger"]) {
        await runProviderTest(service);
      }
    } finally {
      setTestingAll(false);
      providerTestRef.current = false;
    }
  };

  // Switch Discovery Engine
  const handleSwitchEngine = async (targetEngine) => {
    if (engineSwitchRef.current || targetEngine === healthData?.discovery_engine) return;
    engineSwitchRef.current = true;
    setIsSwitchingEngine(true);
    setSwitchingEngine(targetEngine);
    try {
      const res = await fetch("/api/admin/system/engine", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine: targetEngine }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to switch engine.");
      if (data.success !== true || data.discovery_engine !== targetEngine) {
        throw new Error("The server did not confirm the selected engine. Refresh and try again.");
      }
      // Apply the persisted choice immediately, and invalidate reads that started before it.
      adminCacheRef.current.invalidate([ADMIN_RESOURCES.health, ADMIN_RESOURCES.audit]);
      setHealthData(previous => ({
        ...previous,
        discovery_engine: data.discovery_engine,
        integrations: {
          ...previous?.integrations,
          hunter_io: { ...previous?.integrations?.hunter_io, enabled: data.hunter_enabled },
        },
      }));
      if (onNotify) {
        onNotify({
          type: "success",
          title: "Discovery Engine Updated",
          text: `System engine set to ${targetEngine === "hunter" ? "Hunter.io Native Discovery" : "Google Places Scraper"}.`,
        });
      }
      await refreshAdminAfterAction(["health", "audit"]);
    } catch (err) {
      if (onNotify) onNotify({ type: "error", title: "Engine Switch Error", text: err.message });
    } finally {
      setIsSwitchingEngine(false);
      setSwitchingEngine(null);
      engineSwitchRef.current = false;
    }
  };

  // Reset hunter quota state
  const handleResetHunterQuota = async () => {
    if (resettingHunter) return;
    setResettingHunter(true);
    try {
      const res = await fetch("/api/admin/system/reset-hunter-quota", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed.");
      if (res.ok) {
        if (onNotify) {
          onNotify({
            type: "success",
            title: "Quota State Cleared",
            text: data.message,
          });
        }
        await refreshAdminAfterAction(["health", "audit"]);
      }
    } catch (err) {
      if (onNotify) onNotify({ type: "error", title: "Action Failed", text: err.message });
    } finally {
      setResettingHunter(false);
    }
  };

  // Reset daily lead usage count
  const handleResetDailyUsage = async (type = "leads") => {
    if (resettingUsage) return;
    setResettingUsage(type);
    try {
      const res = await fetch("/api/admin/system/reset-daily-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed.");
      if (res.ok) {
        if (onNotify) {
          onNotify({
            type: "success",
            title: "Usage Count Cleared",
            text: data.message,
          });
        }
        await refreshAdminAfterAction(["health", "audit"]);
      }
    } catch (err) {
      if (onNotify) onNotify({ type: "error", title: "Action Failed", text: err.message });
    } finally {
      setResettingUsage(null);
    }
  };

  // Create User Handler
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSubmittingUser(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user.");

      if (onNotify) {
        onNotify({
          type: "success",
          title: "User Created",
          text: `Account for ${newUser.email} created as ${newUser.role}.`,
        });
      }
      setIsCreateModalOpen(false);
      setNewUser({ name: "", email: "", password: "", role: "user", notes: "" });
      refreshAdminAfterAction(["health", "users", "audit"]);
    } catch (err) {
      if (onNotify) onNotify({ type: "error", title: "Create User Error", text: err.message });
    } finally {
      setSubmittingUser(false);
    }
  };

  // Open Edit User Modal
  const openEditUser = (user) => {
    setSelectedUser(user);
    setEditFormData({
      name: user.name || "",
      role: user.role || "user",
      status: user.status || "active",
      newPassword: "",
      notes: user.notes || "",
    });
    setIsEditModalOpen(true);
  };

  // Save Edit User
  const handleSaveEditUser = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmittingUser(true);
    try {
      const payload = {
        name: editFormData.name,
        role: editFormData.role,
        status: editFormData.status,
        notes: editFormData.notes,
      };
      if (editFormData.newPassword) {
        payload.password = editFormData.newPassword;
      }

      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user.");

      if (onNotify) {
        onNotify({
          type: "success",
          title: "User Updated",
          text: `Updated profile for ${selectedUser.email}.`,
        });
      }
      setIsEditModalOpen(false);
      setSelectedUser(null);
      refreshAdminAfterAction(["health", "users", "audit"]);
    } catch (err) {
      if (onNotify) onNotify({ type: "error", title: "Update Error", text: err.message });
    } finally {
      setSubmittingUser(false);
    }
  };

  // Toggle User Active/Suspended
  const handleToggleUserStatus = async (user) => {
    if (updatingUserId) return;
    setUpdatingUserId(user.id);
    const nextStatus = user.status === "active" ? "suspended" : "active";
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status.");

      if (onNotify) {
        onNotify({
          type: "success",
          title: `User ${nextStatus === "active" ? "Activated" : "Suspended"}`,
          text: `${user.email} is now ${nextStatus}.`,
        });
      }
      refreshAdminAfterAction(["health", "users", "audit"]);
    } catch (err) {
      if (onNotify) onNotify({ type: "error", title: "Status Error", text: err.message });
    } finally {
      setUpdatingUserId(null);
    }
  };

  // Delete User
  const handleDeleteUser = async () => {
    if (deleteConfirmation.trim().toLowerCase() !== selectedUser?.email?.toLowerCase()) return;
    if (!selectedUser || submittingUser) return;
    setSubmittingUser(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user.");

      if (onNotify) {
        onNotify({
          type: "success",
          title: "User Deleted",
          text: `User ${selectedUser.email} deleted with ${data.deletedData?.leads || 0} owned leads, ${data.deletedData?.searches || 0} searches, ${data.deletedData?.outreach || 0} outreach records and ${data.deletedData?.mailbox || 0} mailbox records.`,
        });
      }
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      refreshAdminAfterAction(["health", "users", "audit"]);
    } catch (err) {
      if (onNotify) onNotify({ type: "error", title: "Delete Error", text: err.message });
    } finally {
      setSubmittingUser(false);
    }
  };

  // Export Audit Logs to CSV
  const handleExportAuditLogs = () => {
    if (!filteredAuditLogs.length) return;
    const headers = ["Timestamp", "User Email", "Action", "Category", "IP Address", "Details"];
    const rows = filteredAuditLogs.map((log) => [
      log.timestamp, log.user_email, log.action, log.category, log.ip_address, log.details,
    ].map(value => `"${String(value ?? "").replace(/"/g, '""')}"`));
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `spicecoast-audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const q = userSearch.toLowerCase();
      const matchQuery =
        !q ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.notes && u.notes.toLowerCase().includes(q));
      const matchRole = userRoleFilter === "all" || u.role === userRoleFilter;
      const matchStatus = userStatusFilter === "all" || u.status === userStatusFilter;
      return matchQuery && matchRole && matchStatus;
    });
  }, [usersList, userSearch, userRoleFilter, userStatusFilter]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((l) => {
      const q = auditSearch.toLowerCase();
      const matchQuery =
        !q ||
        (l.details && l.details.toLowerCase().includes(q)) ||
        (l.user_email && l.user_email.toLowerCase().includes(q)) ||
        (l.action && l.action.toLowerCase().includes(q));
      const matchCategory = auditCategoryFilter === "all" || l.category === auditCategoryFilter;
      return matchQuery && matchCategory;
    });
  }, [auditLogs, auditSearch, auditCategoryFilter]);

  // Metrics for overview
  const totalUsers = usersList.length;
  const activeUsers = usersList.filter((u) => u.status === "active").length;
  const superadminUsers = usersList.filter((u) => u.role === "superadmin").length;
  const leadgenUsers = usersList.filter((u) => u.role === "user").length;

  const leadQuotaPercent = Math.min(
    100,
    Math.round(((healthData?.quotas?.leads_harvested || 0) / (healthData?.quotas?.leads_limit || 200)) * 100)
  );
  const replyQuotaPercent = Math.min(
    100,
    Math.round(((healthData?.quotas?.replies_dispatched || 0) / (healthData?.quotas?.replies_limit || 30)) * 100)
  );

  const tabHasData = adminCacheRef.current.hasLoaded(
    ADMIN_TAB_RESOURCES[activeTab].map(name => ADMIN_RESOURCES[name])
  );
  const totalAuditRecords = healthData?.system?.database?.tables?.auditLogs ?? auditLogs.length;
  if (loading || (!tabHasData && !loadError)) return <div className="lf-loading" role="status">Loading administration...</div>;
  if (!tabHasData) return (
    <section className="lf-panel">
      <p role="alert">{loadError || "Admin data is unavailable."}</p>
      <button type="button" className="lf-btn-secondary" onClick={() => loadAdminData()} disabled={refreshing}>Retry</button>
    </section>
  );

  return (
    <div className="lf-view-container lf-admin-view lf-animate-fade">
      {loadError && <p role="alert" className="lf-auth-error">Unable to refresh: {loadError}. Showing the previous snapshot.</p>}
      {/* Superadmin Executive Header */}
      <div className="lf-section-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span
              className="lf-badge-pill purple"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                fontWeight: "700",
                letterSpacing: "0.5px",
              }}
            >
              <ShieldAlert size={13} />
              <span>SUPERADMIN COMMAND CENTER</span>
            </span>
            <span className="lf-badge-pill blue">
              Runtime: {healthData?.system?.platform || "Node.js"} / {healthData?.environment || "Unknown"}
            </span>
          </div>

          <h2 className="lf-section-title" style={{ marginTop: "8px", fontSize: "24px" }}>
            {{ overview: "System overview", users: "User access", integrations: "Health & integrations", audit: "Audit history" }[activeTab]}
          </h2>
          <p className="lf-section-subtitle">
            Monitor services, manage team access, and review audit events.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="lf-btn-secondary sm"
            onClick={() => loadAdminData()}
            disabled={refreshing}
            title="Refresh the current section"
          >
            <RefreshCw size={14} className={refreshing ? "spin" : ""} />
            <span>Refresh State</span>
          </button>

          {activeTab !== "users" && <button
            type="button"
            className="lf-btn-primary sm"
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              border: "none",
            }}
          >
            <Plus size={14} />
            <span>Create User</span>
          </button>}
        </div>
      </div>

      {/* Modern High-End Tabbed Navigation */}
      <nav className="lf-admin-tabs-row" aria-label="Administration sections">
        <button
          type="button"
          className={`lf-admin-tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
          aria-current={activeTab === "overview" ? "page" : undefined}
        >
          <TrendingUp size={15} />
          <span>Overview</span>
        </button>

        <button
          type="button"
          className={`lf-admin-tab-btn ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
          aria-current={activeTab === "users" ? "page" : undefined}
        >
          <Users size={15} />
          <span>Users ({usersList.length})</span>
        </button>

        <button
          type="button"
          className={`lf-admin-tab-btn ${activeTab === "integrations" ? "active" : ""}`}
          onClick={() => setActiveTab("integrations")}
          aria-current={activeTab === "integrations" ? "page" : undefined}
        >
          <Server size={15} />
          <span>Health & Integrations</span>
        </button>

        <button
          type="button"
          className={`lf-admin-tab-btn ${activeTab === "audit" ? "active" : ""}`}
          onClick={() => setActiveTab("audit")}
          aria-current={activeTab === "audit" ? "page" : undefined}
        >
          <Activity size={15} />
          <span>Audit History ({totalAuditRecords})</span>
        </button>
      </nav>

      {/* ============================================================== */}
      {/* TAB 1: EXECUTIVE OVERVIEW DASHBOARD */}
      {/* ============================================================== */}
      {activeTab === "overview" && (
        <div className="lf-admin-overview-grid" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          {/* Top 4 KPI Summary Cards */}
          <div className="lf-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
            {/* KPI 1: System Vitals */}
            <div className="lf-stat-card" style={{ borderLeft: "4px solid #10b981" }}>
              <div className="lf-stat-top">
                <span className="lf-stat-label">System Health Status</span>
                <CheckCircle2 size={18} className="text-emerald" />
              </div>
              <div className="lf-stat-val text-emerald" style={{ fontSize: "20px", fontWeight: "700" }}>
                Snapshot loaded
              </div>
              <div className="lf-stat-desc">
                Uptime: <strong>{formatUptime(healthData?.server_uptime)}</strong> • WAL Database Active
              </div>
            </div>

            {/* KPI 2: User Accounts */}
            <div className="lf-stat-card" style={{ borderLeft: "4px solid #7c3aed" }}>
              <div className="lf-stat-top">
                <span className="lf-stat-label">Platform Accounts</span>
                <Users size={18} className="text-purple" />
              </div>
              <div className="lf-stat-val lf-mono" style={{ fontSize: "22px" }}>
                {activeUsers} / {totalUsers} Active
              </div>
              <div className="lf-stat-desc">
                {superadminUsers} Superadmin &bull; {leadgenUsers} Lead Operations
              </div>
            </div>

            {/* KPI 3: Discovery Engine */}
            <div className="lf-stat-card" style={{ borderLeft: "4px solid #3b82f6" }}>
              <div className="lf-stat-top">
                <span className="lf-stat-label">Active Discovery Engine</span>
                <Sliders size={18} className="text-blue" />
              </div>
              <div className="lf-stat-val" style={{ fontSize: "17px", fontWeight: "600", color: "#3b82f6" }}>
                {healthData?.discovery_engine === "hunter" ? "⚡ Hunter.io Native" : "🌐 Google Places Scraper"}
              </div>
              <div className="lf-stat-desc">
                {healthData?.discovery_engine === "hunter"
                  ? "Direct Hunter Discover database"
                  : "Google Places seed + Inbuilt crawler"}
              </div>
            </div>

            {/* KPI 4: Daily Quota Usage */}
            <div className="lf-stat-card" style={{ borderLeft: "4px solid #f59e0b" }}>
              <div className="lf-stat-top">
                <span className="lf-stat-label">Lead Discovery Quota</span>
                <Zap size={18} className="text-amber" />
              </div>
              <div className="lf-stat-val lf-mono" style={{ fontSize: "22px" }}>
                {healthData?.quotas?.leads_harvested || 0} / {healthData?.quotas?.leads_limit || 200}
              </div>
              <div className="lf-stat-desc">
                {healthData?.quotas?.leads_remaining || 0} searches remaining today
              </div>
            </div>
          </div>

          {/* Quick Engine Governance & Daily Quota Management Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "20px" }}>
            {/* System Engine Control Card */}
            <div className="lf-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(124, 58, 237, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#7c3aed" }}>
                      <Sliders size={18} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: "15px", fontWeight: "700", margin: 0, color: "var(--text-main)" }}>
                        Discovery engine
                      </h3>
                      <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
                        Scraper is the default. Enable optional Hunter manually when needed.
                      </p>
                    </div>
                  </div>
                  <span className={`lf-badge-pill ${healthData?.discovery_engine === "hunter" ? "purple" : "blue"}`}>
                    {healthData?.discovery_engine === "hunter" ? "Hunter Native" : "Places Scraper"}
                  </span>
                </div>

                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", margin: "10px 0" }}>
                  {healthData?.discovery_engine === "hunter"
                    ? "Users search leads directly via Hunter.io's proprietary company discovery engine and executive database."
                    : "Users search leads using Google Places as the starting seed and extract verified emails via the inbuilt web scraper (0 Hunter credits used)."}
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--border-subtle)" }}>
                <button
                  type="button"
                  className={`lf-btn-secondary sm ${healthData?.discovery_engine === "scraper" ? "active" : ""}`}
                  onClick={() => handleSwitchEngine("scraper")}
                  aria-pressed={healthData?.discovery_engine === "scraper"}
                  aria-busy={switchingEngine === "scraper"}
                  disabled={isSwitchingEngine || healthData?.discovery_engine === "scraper"}
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    borderColor: healthData?.discovery_engine === "scraper" ? "#3b82f6" : "var(--border-card)",
                    background: healthData?.discovery_engine === "scraper" ? "rgba(59, 130, 246, 0.12)" : "var(--bg-surface-1)",
                    color: healthData?.discovery_engine === "scraper" ? "#2563eb" : "var(--text-main)",
                    fontWeight: "600",
                  }}
                >
                  {switchingEngine === "scraper" ? <Loader2 size={13} className="spin" /> : <Globe size={13} />}
                  <span>{switchingEngine === "scraper" ? "Switching..." : "Google Places Scraper"}</span>
                </button>

                <button
                  type="button"
                  className={`lf-btn-secondary sm ${healthData?.discovery_engine === "hunter" ? "active" : ""}`}
                  onClick={() => handleSwitchEngine("hunter")}
                  aria-pressed={healthData?.discovery_engine === "hunter"}
                  aria-busy={switchingEngine === "hunter"}
                  disabled={isSwitchingEngine || healthData?.discovery_engine === "hunter"}
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    borderColor: healthData?.discovery_engine === "hunter" ? "#7c3aed" : "var(--border-card)",
                    background: healthData?.discovery_engine === "hunter" ? "rgba(124, 58, 237, 0.12)" : "var(--bg-surface-1)",
                    color: healthData?.discovery_engine === "hunter" ? "#7c3aed" : "var(--text-main)",
                    fontWeight: "600",
                  }}
                >
                  {switchingEngine === "hunter" ? <Loader2 size={13} className="spin" /> : <Zap size={13} />}
                  <span>{switchingEngine === "hunter" ? "Switching..." : "Hunter.io (Optional)"}</span>
                </button>
              </div>
            </div>

            {/* Daily Quotas & Reset Controls Card */}
            <div className="lf-panel" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#d97706" }}>
                    <RotateCcw size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "15px", fontWeight: "700", margin: 0, color: "var(--text-main)" }}>
                      Daily usage
                    </h3>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
                      Monitor and reset operator rate limits for {healthData?.quotas?.date || "today"}.
                    </p>
                  </div>
                </div>
              </div>

              {/* Lead Search Meter */}
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "5px" }}>
                  <span style={{ fontWeight: "600", color: "var(--text-main)" }}>Lead Prospecting Searches</span>
                  <span className="lf-mono">
                    {healthData?.quotas?.leads_harvested || 0} / {healthData?.quotas?.leads_limit || 200} ({leadQuotaPercent}%)
                  </span>
                </div>
                <div style={{ width: "100%", height: "6px", background: "var(--bg-surface-2)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ width: `${leadQuotaPercent}%`, height: "100%", background: "#f59e0b", transition: "width 0.3s ease" }} />
                </div>
              </div>

              {/* Reply Meter */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "5px" }}>
                  <span style={{ fontWeight: "600", color: "var(--text-main)" }}>AI Inbound Auto-Dispatches</span>
                  <span className="lf-mono">
                    {healthData?.quotas?.replies_dispatched || 0} / {healthData?.quotas?.replies_limit || 30} ({replyQuotaPercent}%)
                  </span>
                </div>
                <div style={{ width: "100%", height: "6px", background: "var(--bg-surface-2)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ width: `${replyQuotaPercent}%`, height: "100%", background: "#10b981", transition: "width 0.3s ease" }} />
                </div>
              </div>

              {/* Quota Reset Buttons */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)" }}>
                <button
                  type="button"
                  className="lf-btn-secondary sm"
                  disabled={Boolean(resettingUsage)}
                  onClick={() => handleResetDailyUsage("leads")}
                  style={{ flex: 1, justifyContent: "center" }}
                  title="Reset lead search counter back to 0"
                >
                  <RotateCcw size={12} />
                  <span>Reset Leads Count</span>
                </button>

                <button
                  type="button"
                  className="lf-btn-secondary sm"
                  disabled={Boolean(resettingUsage)}
                  onClick={() => handleResetDailyUsage("replies")}
                  style={{ flex: 1, justifyContent: "center" }}
                  title="Reset reply dispatch counter back to 0"
                >
                  <RotateCcw size={12} />
                  <span>Reset Reply Count</span>
                </button>

                {healthData?.integrations?.hunter_io?.quota_exceeded && (
                  <button
                    type="button"
                    className="lf-btn-secondary sm"
                    disabled={resettingHunter}
                    onClick={handleResetHunterQuota}
                    style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.3)" }}
                  >
                    Clear Hunter Lock
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Infrastructure & Storage Health Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "20px" }}>
            {/* Database & Memory Panel */}
            <div className="lf-panel" style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <HardDrive size={18} className="text-purple" />
                <h3 style={{ fontSize: "15px", fontWeight: "700", margin: 0, color: "var(--text-main)" }}>
                  Storage & runtime
                </h3>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={{ padding: "12px", background: "var(--bg-surface-2)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>SQLite Database</div>
                  <div className="lf-mono" style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)", marginTop: "4px" }}>
                    {healthData?.system?.database?.sizeFormatted || "—"}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>WAL Journal Mode Active</div>
                </div>

                <div style={{ padding: "12px", background: "var(--bg-surface-2)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Heap Allocation</div>
                  <div className="lf-mono" style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)", marginTop: "4px" }}>
                    {healthData?.system?.memory?.heapUsedMb || 0} MB
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                    RSS: {healthData?.system?.memory?.rssMb || 0} MB
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span>Saved leads</span>
                  <span className="lf-mono" style={{ fontWeight: "600" }}>{healthData?.system?.database?.tables?.leads || 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span>Registered Users in System</span>
                  <span className="lf-mono" style={{ fontWeight: "600" }}>{healthData?.system?.database?.tables?.users || 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span>Audit records</span>
                  <span className="lf-mono" style={{ fontWeight: "600" }}>{healthData?.system?.database?.tables?.auditLogs || 0}</span>
                </div>
              </div>
            </div>

            {/* Quick Diagnostic Shortcuts Panel */}
            <div className="lf-panel" style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <Activity size={18} className="text-emerald" />
                <h3 style={{ fontSize: "15px", fontWeight: "700", margin: 0, color: "var(--text-main)" }}>
                  Recent activity
                </h3>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "175px", overflowY: "auto" }}>
                {auditLogs.length === 0 && <p className="lf-panel-desc">No audit events recorded yet.</p>}
                {auditLogs.slice(0, 5).map((log, idx) => (
                  <div
                    key={log.id || idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      background: "var(--bg-surface-2)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "12px",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "600", color: "var(--text-main)" }}>
                        {log.action.replace(/_/g, " ").toUpperCase()}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {log.user_email || "system"} &bull; {log.details}
                      </div>
                    </div>
                    <span className="lf-mono" style={{ fontSize: "10px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="lf-btn-secondary sm"
                  onClick={() => setActiveTab("audit")}
                  style={{ fontSize: "11px" }}
                >
                  <span>View audit history ({totalAuditRecords})</span>
                  <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: USER ACCESS MANAGEMENT */}
      {/* ============================================================== */}
      {activeTab === "users" && (
        <div className="lf-panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px", marginBottom: "18px" }}>
            <div>
              <h3 style={{ fontSize: "17px", fontWeight: "700", margin: 0, color: "var(--text-main)" }}>
                User Access Control & Roles Matrix
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                Manage team authentication, provision operator permissions, and toggle access states.
              </p>
            </div>

            <button
              type="button"
              className="lf-btn-primary sm"
              onClick={() => setIsCreateModalOpen(true)}
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", border: "none" }}
            >
              <Plus size={14} />
              <span>Create New User</span>
            </button>
          </div>

          {/* User Filtering Toolbar */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                className="lf-input"
                aria-label="Search users"
                placeholder="Search by name, email, or notes..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ paddingLeft: "32px", fontSize: "13px" }}
              />
            </div>

            <select
              className="lf-input"
              aria-label="Filter users by role"
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              style={{ width: "auto", minWidth: "140px", fontSize: "13px" }}
            >
              <option value="all">All Roles</option>
              <option value="superadmin">👑 Superadmin</option>
              <option value="user">💼 Leadgen Operations</option>
            </select>

            <select
              className="lf-input"
              aria-label="Filter users by status"
              value={userStatusFilter}
              onChange={(e) => setUserStatusFilter(e.target.value)}
              style={{ width: "auto", minWidth: "140px", fontSize: "13px" }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
            </select>
          </div>

          {/* User Accounts Table */}
          <div className="lf-table-container">
            <table className="lf-data-table lf-admin-users-table">
              <thead>
                <tr>
                  <th scope="col">User Profile</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last Sign In</th>
                  <th scope="col">Created</th>
                  <th scope="col">Notes</th>
                  <th scope="col" className="lf-admin-actions-cell">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)" }}>
                      No user accounts match the current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelf = currentUser?.email && user.email.toLowerCase() === currentUser.email.toLowerCase();
                    const isSuper = user.role === "superadmin";
                    return (
                      <tr key={user.id}>
                        {/* Profile Info */}
                        <td>
                          <div className="lf-admin-user-profile">
                            <div
                              className="lf-admin-user-avatar"
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: isSuper ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "linear-gradient(135deg, #d97706, #b45309)",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: "700",
                                fontSize: "12px",
                              }}
                            >
                              {(user.name || user.email || "U").slice(0, 2).toUpperCase()}
                            </div>
                            <div className="lf-admin-user-identity">
                              <div style={{ fontWeight: "600", color: "var(--text-main)", fontSize: "13px" }}>
                                {user.name} {isSelf && <span style={{ fontSize: "10px", color: "#7c3aed" }}>(You)</span>}
                              </div>
                              <div className="lf-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                {user.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td>
                          <span className={`lf-badge-pill ${isSuper ? "purple" : "gold"}`} style={{ fontSize: "11px" }}>
                            {isSuper ? <ShieldCheck size={12} /> : <Users size={12} />}
                            {isSuper ? "Superadmin" : "Leadgen"}
                          </span>
                        </td>

                        {/* Status */}
                        <td>
                          <span
                            className={`lf-badge-pill ${user.status === "active" ? "emerald" : "red"}`}
                            style={{ fontSize: "11px" }}
                          >
                            {user.status === "active" ? "Active" : "Suspended"}
                          </span>
                        </td>

                        {/* Last Login */}
                        <td className="lf-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          {user.last_login_at
                            ? new Date(user.last_login_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                            : "Never"}
                        </td>

                        {/* Created Date */}
                        <td className="lf-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          {user.created_at ? user.created_at.slice(0, 10) : "—"}
                        </td>

                        {/* Notes */}
                        <td style={{ fontSize: "12px", color: "var(--text-muted)", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={user.notes}>
                          {user.notes || "—"}
                        </td>

                        {/* Actions */}
                        <td className="lf-admin-actions-cell">
                          <div className="lf-admin-user-actions">
                            {/* Toggle Active / Suspended Button */}
                            <button
                              type="button"
                              className="lf-admin-user-action"
                              onClick={() => handleToggleUserStatus(user)}
                              disabled={isSelf || Boolean(updatingUserId) || submittingUser}
                              aria-label={`${user.status === "active" ? "Suspend" : "Activate"} ${user.email}`}
                              title={user.status === "active" ? "Suspend user access" : "Activate user"}
                              style={{ color: user.status === "active" ? "#d97706" : "#10b981" }}
                            >
                              {user.status === "active" ? <UserX size={13} /> : <UserCheck size={13} />}
                            </button>

                            {/* Edit User Button */}
                            <button
                              type="button"
                              className="lf-admin-user-action"
                              disabled={Boolean(updatingUserId) || submittingUser}
                              onClick={() => openEditUser(user)}
                              aria-label={`Edit ${user.email}`}
                              title="Edit user profile / reset password"
                            >
                              <Edit2 size={13} />
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              className="lf-admin-user-action"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsDeleteModalOpen(true);
                              }}
                              disabled={isSelf || Boolean(updatingUserId) || submittingUser}
                              aria-label={`Delete ${user.email}`}
                              title={isSelf ? "You cannot delete your own account" : "Delete user"}
                              style={{ color: isSelf ? "var(--text-muted)" : "#ef4444" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: CORE SERVICES & INTEGRATIONS */}
      {/* ============================================================== */}
      {activeTab === "integrations" && (
        <div className="lf-panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px", marginBottom: "18px" }}>
            <div>
              <h3 style={{ fontSize: "17px", fontWeight: "700", margin: 0, color: "var(--text-main)" }}>
                Core Infrastructure & Third-Party APIs
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                Execute live connectivity diagnostics, test latency, and monitor upstream API health.
              </p>
            </div>

            <button
              type="button"
              className="lf-btn-secondary sm"
              onClick={handleTestAllIntegrations}
              disabled={testingAll || testingService !== null}
            >
              <RefreshCw size={13} className={testingService ? "spin" : ""} />
              <span>Check Providers</span>
            </button>
          </div>

          {/* Provider Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "16px" }}>
            {/* Google Places API */}
            <div className="lf-panel" style={{ padding: "16px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Globe size={18} className="text-blue" />
                  <div>
                    <div style={{ fontWeight: "700", fontSize: "14px", color: "var(--text-main)" }}>Google Places API (New)</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Target Business Discovery Seed</div>
                  </div>
                </div>
                <span className={`lf-badge-pill ${healthData?.integrations?.google_places?.configured ? "emerald" : "red"}`}>
                  {healthData?.integrations?.google_places?.configured ? "Configured" : "Missing Key"}
                </span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "8px 0" }}>
                {healthData?.integrations?.google_places?.details}
              </p>
              {testResults.google_places && (
                <div style={{ padding: "8px 10px", background: "var(--bg-surface-2)", borderRadius: "var(--radius-sm)", fontSize: "11px", margin: "8px 0" }}>
                  <div style={{ color: testResults.google_places.ok ? "#10b981" : "#ef4444", fontWeight: "600" }}>
                    {testResults.google_places.ok ? `Verified in ${testResults.google_places.latency}ms` : `Failed: ${testResults.google_places.error}`}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                <button
                  type="button"
                  className="lf-btn-secondary sm"
                  onClick={() => handleTestConnection("google_places")}
                  disabled={testingAll || testingService !== null}
                >
                  {testingService === "google_places" ? <Loader2 size={12} className="spin" /> : <Zap size={12} />}
                  <span>Test Places API</span>
                </button>
              </div>
            </div>

            {/* Hunter.io */}
            <div className="lf-panel" style={{ padding: "16px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Zap size={18} className="text-purple" />
                  <div>
                    <div style={{ fontWeight: "700", fontSize: "14px", color: "var(--text-main)" }}>Hunter.io API</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Corporate Domain Search & Lead Contacts</div>
                  </div>
                </div>
                <span className={`lf-badge-pill ${healthData?.integrations?.hunter_io?.configured ? "purple" : "red"}`}>
                  {healthData?.integrations?.hunter_io?.configured ? "Configured" : "Missing Key"}
                </span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "8px 0" }}>
                {healthData?.integrations?.hunter_io?.details}
              </p>
              {testResults.hunter && (
                <div style={{ padding: "8px 10px", background: "var(--bg-surface-2)", borderRadius: "var(--radius-sm)", fontSize: "11px", margin: "8px 0" }}>
                  <div style={{ color: testResults.hunter.ok ? "#10b981" : "#ef4444", fontWeight: "600" }}>
                    {testResults.hunter.ok ? `Verified in ${testResults.hunter.latency}ms` : `Failed: ${testResults.hunter.error}`}
                  </div>
                  {testResults.hunter.details?.plan_name && (
                    <div style={{ color: "var(--text-muted)", marginTop: "2px" }}>
                      Plan: {testResults.hunter.details.plan_name} • Used: {testResults.hunter.details.requests?.searches?.used ?? "Unavailable"}/{testResults.hunter.details.requests?.searches?.available ?? "Unavailable"}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
                <button
                  type="button"
                  className="lf-btn-secondary sm"
                  onClick={() => handleTestConnection("hunter")}
                  disabled={testingAll || testingService !== null}
                >
                  {testingService === "hunter" ? <Loader2 size={12} className="spin" /> : <Zap size={12} />}
                  <span>Test Hunter API</span>
                </button>
              </div>
            </div>

            {/* Groq AI */}
            <div className="lf-panel" style={{ padding: "16px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Bot size={18} className="text-emerald" />
                  <div>
                    <div style={{ fontWeight: "700", fontSize: "14px", color: "var(--text-main)" }}>{healthData?.integrations?.groq_ai?.label || 'AI'} Draft Engine</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Outreach Synthesis & Inbound Intent Extraction</div>
                  </div>
                </div>
                <span className={`lf-badge-pill ${healthData?.integrations?.groq_ai?.configured ? "emerald" : "red"}`}>
                  {healthData?.integrations?.groq_ai?.configured ? "Configured" : "Missing Key"}
                </span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "8px 0" }}>
                {healthData?.integrations?.groq_ai?.details}
              </p>
              {testResults.groq && (
                <div style={{ padding: "8px 10px", background: "var(--bg-surface-2)", borderRadius: "var(--radius-sm)", fontSize: "11px", margin: "8px 0" }}>
                  <div style={{ color: testResults.groq.ok ? "#10b981" : "#ef4444", fontWeight: "600" }}>
                    {testResults.groq.ok ? `Verified in ${testResults.groq.latency}ms` : `Failed: ${testResults.groq.error}`}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                <button
                  type="button"
                  className="lf-btn-secondary sm"
                  onClick={() => handleTestConnection("groq")}
                  disabled={testingAll || testingService !== null}
                >
                  {testingService === "groq" ? <Loader2 size={12} className="spin" /> : <Bot size={12} />}
                  <span>Test AI API</span>
                </button>
              </div>
            </div>

            {/* Hostinger Mailbox */}
            <div className="lf-panel" style={{ padding: "16px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Mail size={18} className="text-amber" />
                  <div>
                    <div style={{ fontWeight: "700", fontSize: "14px", color: "var(--text-main)" }}>Hostinger Mailbox & SMTP</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Outbound Dispatch & Inbound Webhooks</div>
                  </div>
                </div>
                <span className={`lf-badge-pill ${healthData?.integrations?.hostinger_mail?.configured ? "emerald" : "gold"}`}>
                  {healthData?.integrations?.hostinger_mail?.configured ? "API configured" : "API token missing"}
                </span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "8px 0" }}>
                {healthData?.integrations?.hostinger_mail?.details}
              </p>
              {testResults.hostinger && (
                <div style={{ padding: "8px 10px", background: "var(--bg-surface-2)", borderRadius: "var(--radius-sm)", fontSize: "11px", margin: "8px 0" }}>
                  <div style={{ color: testResults.hostinger.ok ? "#10b981" : "#ef4444", fontWeight: "600" }}>
                    {testResults.hostinger.message || testResults.hostinger.error}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                <button
                  type="button"
                  className="lf-btn-secondary sm"
                  onClick={() => handleTestConnection("hostinger")}
                  disabled={testingAll || testingService !== null}
                >
                  {testingService === "hostinger" ? <Loader2 size={12} className="spin" /> : <Mail size={12} />}
                  <span>Check API Configuration</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "integrations" && (
        <WebhookConfiguration
          configured={healthData?.integrations?.hostinger_mail?.webhook_token_configured ?? mailboxStatus.has_webhook_token}
          onCopyWebhook={onCopyWebhook}
        />
      )}

      {/* ============================================================== */}
      {/* TAB 4: AUDIT LOGS & SECURITY STREAM */}
      {/* ============================================================== */}
      {activeTab === "audit" && (
        <div className="lf-panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px", marginBottom: "18px" }}>
            <div>
              <h3 style={{ fontSize: "17px", fontWeight: "700", margin: 0, color: "var(--text-main)" }}>
                Platform Security & Administrative Audit Trail
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                Immutable event stream tracking authentication attempts, user lifecycle events, and system mutations.
              </p>
            </div>

            <button
              type="button"
              className="lf-btn-secondary sm"
              onClick={handleExportAuditLogs}
              disabled={filteredAuditLogs.length === 0}
              title="Download audit logs as CSV"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
          </div>

          {/* Filtering row */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                className="lf-input"
                placeholder="Filter audit events by details, email or action..."
                aria-label="Search audit events"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                style={{ paddingLeft: "32px", fontSize: "13px" }}
              />
            </div>

            <div style={{ display: "flex", gap: "6px" }}>
              {["all", "auth", "admin", "system"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`lf-btn-secondary sm ${auditCategoryFilter === cat ? "active" : ""}`}
                  onClick={() => setAuditCategoryFilter(cat)}
                  style={{
                    textTransform: "capitalize",
                    background: auditCategoryFilter === cat ? "rgba(124, 58, 237, 0.15)" : "var(--bg-surface-1)",
                    color: auditCategoryFilter === cat ? "#7c3aed" : "var(--text-muted)",
                    borderColor: auditCategoryFilter === cat ? "#7c3aed" : "var(--border-subtle)",
                  }}
                >
                  {cat === "all" ? "All Events" : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="lf-table-container">
            <table className="lf-data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor Email</th>
                  <th>Category</th>
                  <th>Action</th>
                  <th>IP Origin</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)" }}>
                      No audit events match the filter query.
                    </td>
                  </tr>
                ) : (
                  filteredAuditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="lf-mono" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                        {log.timestamp ? new Date(log.timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "medium" }) : "—"}
                      </td>
                      <td className="lf-mono" style={{ fontSize: "12px", fontWeight: "600" }}>
                        {log.user_email || "system"}
                      </td>
                      <td>
                        <span className={`lf-badge-pill ${log.category === "auth" ? "blue" : log.category === "admin" ? "purple" : "emerald"}`} style={{ fontSize: "10px" }}>
                          {log.category || "general"}
                        </span>
                      </td>
                      <td style={{ fontWeight: "600", fontSize: "12px" }}>
                        {log.action}
                      </td>
                      <td className="lf-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {log.ip_address || "127.0.0.1"}
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {log.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CREATE USER */}
      {/* ============================================================== */}
      {isCreateModalOpen && (
        <div className="lf-modal-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget && !submittingUser) setIsCreateModalOpen(false); }}>
          <div ref={adminDialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title" tabIndex={-1} className="lf-modal-card" style={{ maxWidth: "480px" }}>
            <div className="lf-modal-header">
              <h3 id="admin-dialog-title" className="lf-modal-title">Create New Team User</h3>
              <button type="button" disabled={submittingUser} className="lf-modal-close" aria-label="Close create user dialog" onClick={() => setIsCreateModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="lf-form-field">
                <label htmlFor="admin-field-1">Full Name</label>
                <input id="admin-field-1"
                  type="text"
                  className="lf-input"
                  placeholder="e.g. Sarah Jenkins"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  required
                />
              </div>

              <div className="lf-form-field">
                <label htmlFor="admin-field-2">Email Address</label>
                <input id="admin-field-2"
                  type="email"
                  className="lf-input"
                  placeholder="name@company.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  required
                />
              </div>

              <div className="lf-form-field">
                <label htmlFor="admin-field-3">Initial Password</label>
                <input id="admin-field-3"
                  type="password"
                  className="lf-input"
                  placeholder="At least 8 characters"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  required
                  minLength={8}
                />
              </div>

              <div className="lf-form-field">
                <label htmlFor="admin-field-4">System Role & Privileges</label>
                <select id="admin-field-4"
                  className="lf-input"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="user">💼 Leadgen Operations (Prospecting, CRM, Mailbox)</option>
                  <option value="superadmin">👑 Superadmin (Full System, Health & User Access)</option>
                </select>
              </div>

              <div className="lf-form-field">
                <label htmlFor="admin-field-5">Operator Notes (Optional)</label>
                <textarea id="admin-field-5"
                  className="lf-textarea"
                  placeholder="Add notes about user assignment, territory, etc."
                  value={newUser.notes}
                  onChange={(e) => setNewUser({ ...newUser, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" className="lf-btn-secondary" disabled={submittingUser} onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="lf-btn-primary" disabled={submittingUser}>
                  {submittingUser ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                  <span>Create Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EDIT USER */}
      {/* ============================================================== */}
      {isEditModalOpen && selectedUser && (
        <div className="lf-modal-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget && !submittingUser) setIsEditModalOpen(false); }}>
          <div ref={adminDialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title" tabIndex={-1} className="lf-modal-card" style={{ maxWidth: "480px" }}>
            <div className="lf-modal-header">
              <h3 id="admin-dialog-title" className="lf-modal-title">Edit User Profile: {selectedUser.email}</h3>
              <button type="button" disabled={submittingUser} className="lf-modal-close" aria-label="Close edit user dialog" onClick={() => setIsEditModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="lf-form-field">
                <label htmlFor="admin-field-6">Full Name</label>
                <input id="admin-field-6"
                  type="text"
                  className="lf-input"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  required
                />
              </div>

              <div className="lf-form-field">
                <label htmlFor="admin-field-7">System Role</label>
                <select id="admin-field-7"
                  className="lf-input"
                  value={editFormData.role}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                  disabled={selectedUser.email.toLowerCase() === currentUser?.email?.toLowerCase()}
                >
                  <option value="user">💼 Leadgen Operations</option>
                  <option value="superadmin">👑 Superadmin</option>
                </select>
              </div>

              <div className="lf-form-field">
                <label htmlFor="admin-field-8">Account Status</label>
                <select id="admin-field-8"
                  className="lf-input"
                  value={editFormData.status}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                  disabled={selectedUser.email.toLowerCase() === currentUser?.email?.toLowerCase()}
                >
                  <option value="active">Active (Access Granted)</option>
                  <option value="suspended">Suspended (Access Blocked)</option>
                </select>
              </div>

              <div className="lf-form-field">
                <label htmlFor="admin-field-9">Reset Password (Leave blank to keep unchanged)</label>
                <input id="admin-field-9"
                  type="password"
                  className="lf-input"
                  placeholder="Enter new password (optional)"
                  value={editFormData.newPassword}
                  onChange={(e) => setEditFormData({ ...editFormData, newPassword: e.target.value })}
                  minLength={8}
                />
              </div>

              <div className="lf-form-field">
                <label htmlFor="admin-field-10">Operator Notes</label>
                <textarea id="admin-field-10"
                  className="lf-textarea"
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" className="lf-btn-secondary" disabled={submittingUser} onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="lf-btn-primary" disabled={submittingUser}>
                  {submittingUser ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: DELETE CONFIRMATION */}
      {/* ============================================================== */}
      {isDeleteModalOpen && selectedUser && (
        <div className="lf-modal-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget && !submittingUser) setIsDeleteModalOpen(false); }}>
          <div ref={adminDialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title" tabIndex={-1} className="lf-modal-card" style={{ maxWidth: "420px" }}>
            <div className="lf-modal-header">
              <h3 id="admin-dialog-title" className="lf-modal-title" style={{ color: "#dc2626" }}>Delete User Account</h3>
              <button type="button" disabled={submittingUser} className="lf-modal-close" aria-label="Close delete user dialog" onClick={() => setIsDeleteModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              Are you sure you want to permanently delete <strong>{selectedUser.name}</strong> ({selectedUser.email})?
              This user will lose access immediately. Their owned leads, searches, outreach and linked mailbox records will be permanently deleted. Older unassigned records remain shared. Security audit logs are retained.
            </p>

            <label style={{ display: "block", fontSize: 13, marginTop: 12 }}>Type {selectedUser.email} to confirm<input className="lf-input" value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} disabled={submittingUser} autoComplete="off" /></label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button type="button" className="lf-btn-secondary" disabled={submittingUser} onClick={() => setIsDeleteModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="lf-btn-primary"
                disabled={submittingUser || deleteConfirmation.trim().toLowerCase() !== selectedUser.email.toLowerCase()}
                onClick={handleDeleteUser}
                style={{ background: "#dc2626", borderColor: "#dc2626" }}
              >
                <Trash2 size={14} />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
