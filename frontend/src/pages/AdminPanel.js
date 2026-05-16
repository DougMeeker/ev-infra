/**
 * Admin Panel – user role management.
 *
 * Lists all Authelia users and their current role assignments.
 * Admins can create, edit, and delete role assignments.
 *
 * Roles:
 *   admin    – full access
 *   hq       – read/write all sites
 *   district – read/write sites in their district number
 *   site     – read/write one specific site
 *   fom      – Fleet Optimization Manager; edit vehicles in their district
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import AsyncCombo from "../components/AsyncCombo";
import {
  adminListUsers,
  adminListRoles,
  adminCreateRole,
  adminUpdateRole,
  adminDeleteRole,
  getAggregateMetrics,
  getSites,
} from "../api";

const ROLES = ["admin", "hq", "district", "site", "fom"];

const ROLE_COLORS = {
  admin:    { bg: "#fde8d8", text: "#b94a00" },
  hq:       { bg: "#e8f0fe", text: "#1a56cc" },
  district: { bg: "#e6f4ea", text: "#1a7340" },
  site:     { bg: "#f3e8fd", text: "#6b2fa0" },
  fom:      { bg: "#fff3cd", text: "#856404" },
};

const badge = (role) => {
  const c = ROLE_COLORS[role] || { bg: "#eee", text: "#333" };
  return (
    <span style={{
      background: c.bg, color: c.text,
      borderRadius: "4px", padding: "2px 8px",
      fontSize: "0.78rem", fontWeight: 600,
    }}>
      {role}
    </span>
  );
};

const EMPTY_FORM = { username: "", role: "hq", district: "", site_id: "", site_name: "" };

export default function AdminPanel() {
  const [roles,   setRoles]   = useState([]);   // UserRole rows
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const allSitesCacheRef = useRef(null);

  // Form state
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [editingId,  setEditingId]  = useState(null); // null = create, number = update
  const [formError,  setFormError]  = useState("");
  const [formBusy,   setFormBusy]   = useState(false);
  const [showForm,   setShowForm]   = useState(false);

  // ── Load data ──────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rRes = await adminListRoles();
      setRoles(rRes.data);
    } catch (e) {
      setError(e.response?.data?.error || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // ── Role lookup by username ────────────────────────────────────────
  const roleFor = (username) => roles.find((r) => r.username === username);

  // ── Open form for create or edit ──────────────────────────────────
  const openCreate = (username) => {
    setForm({ ...EMPTY_FORM, username: username || "" });
    setEditingId(null);
    setFormError("");
    setShowForm(true);
  };

  const loadSiteOptions = useCallback(async (q) => {
    const query = (q || '').trim();
    if (!query || query.length < 2) return [];
    try {
      const { data } = await getAggregateMetrics({ search: query, limit: 50 });
      const items = Array.isArray(data?.data) ? data.data : [];
      let opts = items.map(s => ({ id: s.site_id ?? s.id, name: s.name, address: s.address, city: s.city }));
      if (opts.length === 0) {
        if (!allSitesCacheRef.current) {
          const { data: all } = await getSites();
          allSitesCacheRef.current = Array.isArray(all) ? all : [];
        }
        const qLower = query.toLowerCase();
        opts = allSitesCacheRef.current
          .filter(s =>
            (s.name && s.name.toLowerCase().includes(qLower)) ||
            (s.address && s.address.toLowerCase().includes(qLower)) ||
            (s.city && s.city.toLowerCase().includes(qLower)) ||
            (s.department_id && String(s.department_id).toLowerCase().includes(qLower))
          )
          .slice(0, 50)
          .map(s => ({ id: s.id, name: s.name, address: s.address, city: s.city }));
      }
      opts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return opts;
    } catch {
      return [];
    }
  }, []);

  const openEdit = (row) => {
    setForm({
      username:  row.username,
      role:      row.role,
      district:  row.district != null ? String(row.district) : "",
      site_id:   row.site_id  != null ? String(row.site_id)  : "",
      site_name: row.site_name || "",
    });
    setEditingId(row.id);
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); };

  // ── Submit ─────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormBusy(true);

    const payload = { username: form.username.trim(), role: form.role };
    if (form.role === "district") {
      if (!form.district) { setFormError("District number is required"); setFormBusy(false); return; }
      payload.district = parseInt(form.district, 10);
    }
    if (form.role === "site") {
      if (!form.site_id) { setFormError("Please select a site from the search results"); setFormBusy(false); return; }
      payload.site_id = parseInt(form.site_id, 10);
    }

    try {
      if (editingId != null) {
        await adminUpdateRole(editingId, payload);
      } else {
        await adminCreateRole(payload);
      }
      closeForm();
      await reload();
    } catch (e) {
      setFormError(e.response?.data?.error || "Save failed");
    } finally {
      setFormBusy(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────
  const handleDelete = async (id, username) => {
    if (!window.confirm(`Remove role assignment for "${username}"?`)) return;
    try {
      await adminDeleteRole(id);
      await reload();
    } catch (e) {
      alert(e.response?.data?.error || "Delete failed");
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────
  const card = {
    background: "var(--card)",
    border: "1px solid var(--card-border)",
    borderRadius: "8px",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  };
  const th = {
    textAlign: "left",
    padding: "8px 12px",
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--text-secondary, #666)",
    borderBottom: "1px solid var(--card-border)",
    whiteSpace: "nowrap",
  };
  const td = {
    padding: "8px 12px",
    fontSize: "0.88rem",
    borderBottom: "1px solid var(--card-border)",
    verticalAlign: "middle",
  };
  const inputStyle = {
    width: "100%",
    padding: "7px 10px",
    borderRadius: "4px",
    border: "1px solid var(--card-border, #ccc)",
    background: "var(--input-bg, #fff)",
    color: "var(--text)",
    fontSize: "0.9rem",
    boxSizing: "border-box",
  };
  const btnPrimary = {
    background: "var(--primary, #1a73e8)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    padding: "7px 16px",
    cursor: "pointer",
    fontSize: "0.88rem",
    fontWeight: 500,
  };
  const btnSecondary = {
    background: "transparent",
    color: "var(--link, #1a73e8)",
    border: "1px solid var(--card-border, #ccc)",
    borderRadius: "4px",
    padding: "5px 12px",
    cursor: "pointer",
    fontSize: "0.85rem",
  };
  const btnDanger = {
    background: "transparent",
    color: "#b00020",
    border: "1px solid #f5c6c6",
    borderRadius: "4px",
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: "0.82rem",
  };

  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>;
  if (error)   return <div style={{ padding: "2rem", color: "#b00020" }}>{error}</div>;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <h2 style={{ marginBottom: "1.5rem" }}>User &amp; Role Management</h2>

      {/* ── Role assignment form (modal-like inline) ─────────────── */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1200,
        }}>
          <div style={{
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: "10px",
            padding: "1.75rem",
            width: "100%",
            maxWidth: 420,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            <h3 style={{ marginTop: 0, marginBottom: "1.25rem" }}>
              {editingId != null ? "Edit role assignment" : "Assign role"}
            </h3>

            {formError && (
              <div style={{ background: "#fde8e8", border: "1px solid #f5c6c6", borderRadius: 4, padding: "8px 12px", marginBottom: "1rem", color: "#b00020", fontSize: "0.88rem" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* Username */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 500, marginBottom: 4, color: "var(--text-secondary, #555)" }}>
                  Username
                </label>
                {editingId != null ? (
                  <div style={{ padding: "7px 10px", background: "var(--input-bg)", border: "1px solid var(--card-border)", borderRadius: 4, fontSize: "0.9rem" }}>
                    {form.username}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    required
                    placeholder="AD username (sAMAccountName)"
                    style={inputStyle}
                  />
                )}
              </div>

              {/* Role */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 500, marginBottom: 4, color: "var(--text-secondary, #555)" }}>
                  Role
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, district: "", site_id: "" }))}
                  style={inputStyle}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* District (role=district or role=fom) */}
              {(form.role === "district" || form.role === "fom") && (
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 500, marginBottom: 4, color: "var(--text-secondary, #555)" }}>
                    District number
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={form.district}
                    onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                    required
                    placeholder="e.g. 3"
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Site (role=site) */}
              {form.role === "site" && (
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 500, marginBottom: 4, color: "var(--text-secondary, #555)" }}>
                    Site
                  </label>
                  <AsyncCombo
                    value={form.site_name}
                    onChangeOption={(opt) => setForm((f) => ({ ...f, site_id: String(opt.id), site_name: opt.name }))}
                    onInputChange={(text) => {
                      if ((text || '').trim() !== (form.site_name || '').trim()) {
                        setForm((f) => ({ ...f, site_id: '', site_name: text || '' }));
                      }
                    }}
                    loadOptions={loadSiteOptions}
                    placeholder="Search by name, address, or dept ID"
                  />
                  {!form.site_id && (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary, #888)", marginTop: 3 }}>
                      Type at least 2 characters to search
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", marginTop: "1.25rem" }}>
                <button type="submit" disabled={formBusy} style={btnPrimary}>
                  {formBusy ? "Saving…" : editingId != null ? "Update" : "Assign"}
                </button>
                <button type="button" onClick={closeForm} style={btnSecondary}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Users table ──────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0 }}>Users</h3>
          <button style={btnPrimary} onClick={() => openCreate("")}>+ Assign role</button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Username</th>
                <th style={th}>Display name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Scope</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const r = roleFor(u.username);
                return (
                  <tr key={u.username}>
                    <td style={td}><code style={{ fontSize: "0.85rem" }}>{u.username}</code></td>
                    <td style={td}>{u.displayname || "—"}</td>
                    <td style={td}>{u.email || "—"}</td>
                    <td style={td}>{r ? badge(r.role) : <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>none</span>}</td>
                    <td style={td}>
                      {r && r.role === "district" && `District ${r.district}`}
                      {r && r.role === "site" && (r.site_name || `Site #${r.site_id}`)}
                    </td>
                    <td style={td}>
                      {r ? (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button style={btnSecondary} onClick={() => openEdit(r)}>Edit</button>
                          <button style={btnDanger}    onClick={() => handleDelete(r.id, u.username)}>Remove</button>
                        </div>
                      ) : (
                        <button style={btnSecondary} onClick={() => openCreate(u.username)}>Assign</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--text-secondary)" }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── All assignments table ─────────────────────────────────── */}
      {roles.length > 0 && (
        <div style={card}>
          <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>All role assignments</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Username</th>
                  <th style={th}>Role</th>
                  <th style={th}>District</th>
                  <th style={th}>Site</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td style={td}><code style={{ fontSize: "0.85rem" }}>{r.username}</code></td>
                    <td style={td}>{badge(r.role)}</td>
                    <td style={td}>{r.district != null ? r.district : "—"}</td>
                    <td style={td}>{r.site_name || (r.site_id != null ? `#${r.site_id}` : "—")}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button style={btnSecondary} onClick={() => openEdit(r)}>Edit</button>
                        <button style={btnDanger}    onClick={() => handleDelete(r.id, r.username)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
