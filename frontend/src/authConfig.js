/**
 * OIDC configuration for Authelia (or any standards-compliant OIDC provider).
 *
 * Environment variables (set in .env or .env.local):
 *   REACT_APP_OIDC_AUTHORITY    – Base URL of the OIDC issuer (e.g. https://auth.example.com)
 *   REACT_APP_OIDC_CLIENT_ID    – Client ID registered with the OIDC provider
 *   REACT_APP_OIDC_REDIRECT_URI – Redirect URI after login (defaults to window.location.origin)
 *   REACT_APP_OIDC_SCOPE        – Space-separated scopes (defaults to "openid profile email")
 *
 * When REACT_APP_OIDC_AUTHORITY or REACT_APP_OIDC_CLIENT_ID is not set, auth
 * is disabled and the app renders without requiring login (useful for local dev).
 */

import { UserManager, WebStorageStateStore } from "oidc-client-ts";

// Whether auth is enabled – both authority and client ID must be configured
export const AUTH_ENABLED = Boolean(
	process.env.REACT_APP_OIDC_AUTHORITY && process.env.REACT_APP_OIDC_CLIENT_ID,
);

const authority = process.env.REACT_APP_OIDC_AUTHORITY || "";

export const oidcConfig = {
	authority,
	client_id: process.env.REACT_APP_OIDC_CLIENT_ID || "",
	redirect_uri: process.env.REACT_APP_OIDC_REDIRECT_URI || window.location.origin,
	post_logout_redirect_uri: window.location.origin,
	scope: process.env.REACT_APP_OIDC_SCOPE || "openid profile email",
	response_type: "code",
	// Store tokens in sessionStorage (cleared when the tab closes)
	userStore: new WebStorageStateStore({ store: window.sessionStorage }),
};

// Singleton UserManager – only created when auth is enabled.
// Used by api.js to silently retrieve the current access token.
export const userManager = AUTH_ENABLED ? new UserManager(oidcConfig) : null;
