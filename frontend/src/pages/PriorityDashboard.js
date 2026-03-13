import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getPriorityScores,
  getInvestigationList,
  recalculatePriorities,
  getWeightProfiles,
  createWeightProfile,
  updateWeightProfile,
  deleteWeightProfile,
  exportPriorityScoresCsv,
  exportInvestigationCsv,
} from "../api";

const DIMENSION_LABELS = {
  vehicle_count_score: "Vehicle Count",
  annual_miles_score: "Annual Miles",
  electrical_headroom_score: "Elec. Headroom",
  charger_gap_score: "Charger Gap",
  project_readiness_score: "Project Readiness",
  energy_demand_score: "Energy Demand",
  data_completeness_score: "Data Completeness",
};

const WEIGHT_FIELDS = [
  { key: "vehicle_count_w", label: "Vehicle Count" },
  { key: "annual_miles_w", label: "Annual Miles" },
  { key: "electrical_headroom_w", label: "Elec. Headroom" },
  { key: "charger_gap_w", label: "Charger Gap" },
  { key: "project_readiness_w", label: "Project Readiness" },
  { key: "energy_demand_w", label: "Energy Demand" },
  { key: "data_completeness_w", label: "Data Completeness" },
];

const PriorityDashboard = () => {
  const [tab, setTab] = useState("design"); // design | investigation
  const [scores, setScores] = useState([]);
  const [investigation, setInvestigation] = useState([]);
  const [meta, setMeta] = useState(null);
  const [invMeta, setInvMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [invPage, setInvPage] = useState(1);
  const [perPage] = useState(25);
  const [sort, setSort] = useState("composite_score");
  const [order, setOrder] = useState("desc");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [district, setDistrict] = useState("");
  const [minScore, setMinScore] = useState("");
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [selectedSite, setSelectedSite] = useState(null);

  // Weight profiles
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [showWeightEditor, setShowWeightEditor] = useState(false);
  const [editWeights, setEditWeights] = useState({});
  const [editProfileName, setEditProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Load weight profiles on mount
  useEffect(() => {
    getWeightProfiles().then((res) => {
      setProfiles(res.data);
      if (res.data.length > 0 && !activeProfile) {
        setActiveProfile(res.data[0]);
        setEditWeights(res.data[0]);
        setEditProfileName(res.data[0].name);
      }
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchScores = useCallback(() => {
    setLoading(true);
    getPriorityScores({
      page, perPage, sort, order,
      district: district || undefined,
      minScore: minScore || undefined,
      search: search || undefined,
      weightProfileId: activeProfile?.id,
    })
      .then((res) => { setScores(res.data.items); setMeta(res.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, perPage, sort, order, district, minScore, search, activeProfile]);

  const fetchInvestigation = useCallback(() => {
    setLoading(true);
    getInvestigationList({
      page: invPage, perPage,
      district: district || undefined,
      search: search || undefined,
    })
      .then((res) => { setInvestigation(res.data.items); setInvMeta(res.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [invPage, perPage, district, search]);

  useEffect(() => {
    if (tab === "design") fetchScores();
    else fetchInvestigation();
  }, [tab, fetchScores, fetchInvestigation]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await recalculatePriorities(activeProfile?.id);
      if (tab === "design") fetchScores();
      else fetchInvestigation();
    } catch (e) {
      console.error(e);
    } finally {
      setRecalculating(false);
    }
  };

  const handleSort = (col) => {
    if (sort === col) setOrder(order === "desc" ? "asc" : "desc");
    else { setSort(col); setOrder("desc"); }
    setPage(1);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
    setInvPage(1);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const payload = {};
      WEIGHT_FIELDS.forEach(({ key }) => { payload[key] = editWeights[key]; });
      if (activeProfile && editProfileName === activeProfile.name) {
        const res = await updateWeightProfile(activeProfile.id, payload);
        setActiveProfile(res.data);
        setProfiles((prev) => prev.map((p) => (p.id === res.data.id ? res.data : p)));
      } else {
        payload.name = editProfileName;
        const res = await createWeightProfile(payload);
        setActiveProfile(res.data);
        setProfiles((prev) => [...prev, res.data]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteProfile = async (id) => {
    if (!window.confirm("Delete this weight profile?")) return;
    try {
      await deleteWeightProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (activeProfile?.id === id) {
        const fallback = profiles.find((p) => p.id !== id);
        setActiveProfile(fallback || null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sortArrow = (col) => (sort === col ? (order === "desc" ? " ▼" : " ▲") : "");

  const renderScoreBar = (val, max = 100) => {
    const pct = val != null ? Math.max(0, Math.min(100, (val / max) * 100)) : 0;
    return (
      <div style={{ background: "#e0e0e0", borderRadius: 4, height: 8, width: 60, display: "inline-block", verticalAlign: "middle" }}>
        <div style={{ background: val == null ? "#999" : "#4caf50", width: `${pct}%`, height: "100%", borderRadius: 4 }} />
      </div>
    );
  };

  return (
    <div className="container" style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Site Prioritization</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleRecalculate} disabled={recalculating} className="btn btn-primary">
            {recalculating ? "Recalculating…" : "Recalculate Scores"}
          </button>
          <button onClick={() => setShowWeightEditor(!showWeightEditor)} className="btn">
            {showWeightEditor ? "Hide Weights" : "Edit Weights"}
          </button>
        </div>
      </div>

      {/* Weight editor */}
      {showWeightEditor && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Weight Profile</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {profiles.map((p) => (
              <span key={p.id} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <button
                  className={`btn btn-sm ${activeProfile?.id === p.id ? "btn-primary" : ""}`}
                  onClick={() => { setActiveProfile(p); setEditWeights(p); setEditProfileName(p.name); }}
                >
                  {p.name}
                </button>
                {p.name !== "Default" && (
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteProfile(p.id)} title="Delete">×</button>
                )}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
            <div>
              <label className="label-sm">Profile Name</label>
              <input value={editProfileName} onChange={(e) => setEditProfileName(e.target.value)} className="input-sm" style={{ width: 160 }} />
            </div>
            {WEIGHT_FIELDS.map(({ key, label }) => (
              <div key={key} style={{ minWidth: 120 }}>
                <label className="label-sm">{label}: {((editWeights[key] || 0) * 100).toFixed(0)}%</label>
                <input
                  type="range" min="0" max="100" step="1"
                  value={Math.round((editWeights[key] || 0) * 100)}
                  onChange={(e) => setEditWeights({ ...editWeights, [key]: parseInt(e.target.value, 10) / 100 })}
                  style={{ width: "100%" }}
                />
              </div>
            ))}
            <button onClick={handleSaveProfile} disabled={savingProfile} className="btn btn-primary btn-sm">
              {savingProfile ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
        <button
          className={`btn ${tab === "design" ? "btn-primary" : ""}`}
          style={{ borderRadius: "6px 0 0 6px" }}
          onClick={() => setTab("design")}
        >
          Design Priority
        </button>
        <button
          className={`btn ${tab === "investigation" ? "btn-primary" : ""}`}
          style={{ borderRadius: "0 6px 6px 0" }}
          onClick={() => setTab("investigation")}
        >
          Needs Investigation
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 4 }}>
          <input placeholder="Search sites…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="input-sm" />
          <button type="submit" className="btn btn-sm">Search</button>
        </form>
        <input type="number" placeholder="District" value={district} onChange={(e) => { setDistrict(e.target.value); setPage(1); }} className="input-sm" style={{ width: 80 }} />
        {tab === "design" && (
          <input type="number" placeholder="Min Score" value={minScore} onChange={(e) => { setMinScore(e.target.value); setPage(1); }} className="input-sm" style={{ width: 90 }} />
        )}
        <a
          href={tab === "design"
            ? exportPriorityScoresCsv({ district: district || undefined, minScore: minScore || undefined, search: search || undefined })
            : exportInvestigationCsv({ district: district || undefined, search: search || undefined })}
          download
          className="btn btn-sm"
        >
          Export CSV
        </a>
      </div>

      {loading && <p>Loading…</p>}

      {/* Design Priority Table */}
      {tab === "design" && !loading && (
        <>
          <table className="table" style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th>#</th>
                <th style={{ cursor: "pointer" }} onClick={() => handleSort("composite_score")}>Site{sortArrow("composite_score")}</th>
                <th>District</th>
                <th style={{ cursor: "pointer" }} onClick={() => handleSort("composite_score")}>Composite{sortArrow("composite_score")}</th>
                <th style={{ cursor: "pointer" }} onClick={() => handleSort("vehicle_count_score")}>Vehicles{sortArrow("vehicle_count_score")}</th>
                <th style={{ cursor: "pointer" }} onClick={() => handleSort("charger_gap_score")}>Charger Gap{sortArrow("charger_gap_score")}</th>
                <th style={{ cursor: "pointer" }} onClick={() => handleSort("electrical_headroom_score")}>Headroom{sortArrow("electrical_headroom_score")}</th>
                <th style={{ cursor: "pointer" }} onClick={() => handleSort("data_completeness_score")}>Completeness{sortArrow("data_completeness_score")}</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s, i) => (
                <tr key={s.site_id} onClick={() => setSelectedSite(selectedSite?.site_id === s.site_id ? null : s)} style={{ cursor: "pointer", background: selectedSite?.site_id === s.site_id ? "var(--card-hover, #f0f0f0)" : undefined }}>
                  <td>{(page - 1) * perPage + i + 1}</td>
                  <td>
                    <Link to={`/site/${s.site_id}`} onClick={(e) => e.stopPropagation()}>{s.site_name || `Site #${s.site_id}`}</Link>
                    {s.data_completeness_score < 50 && <span title="Partial data" style={{ marginLeft: 4 }}>⚠️</span>}
                  </td>
                  <td>{s.district ?? "—"}</td>
                  <td><strong>{s.composite_score?.toFixed(1)}</strong> {renderScoreBar(s.composite_score)}</td>
                  <td>{s.vehicle_count_score?.toFixed(0)}</td>
                  <td>{s.charger_gap_score?.toFixed(0)}</td>
                  <td>{s.electrical_headroom_score != null ? s.electrical_headroom_score.toFixed(0) : "—"}</td>
                  <td>{s.data_completeness_score?.toFixed(0)}</td>
                </tr>
              ))}
              {scores.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center" }}>No scores computed yet. Click "Recalculate Scores".</td></tr>}
            </tbody>
          </table>
          {meta && meta.pages > 1 && (
            <Pagination page={page} pages={meta.pages} onChange={setPage} />
          )}
        </>
      )}

      {/* Investigation Table */}
      {tab === "investigation" && !loading && (
        <>
          <table className="table" style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Site</th>
                <th>District</th>
                <th>Vehicle Count</th>
                <th>Charger Gap</th>
                <th>Investigation Urgency</th>
                <th>Completeness</th>
                <th>Missing</th>
              </tr>
            </thead>
            <tbody>
              {investigation.map((s, i) => (
                <tr key={s.site_id} onClick={() => setSelectedSite(selectedSite?.site_id === s.site_id ? null : s)} style={{ cursor: "pointer", background: selectedSite?.site_id === s.site_id ? "var(--card-hover, #f0f0f0)" : undefined }}>
                  <td>{(invPage - 1) * perPage + i + 1}</td>
                  <td><Link to={`/site/${s.site_id}`} onClick={(e) => e.stopPropagation()}>{s.site_name || `Site #${s.site_id}`}</Link></td>
                  <td>{s.district ?? "—"}</td>
                  <td>{s.vehicle_count_score?.toFixed(0)}</td>
                  <td>{s.charger_gap_score?.toFixed(0)}</td>
                  <td><strong>{s.investigation_urgency?.toFixed(1)}</strong> {renderScoreBar(s.investigation_urgency)}</td>
                  <td>{s.data_completeness_score?.toFixed(0)}</td>
                  <td><MissingBadges score={s} /></td>
                </tr>
              ))}
              {investigation.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center" }}>No sites need investigation, or scores not yet computed.</td></tr>}
            </tbody>
          </table>
          {invMeta && invMeta.pages > 1 && (
            <Pagination page={invPage} pages={invMeta.pages} onChange={setInvPage} />
          )}
        </>
      )}

      {/* Score breakdown panel */}
      {selectedSite && (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Score Breakdown — {selectedSite.site_name || `Site #${selectedSite.site_id}`}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
              const val = selectedSite[key];
              return (
                <div key={key} style={{ minWidth: 150 }}>
                  <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ background: "#e0e0e0", borderRadius: 4, height: 14, width: 100, position: "relative" }}>
                      <div
                        style={{
                          background: val == null ? "#999" : val > 60 ? "#4caf50" : val > 30 ? "#ff9800" : "#f44336",
                          width: `${val != null ? Math.min(val, 100) : 0}%`,
                          height: "100%",
                          borderRadius: 4,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 12
                    }}>{val != null ? val.toFixed(1) : "N/A"}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {selectedSite.needs_survey && (
            <div style={{ marginTop: 12, padding: 8, background: "#fff3e0", borderRadius: 4, border: "1px solid #ffe0b2" }}>
              <strong>Site Survey Needed:</strong> This site has vehicles but no electrical service data. Schedule a site visit to collect service information.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Missing-data badges for investigation table
const MissingBadges = ({ score }) => {
  const badges = [];
  if (score.data_completeness_score < 25) badges.push("Service");
  if (score.data_completeness_score < 60) badges.push("Bills");
  if (score.data_completeness_score < 75) badges.push("Usage");
  if (score.data_completeness_score < 90) badges.push("Chargers");
  return (
    <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {badges.map((b) => (
        <span key={b} style={{ background: "#ffcdd2", color: "#c62828", fontSize: 10, padding: "2px 6px", borderRadius: 3 }}>{b}</span>
      ))}
    </span>
  );
};

// Simple pagination
const Pagination = ({ page, pages, onChange }) => (
  <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 12 }}>
    <button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
    <span style={{ padding: "4px 8px", fontSize: 13 }}>Page {page} of {pages}</span>
    <button className="btn btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next →</button>
  </div>
);

export default PriorityDashboard;
