// The backend now lives on a separate domain (API Gateway -> Lambda), not
// this app's own origin, so every "/api/..." fetch needs this prefixed on —
// a relative "/api/..." call would otherwise hit this app's own Amplify
// domain, which has nothing listening there.
// Set at build time via VITE_API_BASE_URL (see .env); empty string falls
// back to same-origin relative requests (e.g. local dev behind the Vite
// proxy in vite.config.js).
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export const apiUrl = (path) => `${API_BASE}${path}`;
