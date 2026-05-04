import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_BASE || "";

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "4px",
  border: "1px solid var(--card-border, #ccc)",
  background: "var(--input-bg, #fff)",
  color: "var(--text)",
  fontSize: "0.95rem",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  marginBottom: "4px",
  fontSize: "0.85rem",
  color: "var(--text-secondary, #555)",
  fontWeight: "500",
};

export default function Register() {
  const [form, setForm] = useState({
    username: "",
    display_name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/api/auth/register`, {
        username: form.username,
        display_name: form.display_name,
        email: form.email,
        password: form.password,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div style={{ maxWidth: 420, margin: "80px auto", padding: "2rem", textAlign: "center" }}>
        <h2 style={{ marginBottom: "1rem" }}>Check your email</h2>
        <p style={{ color: "var(--text-secondary, #555)", lineHeight: 1.6 }}>
          A verification link has been sent to <strong>{form.email}</strong>.
          Click the link in that email to activate your account.
        </p>
        <p style={{ marginTop: "1.5rem" }}>
          <Link to="/" style={{ color: "var(--link)" }}>Return to home</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", padding: "2rem" }}>
      <h2 style={{ marginBottom: "1.5rem" }}>Create account</h2>

      {error && (
        <div
          style={{
            background: "#fde8e8",
            border: "1px solid #f5c6c6",
            borderRadius: "4px",
            padding: "10px 14px",
            marginBottom: "1rem",
            color: "#b00020",
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle} htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={form.username}
            onChange={handleChange}
            required
            placeholder="e.g. jsmith"
            style={inputStyle}
          />
          <small style={{ color: "var(--text-secondary, #777)", fontSize: "0.78rem" }}>
            3–32 chars, lowercase letters, digits, _ . -
          </small>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle} htmlFor="display_name">Display name</label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            autoComplete="name"
            value={form.display_name}
            onChange={handleChange}
            required
            placeholder="e.g. Jane Smith"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle} htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            required
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle} htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={handleChange}
            required
            placeholder="At least 10 characters"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle} htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={handleChange}
            required
            style={inputStyle}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: "10px",
            background: "var(--primary, #1a73e8)",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            fontSize: "0.95rem",
            fontWeight: "500",
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p style={{ marginTop: "1.25rem", fontSize: "0.88rem", color: "var(--text-secondary, #555)" }}>
        Already have an account?{" "}
        <Link to="/" style={{ color: "var(--link)" }}>Sign in from the home page</Link>
      </p>
    </div>
  );
}
