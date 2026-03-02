/**
 * Microsoft Entra ID (Azure AD) MSAL configuration.
 *
 * Environment variables (set in .env or .env.local):
 *   REACT_APP_AZURE_AD_CLIENT_ID   – Application (client) ID from Entra ID
 *   REACT_APP_AZURE_AD_TENANT_ID   – Directory (tenant) ID  (Caltrans tenant)
 *   REACT_APP_AZURE_AD_REDIRECT_URI – Redirect URI (defaults to current origin)
 *
 * When REACT_APP_AZURE_AD_CLIENT_ID is not set, auth is disabled and the app
 * renders without requiring login (useful for local dev).
 */

import { PublicClientApplication, LogLevel } from "@azure/msal-browser";

// Whether auth is enabled – if no client ID is configured, skip auth entirely
export const AUTH_ENABLED = Boolean(process.env.REACT_APP_AZURE_AD_CLIENT_ID);

export const msalConfig = {
	auth: {
		clientId: process.env.REACT_APP_AZURE_AD_CLIENT_ID || "00000000-0000-0000-0000-000000000000",
		// Use tenant-specific authority for Caltrans; change to "common" for multi-tenant
		authority: `https://login.microsoftonline.com/${process.env.REACT_APP_AZURE_AD_TENANT_ID || "common"}`,
		redirectUri: process.env.REACT_APP_AZURE_AD_REDIRECT_URI || window.location.origin,
		postLogoutRedirectUri: window.location.origin,
		navigateToLoginRequestUrl: true,
	},
	cache: {
		cacheLocation: "sessionStorage", // or "localStorage" for persistent sessions
		storeAuthStateInCookie: false,
	},
	system: {
		loggerOptions: {
			logLevel: LogLevel.Warning,
			loggerCallback: (level, message, containsPii) => {
				if (containsPii) return;
				switch (level) {
					case LogLevel.Error:
						console.error(message);
						break;
					case LogLevel.Warning:
						console.warn(message);
						break;
					default:
						break;
				}
			},
		},
	},
};

// Scopes for the access token.  `api://<client-id>/access_as_user` is a
// common custom scope; fall back to the default ".default" scope.
export const loginRequest = {
	scopes: [
		process.env.REACT_APP_AZURE_AD_SCOPE ||
			`api://${process.env.REACT_APP_AZURE_AD_CLIENT_ID || "00000000-0000-0000-0000-000000000000"}/.default`,
	],
};

// Pre-built MSAL instance (singleton) – only created when auth is enabled.
// Constructing PublicClientApplication on plain HTTP (no client ID) throws
// MSAL errors that break the app, so guard it here.
export const msalInstance = AUTH_ENABLED ? new PublicClientApplication(msalConfig) : null;
