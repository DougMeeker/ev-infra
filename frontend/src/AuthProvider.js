/**
 * AuthProvider – wraps the app with OIDC authentication when enabled.
 *
 * Uses react-oidc-context (built on oidc-client-ts) for the Authorization
 * Code + PKCE flow, compatible with Authelia and any OIDC-compliant provider.
 *
 * When REACT_APP_OIDC_AUTHORITY / REACT_APP_OIDC_CLIENT_ID are not set, the
 * provider simply renders children without any auth gate (local dev / auth-off).
 *
 * Exports:
 *   <AuthProvider>       – wrap around <App /> in index.js
 *   useAuth()            – hook returning { isAuthenticated, user, login, logout, getToken }
 *   <RequireAuth>        – component that gates its children behind authentication
 *   <RequireRole>        – component that gates children behind one or more roles
 */

import React, { createContext, useContext, useCallback, useMemo, useState, useEffect } from "react";
import { AuthProvider as OidcAuthProvider, useAuth as useOidcAuth } from "react-oidc-context";
import { userManager, AUTH_ENABLED } from "./authConfig";

// ── Internal context (for auth-disabled fallback) ───────────────────

const AuthContext = createContext(null);

// ── Hook: useAuth ───────────────────────────────────────────────────

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (ctx) return ctx;
	throw new Error("useAuth must be used inside <AuthProvider>");
}

// ── Provider when auth IS enabled ───────────────────────────────────
// Adapts react-oidc-context's useAuth to the internal API used by this app.

function OidcAuthInner({ children }) {
	const oidc = useOidcAuth();

	const login = useCallback(() => {
		// prompt:'login' forces Authelia to show the login form even if a
		// server-side session cookie is still valid (Authelia does not support
		// RP-initiated logout / end_session_endpoint in this version).
		oidc.signinRedirect({ prompt: 'login' }).catch((err) => console.error("Login failed", err));
	}, [oidc]);

	const logout = useCallback(async () => {
		// Authelia has no end_session_endpoint; just clear the local token.
		// The next sign-in uses prompt:'login' to force re-authentication.
		await oidc.removeUser();
	}, [oidc]);

	const getToken = useCallback(async () => {
		if (!oidc.user || oidc.user.expired) return null;
		return oidc.user.access_token || null;
	}, [oidc.user]);

	const user = useMemo(() => {
		if (!oidc.user) return null;
		const profile = oidc.user.profile || {};
		return {
			name: profile.name || profile.preferred_username || "",
			email: profile.email || profile.preferred_username || "",
			sub: profile.sub,
		};
	}, [oidc.user]);

	// Fetch role + assignment details from backend after authentication
	const [role,     setRole]     = useState(null);
	const [district, setDistrict] = useState(null);
	const [siteId,   setSiteId]   = useState(null);
	useEffect(() => {
		if (!oidc.isAuthenticated) { setRole(null); setDistrict(null); setSiteId(null); return; }
		import("./api").then(({ getMe }) =>
			getMe()
				.then((res) => {
					setRole(res.data?.role || null);
					setDistrict(res.data?.district ?? null);
					setSiteId(res.data?.site_id ?? null);
				})
				.catch((err) => {
					console.warn(
						"[AuthProvider] Failed to fetch user role from /api/auth/me.",
						"Status:", err?.response?.status,
						"Message:", err?.response?.data?.error || err?.message,
						"– Check Flask logs for JWT validation details."
					);
					setRole(null);
				})
		);
	}, [oidc.isAuthenticated]);

	const value = useMemo(
		() => ({
			isAuthenticated: oidc.isAuthenticated,
			user,
			role,
			district,
			siteId,
			login,
			logout,
			getToken,
			ready: !oidc.isLoading,
			authEnabled: true,
		}),
		[oidc.isAuthenticated, oidc.isLoading, user, role, district, siteId, login, logout, getToken],
	);

	if (oidc.isLoading) {
		return <div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>;
	}

	if (oidc.error) {
		console.error("OIDC error:", oidc.error);
		return (
			<div style={{ padding: "2rem", textAlign: "center", color: "red" }}>
				<p>Authentication error: {oidc.error.message}</p>
				<button onClick={() => oidc.removeUser().then(() => oidc.signinRedirect())}>
					Try again
				</button>
			</div>
		);
	}

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Provider when auth is DISABLED ──────────────────────────────────

function NoAuthProvider({ children }) {
	const value = useMemo(
		() => ({
			isAuthenticated: true,
			user: { name: "Local Developer", email: "dev@localhost" },
			role: 'admin',
			district: null,
			siteId: null,
			login: () => {},
			logout: () => {},
			getToken: async () => null,
			ready: true,
			authEnabled: false,
		}),
		[],
	);
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Exported <AuthProvider> ─────────────────────────────────────────

export function AuthProvider({ children }) {
	if (!AUTH_ENABLED || !userManager) {
		return <NoAuthProvider>{children}</NoAuthProvider>;
	}
	return (
		<OidcAuthProvider
			userManager={userManager}
			onSigninCallback={() => {
				// Clean up the auth code / state params from the URL after the
				// callback is processed so they don't linger in browser history.
				window.history.replaceState({}, document.title, window.location.pathname);
			}}
		>
			<OidcAuthInner>{children}</OidcAuthInner>
		</OidcAuthProvider>
	);
}

// ── <RequireAuth> gate component ────────────────────────────────────

export function RequireAuth({ children }) {
	const { isAuthenticated, login, authEnabled, ready } = useAuth();

	if (!authEnabled) return <>{children}</>;
	if (!ready) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>;

	if (!isAuthenticated) {
		return (
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "1rem" }}>
				<h2>EV Infrastructure App</h2>
				<p>Sign in to continue.</p>
				<button
					onClick={login}
					style={{
						padding: "0.75rem 2rem",
						fontSize: "1rem",
						background: "var(--primary, #0078d4)",
						color: "#fff",
						border: "none",
						borderRadius: "6px",
						cursor: "pointer",
					}}
				>
					Sign In
				</button>
			</div>
		);
	}

	return <>{children}</>;
}

// ── <RequireRole> gate component ────────────────────────────────────
// roles: array of allowed role strings, e.g. ['admin'] or ['admin','hq']

export function RequireRole({ roles, children }) {
	const { isAuthenticated, role, authEnabled, ready } = useAuth();

	if (!authEnabled) return <>{children}</>;
	if (!ready) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>;

	if (!isAuthenticated || !roles.includes(role)) {
		return (
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "1rem" }}>
				<h2>Access Denied</h2>
				<p>You do not have permission to view this page.</p>
			</div>
		);
	}

	return <>{children}</>;
}
