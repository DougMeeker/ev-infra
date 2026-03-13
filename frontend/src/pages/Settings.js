import React, { useEffect, useState, useCallback } from "react";
import { mcpGetStatus, mcpTriggerFullSync } from "../api";

const Settings = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await mcpGetStatus();
      setStatus(res.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await mcpTriggerFullSync();
      setSyncResult(res.data);
      fetchStatus();
    } catch (err) {
      setSyncResult({ error: err.response?.data?.error || err.message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h2>Settings</h2>

      {/* ── MCP Knowledge Base Sync ─────────────────────────── */}
      <div style={{ border: "1px solid #dee2e6", borderRadius: 8, padding: 20, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>MCP Knowledge Base Sync</h3>

        {loading ? (
          <p>Loading status…</p>
        ) : (
          <>
            {/* Enabled / Disabled badge */}
            <p>
              <strong>Status:</strong>{" "}
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 10px",
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 600,
                  backgroundColor: status?.enabled ? "#d4edda" : "#f8d7da",
                  color: status?.enabled ? "#155724" : "#721c24",
                }}
              >
                {status?.enabled ? "Enabled" : "Disabled"}
              </span>
            </p>

            {/* Last sync info */}
            {status?.last_sync ? (
              <table style={{ borderCollapse: "collapse", marginBottom: 16 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>Last Sync</td>
                    <td>{status.last_sync.started_at || "—"}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>Type</td>
                    <td>{status.last_sync.sync_type}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>Result</td>
                    <td>{status.last_sync.status}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>Documents</td>
                    <td>{status.last_sync.document_count}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p style={{ color: "#6c757d" }}>No sync has been run yet.</p>
            )}

            <p>
              <strong>Total documents synced:</strong> {status?.total_documents_synced ?? 0}
            </p>

            {/* Sync Now button */}
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                padding: "8px 20px",
                backgroundColor: "#007bff",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: syncing ? "not-allowed" : "pointer",
                opacity: syncing ? 0.7 : 1,
              }}
            >
              {syncing ? "Syncing…" : "Sync Now"}
            </button>

            {syncResult && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 4,
                  backgroundColor: syncResult.error ? "#f8d7da" : "#d4edda",
                  color: syncResult.error ? "#721c24" : "#155724",
                }}
              >
                {syncResult.error
                  ? `Sync error: ${syncResult.error}`
                  : syncResult.skipped
                  ? `Sync skipped: ${syncResult.reason}`
                  : `Sync complete — ${syncResult.synced} documents ingested.`}
              </div>
            )}

            {/* Error log */}
            {status?.recent_errors?.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h4 style={{ marginBottom: 8 }}>Recent Errors</h4>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #dee2e6", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px" }}>Time</th>
                      <th style={{ padding: "6px 8px" }}>Type</th>
                      <th style={{ padding: "6px 8px" }}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.recent_errors.map((e) => (
                      <tr key={e.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                        <td style={{ padding: "6px 8px" }}>{e.started_at}</td>
                        <td style={{ padding: "6px 8px" }}>{e.sync_type}</td>
                        <td style={{ padding: "6px 8px", color: "#dc3545" }}>
                          {e.error_message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Settings;
