/**
 * AuthProvider – wraps the app with MSAL authentication when enabled.
 *
 * When REACT_APP_AZURE_AD_CLIENT_ID is not set, the provider simply renders
 * children without any auth gate (local dev / auth-off mode).
 *
 * Exports:
 *   <AuthProvider>       – wrap around <App /> in index.js
 *   useAuth()            – hook returning { isAuthenticated, user, login, logout, getToken }
 *   <RequireAuth>        – component that gates its children behind authentication
 */

import React, { createContext, useContext, useCallback, useMemo, useEffect, useState } from "react";
import {
	MsalProvider,
	useMsal,
	useIsAuthenticated,
} from "@azure/msal-react";
import { InteractionRequiredAuthError, InteractionStatus } from "@azure/msal-browser";
import { msalInstance, loginRequest, AUTH_ENABLED } from "./authConfig";

// ── Internal context (for auth-disabled fallback) ───────────────────

const AuthContext = createContext(null);

// ── Hook: useAuth ───────────────────────────────────────────────────

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (ctx) return ctx; // auth-disabled shortcut
	throw new Error("useAuth must be used inside <AuthProvider>");
}

// ── Provider when auth IS enabled ───────────────────────────────────

function MsalAuthInner({ children }) {
	const { instance, accounts, inProgress } = useMsal();
	const isAuthenticated = useIsAuthenticated();
	const [ready, setReady] = useState(false);

	const account = accounts[0] ?? null;

	// On first load, try to silently log in with a cached session
	useEffect(() => {
		if (inProgress !== InteractionStatus.None) return;
		if (!isAuthenticated && accounts.length === 0) {
			// No cached account – we'll prompt via the login button
			setReady(true);
			return;
		}
		setReady(true);
	}, [inProgress, isAuthenticated, accounts]);

	const login = useCallback(async () => {
		try {
			await instance.loginRedirect(loginRequest);
		} catch (err) {
			console.error("Login failed", err);
		}
	}, [instance]);

	const logout = useCallback(async () => {
		try {
			await instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
		} catch (err) {
			console.error("Logout failed", err);
		}
	}, [instance]);

	const getToken = useCallback(async () => {
		if (!account) return null;
		try {
			const resp = await instance.acquireTokenSilent({
				...loginRequest,
				account,
			});
			return resp.accessToken;
		} catch (err) {
			if (err instanceof InteractionRequiredAuthError) {
				await instance.acquireTokenRedirect(loginRequest);
			}
			return null;
		}
	}, [instance, account]);

	const user = useMemo(() => {
		if (!account) return null;
		return {
			name: account.name || account.username,
			email: account.username,
			oid: account.localAccountId,
		};
	}, [account]);

	const value = useMemo(
		() => ({ isAuthenticated, user, login, logout, getToken, ready, authEnabled: true }),
		[isAuthenticated, user, login, logout, getToken, ready],
	);

	if (!ready) {
		return <div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>;
	}

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Provider when auth is DISABLED ──────────────────────────────────

function NoAuthProvider({ children }) {
	const value = useMemo(
		() => ({
			isAuthenticated: true,
			user: { name: "Local Developer", email: "dev@localhost" },
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
	if (!AUTH_ENABLED) {
		return <NoAuthProvider>{children}</NoAuthProvider>;
	}
	return (
		<MsalProvider instance={msalInstance}>
			<MsalAuthInner>{children}</MsalAuthInner>
		</MsalProvider>
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
				<p>Sign in with your Caltrans Microsoft account to continue.</p>
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
					Sign in with Microsoft
				</button>
			</div>
		);
	}

	return <>{children}</>;
}
