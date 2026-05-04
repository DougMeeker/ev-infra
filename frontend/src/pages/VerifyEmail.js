import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_BASE || "";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token found in the link.");
      return;
    }

    axios
      .get(`${API_BASE}/api/auth/verify-email`, { params: { token } })
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setMessage(
          err.response?.data?.error || "Verification failed. The link may have expired."
        );
      });
  }, [token]);

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: "2rem", textAlign: "center" }}>
      {status === "verifying" && (
        <>
          <h2>Verifying your email…</h2>
          <p style={{ color: "var(--text-secondary, #555)" }}>Please wait.</p>
        </>
      )}

      {status === "success" && (
        <>
          <h2 style={{ color: "var(--success, #1e7e34)" }}>Email verified!</h2>
          <p style={{ color: "var(--text-secondary, #555)", lineHeight: 1.6 }}>
            Your account is now active. Click <strong>Sign in</strong> in the header to log in.
          </p>
          <p style={{ marginTop: "1.5rem" }}>
            <Link to="/" style={{ color: "var(--link)" }}>Go to home page</Link>
          </p>
        </>
      )}

      {status === "error" && (
        <>
          <h2 style={{ color: "#b00020" }}>Verification failed</h2>
          <p style={{ color: "var(--text-secondary, #555)", lineHeight: 1.6 }}>{message}</p>
          <p style={{ marginTop: "1.5rem" }}>
            <Link to="/register" style={{ color: "var(--link)" }}>Register again</Link>
            {" · "}
            <Link to="/" style={{ color: "var(--link)" }}>Go to home page</Link>
          </p>
        </>
      )}
    </div>
  );
}
