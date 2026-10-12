import React, { useState, useEffect } from "react";
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
  Eye,
  EyeOff,
} from "lucide-react";
import { apiFetch as fetch } from "../api.js";

export default function SuperadminView({ currentUser, onNotify }) {
  const [activeTab, setActiveTab] = useState("system"); // 'system', 'users', 'audit'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // System Health state
  const [healthData, setHealthData] = useState(null);
  const [testingService, setTestingService] = useState(null);
  const [testResults, setTestResults] = useState({});

  // Users state
  const [usersList, setUsersList] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
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

  // Fetch all Superadmin data
  const loadAdminData = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [healthRes, usersRes, logsRes] = await Promise.all([
        fetch("/api/admin/system/health"),
        fetch("/api/admin/users"),
        fetch("/api/admin/audit-logs?limit=50"),
      ]);

      if (healthRes.ok) setHealthData(await healthRes.json());
      if (usersRes.ok) {
        const u = await usersRes.json();
        setUsersList(u.users || []);
      }
      if (logsRes.ok) {
        const l = await logsRes.json();
        setAuditLogs(l.logs || []);
      }
    } catch (err) {
      if (onNotify) {
        onNotify({
          type: "error",
          title: "Admin Data Error",
          text: err.message || "Failed to load superadmin metrics.",
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // Test individual service connection
  const handleTestConnection = async (serviceKey) => {
    setTestingService(serviceKey);
    try {
      const res = await fetch("/api/admin/system/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceKey }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [serviceKey]: data,
      }));
      if (onNotify) {
        onNotify({
          type: data.ok ? "success" : "warning",
          title: `${serviceKey.toUpperCase()} Diagnostic`,
          text: data.ok
            ? `${data.message} (${data.latency}ms)`
            : `Connection check failed: ${data.error || "Error"}`,
        });
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [serviceKey]: { ok: false, error: err.message },
      }));
    } finally {
      setTestingService(null);
    }
  };

  // Reset Hunter Quota flag
  const handleResetHunterQuota = async () => {
    try {
      const res = await fetch("/api/admin/system/reset-hunter-quota", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        if (onNotify) {
          onNotify({
            type: "success",
            title: "Quota Flag Reset",
            text: data.message,
          });
        }
        loadAdminData(true);
      }
    } catch (err) {
      if (onNotify) onNotify({ type: "error", title: "Action Failed", text: err.message });
    }
  };

  // Reset Daily Quota usage counters
  const handleResetDailyUsage = async (type) => {
    try {
      const res = await fetch("/api/admin/system/reset-daily-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (res.ok) {
        if (onNotify) {
          onNotify({
            type: "success",
            title: "Usage Counter Reset",
            text: data.message,
          });
        }
        loadAdminData(true);
      }
    } catch (err) {
      if (onNotify) onNotify({ type: "error", title: "Action Failed", text: err.message });
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
      loadAdminData(true);
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
      if (editFormData.newPassword.trim()) {
        payload.password = editFormData.newPassword.trim();
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
      loadAdminData(true);
    } catch (err) {
      if (onNotify) onNotify({ type: "error", title: "Update Error", text: err.message });
    } finally {
      setSubmittingUser(false);
    }
  };

  // Delete User
  const handleDeleteUser = async (user) => {
    if (user.email === currentUser?.email) {
      if (onNotify) {
        onNotify({
          type: "warning",
          title: "Action Forbidden",
          text: "You cannot delete your own active superadmin account.",
        });
      }
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete user "${user.email}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user.");

      if (onNotify) {
        onNotify({
          type: "success",
          title: "User Deleted",
          text: `User ${user.email} removed from system.`,
        });
      }
      loadAdminData(true);
    } catch (err) {
      if (onNotify) onNotify({ type: "error", title: "Delete Error", text: err.message });
    }
  };

  const formatUptime = (sec = 0) => {
    const d = Math.floor(sec / (3600 * 24));
    const h = Math.floor((sec % (3600 * 24)) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${d > 0 ? `${d}d ` : ""}${h}h ${m}m`;
  };

  return (
    <div className="lf-view-container lf-animate-fade">
      {/* Superadmin Top Banner */}
      <div className="lf-section-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="lf-badge-pill purple" style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <ShieldAlert size={12} />
              <span>SUPERADMINISTRATION CONSOLE</span>
            </span>
            <span className="lf-badge-pill emerald">
              Signed in as: {currentUser?.email || "Superadmin"}
            </span>
          </div>
          <h2 className="lf-section-title" style={{ marginTop: "6px" }}>
            System Infrastructure & Access Control
          </h2>
          <p className="lf-section-subtitle">
            Master operations control for SpiceCoast application health, API quotas, diagnostics, user privileges, and audit tracking.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            className="lf-btn-secondary sm"
            onClick={() => loadAdminData()}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? "spin" : ""} />
            <span>Refresh Diagnostics</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="lf-admin-tabs-row" style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-card)", marginBottom: "20px" }}>
        <button
          type="button"
          className={`lf-admin-tab-btn ${activeTab === "system" ? "active" : ""}`}
          onClick={() => setActiveTab("system")}
        >
          <Server size={15} />
          <span>System Health & Diagnostics</span>
        </button>
        <button
          type="button"
          className={`lf-admin-tab-btn ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          <Users size={15} />
          <span>User Access Management ({usersList.length})</span>
        </button>
        <button
          type="button"
          className={`lf-admin-tab-btn ${activeTab === "audit" ? "active" : ""}`}
          onClick={() => setActiveTab("audit")}
        >
          <Activity size={15} />
          <span>Audit Logs & Security</span>
        </button>
      </div>

      {/* TAB 1: SYSTEM HEALTH & INTEGRATIONS */}
      {activeTab === "system" && (
        <div className="lf-admin-system-grid">
          {/* Top Quick Stats */}
          <div className="lf-stat-grid" style={{ marginBottom: "20px" }}>
            <div className="lf-stat-card">
              <div className="lf-stat-top">
                <span className="lf-stat-label">System Uptime</span>
                <Clock size={16} className="text-amber" />
              </div>
              <div className="lf-stat-val lf-mono">
                {formatUptime(healthData?.server_uptime)}
              </div>
              <div className="lf-stat-desc">Node.js {healthData?.system?.nodeVersion} • {healthData?.system?.platform}</div>
            </div>

            <div className="lf-stat-card">
              <div className="lf-stat-top">
                <span className="lf-stat-label">Active Discovery Engine</span>
                <Sliders size={16} className="text-purple" />
              </div>
              <div className="lf-stat-val" style={{ fontSize: "18px" }}>
                {healthData?.discovery_engine === "hunter" ? "⚡ Hunter.io Native" : "🌐 Google Places Scraper"}
              </div>
              <div className="lf-stat-desc">
                {healthData?.discovery_engine === "hunter" ? "Direct Corporate Discovery" : "Places Seed + Inbuilt Scraper"}
              </div>
            </div>

            <div className="lf-stat-card">
              <div className="lf-stat-top">
                <span className="lf-stat-label">Memory Utilization</span>
                <Cpu size={16} className="text-emerald" />
              </div>
              <div className="lf-stat-val lf-mono">
                {healthData?.system?.memory?.heapUsedMb || 0} MB
              </div>
              <div className="lf-stat-desc">RSS: {healthData?.system?.memory?.rssMb || 0} MB • Total Heap: {healthData?.system?.memory?.heapTotalMb || 0} MB</div>
            </div>

            <div className="lf-stat-card">
              <div className="lf-stat-top">
                <span className="lf-stat-label">SQLite Storage Health</span>
                <Database size={16} className="text-blue" />
              </div>
              <div className="lf-stat-val lf-mono">
                {healthData?.system?.database?.sizeFormatted || "—"}
              </div>
              <div className="lf-stat-desc">{healthData?.system?.database?.tables?.leads || 0} Leads in CRM • WAL Active</div>
            </div>
          </div>

          {/* Integration Status & Live Test Diagnostic Matrix */}
          <div className="lf-panel" style={{ padding: "20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>
                  Core Services & API Integrations
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                  Run live connection pings to verify external provider keys, latency, and endpoints.
                </p>
              </div>
            </div>

            <div className="lf-admin-integrations-table-wrap">
              <table className="lf-data-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Service / Endpoint</th>
                    <th>Configured Role</th>
                    <th>Status</th>
                    <th>Runtime State</th>
                    <th style={{ textAlign: "right" }}>Diagnostic Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Google Places API */}
                  <tr>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "600" }}>
                        <Globe size={16} className="text-blue" />
                        <span>Google Places API (New)</span>
                      </div>
                    </td>
                    <td>Geospatial Discovery & Entity Search</td>
                    <td>
                      <span className={`lf-status-pill ${healthData?.integrations?.google_places?.configured ? "online" : "offline"}`}>
                        {healthData?.integrations?.google_places?.configured ? "Configured" : "Missing Key"}
                      </span>
                    </td>
                    <td className="lf-text-muted" style={{ fontSize: "12px" }}>
                      {healthData?.integrations?.google_places?.details}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="lf-btn-secondary sm"
                        onClick={() => handleTestConnection("google_places")}
                        disabled={testingService === "google_places"}
                      >
                        {testingService === "google_places" ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <Zap size={13} />
                        )}
                        <span>Test Ping</span>
                      </button>
                    </td>
                  </tr>

                  {/* Hunter.io API */}
                  <tr>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "600" }}>
                        <Zap size={16} className="text-purple" />
                        <span>Hunter.io Native Discovery API</span>
                      </div>
                    </td>
                    <td>Company Discovery & Executive Emails</td>
                    <td>
                      <span className={`lf-status-pill ${healthData?.integrations?.hunter_io?.quota_exceeded ? "warning" : healthData?.integrations?.hunter_io?.configured ? "online" : "offline"}`}>
                        {healthData?.integrations?.hunter_io?.quota_exceeded
                          ? "Quota Limit"
                          : healthData?.integrations?.hunter_io?.configured
                          ? "Ready"
                          : "Unconfigured"}
                      </span>
                    </td>
                    <td className="lf-text-muted" style={{ fontSize: "12px" }}>
                      {healthData?.integrations?.hunter_io?.details}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="lf-btn-secondary sm"
                        onClick={() => handleTestConnection("hunter")}
                        disabled={testingService === "hunter"}
                      >
                        {testingService === "hunter" ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <Zap size={13} />
                        )}
                        <span>Test Ping</span>
                      </button>
                    </td>
                  </tr>

                  {/* DeepSeek AI */}
                  <tr>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "600" }}>
                        <Bot size={16} className="text-amber" />
                        <span>DeepSeek AI ({healthData?.integrations?.deepseek_ai?.model})</span>
                      </div>
                    </td>
                    <td>Autonomous Pitch Synthesis & Intent Extraction</td>
                    <td>
                      <span className={`lf-status-pill ${healthData?.integrations?.deepseek_ai?.configured ? "online" : "offline"}`}>
                        {healthData?.integrations?.deepseek_ai?.configured ? "Active" : "Fallback Template"}
                      </span>
                    </td>
                    <td className="lf-text-muted" style={{ fontSize: "12px" }}>
                      {healthData?.integrations?.deepseek_ai?.details}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="lf-btn-secondary sm"
                        onClick={() => handleTestConnection("deepseek")}
                        disabled={testingService === "deepseek"}
                      >
                        {testingService === "deepseek" ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <Zap size={13} />
                        )}
                        <span>Test Ping</span>
                      </button>
                    </td>
                  </tr>

                  {/* Hostinger Mailbox */}
                  <tr>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "600" }}>
                        <Mail size={16} className="text-emerald" />
                        <span>Hostinger Mailbox API</span>
                      </div>
                    </td>
                    <td>B2B Mail Delivery ({healthData?.integrations?.hostinger_mail?.mailbox})</td>
                    <td>
                      <span className={`lf-status-pill ${healthData?.integrations?.hostinger_mail?.configured ? "online" : "offline"}`}>
                        {healthData?.integrations?.hostinger_mail?.configured ? "Live Dispatch" : "Simulation"}
                      </span>
                    </td>
                    <td className="lf-text-muted" style={{ fontSize: "12px" }}>
                      {healthData?.integrations?.hostinger_mail?.details}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className="lf-badge-pill default sm">Bound to Hostinger</span>
                    </td>
                  </tr>

                  {/* SQLite Database */}
                  <tr>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "600" }}>
                        <Database size={16} className="text-blue" />
                        <span>SQLite Embedded Database</span>
                      </div>
                    </td>
                    <td>Atomic CRM Storage & WAL Transaction Log</td>
                    <td>
                      <span className="lf-status-pill online">Healthy</span>
                    </td>
                    <td className="lf-text-muted" style={{ fontSize: "12px" }}>
                      {healthData?.system?.database?.path}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="lf-btn-secondary sm"
                        onClick={() => handleTestConnection("sqlite")}
                        disabled={testingService === "sqlite"}
                      >
                        <span>Verify Integrity</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Maintenance & Emergency Controls */}
          <div className="lf-panel" style={{ padding: "20px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 12px 0", color: "var(--text-main)" }}>
              Quota Management & Maintenance Actions
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
              Superadmin privileges to clear locks, reset monthly flags, and manage daily automated thresholds.
            </p>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="lf-btn-secondary"
                onClick={handleResetHunterQuota}
                title="Clears Hunter quota exceeded flag so that Hunter.io API will be retried on next search."
              >
                <RotateCcw size={14} className="text-purple" />
                <span>Reset Hunter.io Quota Flag</span>
              </button>

              <button
                type="button"
                className="lf-btn-secondary"
                onClick={() => handleResetDailyUsage("leads")}
                title="Resets today's lead discovery counter back to 0."
              >
                <RotateCcw size={14} className="text-amber" />
                <span>Reset Daily Lead Count (Currently {healthData?.quotas?.leads_harvested}/{healthData?.quotas?.leads_limit})</span>
              </button>

              <button
                type="button"
                className="lf-btn-secondary"
                onClick={() => handleResetDailyUsage("replies")}
                title="Resets today's automated reply counter back to 0."
              >
                <RotateCcw size={14} className="text-emerald" />
                <span>Reset Daily Reply Count (Currently {healthData?.quotas?.replies_dispatched}/{healthData?.quotas?.replies_limit})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USER ACCESS MANAGEMENT */}
      {activeTab === "users" && (
        <div className="lf-admin-users-panel lf-panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h3 style={{ fontSize: "17px", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>
                User Access & Security Management
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                Manage team logins. SpiceCoast leadgen users can execute discovery and outreach. Superadmins manage the entire system.
              </p>
            </div>

            <button
              type="button"
              className="lf-btn-primary sm"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus size={15} />
              <span>Invite New User</span>
            </button>
          </div>

          {/* Users Table */}
          <div className="lf-table-container">
            <table className="lf-data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>User / Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Account Status</th>
                  <th>Last Sign-In</th>
                  <th>Created Date</th>
                  <th>Notes</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map((user) => {
                  const isCurrent = user.email === currentUser?.email;
                  const isSuperadmin = user.role === "superadmin";
                  return (
                    <tr key={user.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              background: isSuperadmin ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "linear-gradient(135deg, #d97706, #b45309)",
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: "600",
                              fontSize: "13px",
                            }}
                          >
                            {(user.name || user.email).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: "600", color: "var(--text-main)" }}>
                              {user.name} {isCurrent && <span className="lf-badge-pill default sm" style={{ marginLeft: "5px" }}>You</span>}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>ID: {user.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="lf-mono" style={{ fontSize: "13px" }}>{user.email}</td>
                      <td>
                        <span className={`lf-badge-pill ${isSuperadmin ? "purple" : "amber"}`}>
                          {isSuperadmin ? "👑 Superadmin" : "💼 Lead Operations"}
                        </span>
                      </td>
                      <td>
                        <span className={`lf-status-pill ${user.status === "active" ? "online" : "offline"}`}>
                          {user.status === "active" ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {user.created_at ? user.created_at.slice(0, 10) : "—"}
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {user.notes || "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="lf-btn-icon sm"
                            onClick={() => openEditUser(user)}
                            title="Edit user role, status or password"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            className="lf-btn-icon sm text-red"
                            onClick={() => handleDeleteUser(user)}
                            disabled={isCurrent}
                            title={isCurrent ? "You cannot delete your own account" : "Delete user"}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT LOGS */}
      {activeTab === "audit" && (
        <div className="lf-panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>
                Security & Operational Audit Trail
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                Immutable event stream tracking user authentication, lead searches, quota resets, and system changes.
              </p>
            </div>
          </div>

          <div className="lf-table-container">
            <table className="lf-data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor / Email</th>
                  <th>Action</th>
                  <th>Category</th>
                  <th>Event Details</th>
                  <th>Origin IP</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="lf-mono" style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: "500", fontSize: "13px" }}>{log.user_email}</td>
                    <td>
                      <span className="lf-badge-pill default sm lf-mono">{log.action}</span>
                    </td>
                    <td>
                      <span className={`lf-badge-pill sm ${log.category === "admin" ? "purple" : log.category === "auth" ? "blue" : "emerald"}`}>
                        {log.category}
                      </span>
                    </td>
                    <td style={{ fontSize: "12px", color: "var(--text-main)" }}>{log.details}</td>
                    <td className="lf-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {log.ip_address || "internal"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {isCreateModalOpen && (
        <div className="lf-modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div className="lf-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="lf-modal-header">
              <h3 className="lf-modal-title">Create / Invite User</h3>
              <button type="button" className="lf-modal-close" onClick={() => setIsCreateModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateUser} style={{ padding: "20px" }}>
              <div className="lf-form-field" style={{ marginBottom: "14px" }}>
                <label>User Full Name</label>
                <input
                  type="text"
                  className="lf-input"
                  placeholder="e.g. Sarah Jenkins"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  required
                />
              </div>

              <div className="lf-form-field" style={{ marginBottom: "14px" }}>
                <label>Corporate Email Address</label>
                <input
                  type="email"
                  className="lf-input"
                  placeholder="name@thespicecoast.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  required
                />
              </div>

              <div className="lf-form-field" style={{ marginBottom: "14px" }}>
                <label>Initial Password (Min 8 chars)</label>
                <input
                  type="password"
                  className="lf-input"
                  placeholder="••••••••••••"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  required
                  minLength={8}
                />
              </div>

              <div className="lf-form-field" style={{ marginBottom: "14px" }}>
                <label>System Role & Permissions</label>
                <select
                  className="lf-input"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="user">SpiceCoast User (Lead Discovery, CRM & Outreach)</option>
                  <option value="superadmin">Superadmin (Full System Access & User Admin)</option>
                </select>
              </div>

              <div className="lf-form-field" style={{ marginBottom: "20px" }}>
                <label>Notes (Optional)</label>
                <input
                  type="text"
                  className="lf-input"
                  placeholder="e.g. Lead Generation Specialist - Europe"
                  value={newUser.notes}
                  onChange={(e) => setNewUser({ ...newUser, notes: e.target.value })}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="lf-btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="lf-btn-primary" disabled={submittingUser}>
                  {submittingUser ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                  <span>Create User</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {isEditModalOpen && selectedUser && (
        <div className="lf-modal-backdrop" onClick={() => setIsEditModalOpen(false)}>
          <div className="lf-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="lf-modal-header">
              <h3 className="lf-modal-title">Edit User Access: {selectedUser.email}</h3>
              <button type="button" className="lf-modal-close" onClick={() => setIsEditModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveEditUser} style={{ padding: "20px" }}>
              <div className="lf-form-field" style={{ marginBottom: "14px" }}>
                <label>Full Name</label>
                <input
                  type="text"
                  className="lf-input"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  required
                />
              </div>

              <div className="lf-form-field" style={{ marginBottom: "14px" }}>
                <label>Role</label>
                <select
                  className="lf-input"
                  value={editFormData.role}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                >
                  <option value="user">SpiceCoast User (Lead Operations)</option>
                  <option value="superadmin">Superadmin (Full Control)</option>
                </select>
              </div>

              <div className="lf-form-field" style={{ marginBottom: "14px" }}>
                <label>Account Status</label>
                <select
                  className="lf-input"
                  value={editFormData.status}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                >
                  <option value="active">Active (Permit sign-in)</option>
                  <option value="suspended">Suspended (Block sign-in)</option>
                </select>
              </div>

              <div className="lf-form-field" style={{ marginBottom: "14px" }}>
                <label>Reset Password (leave empty to keep current password)</label>
                <input
                  type="password"
                  className="lf-input"
                  placeholder="New password (min 8 chars)"
                  value={editFormData.newPassword}
                  onChange={(e) => setEditFormData({ ...editFormData, newPassword: e.target.value })}
                />
              </div>

              <div className="lf-form-field" style={{ marginBottom: "20px" }}>
                <label>Notes</label>
                <input
                  type="text"
                  className="lf-input"
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="lf-btn-secondary"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="lf-btn-primary" disabled={submittingUser}>
                  {submittingUser ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
