// Google Identity Services (GIS) helpers — client-side "Sign in with Google".
// No backend required: the button returns a signed JWT credential from Google,
// which we decode client-side to read the user's basic profile (name, email, picture).

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
export const AUTH_STORAGE_KEY = 'combat-follow-user'
// A pending tech-partner token captured from ?partner=… before sign-in.
export const PARTNER_TOKEN_KEY = 'combat-follow-partner-token'

export function readPartnerToken() {
  try { return localStorage.getItem(PARTNER_TOKEN_KEY) || null } catch { return null }
}
export function savePartnerToken(token) {
  try {
    if (token) localStorage.setItem(PARTNER_TOKEN_KEY, token)
    else localStorage.removeItem(PARTNER_TOKEN_KEY)
  } catch { /* ignore */ }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client'
let gsiPromise = null

// Load the GIS script once and resolve when window.google.accounts.id is ready.
export function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (gsiPromise) return gsiPromise

  gsiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google))
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Sign-In')))
      return
    }
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve(window.google)
    script.onerror = () => reject(new Error('No se pudo cargar Google Sign-In'))
    document.head.appendChild(script)
  })
  return gsiPromise
}

// Decode a JWT credential without verifying the signature. Fine for a
// client-side profile gate; do NOT trust this for real authorization.
export function decodeJwt(token) {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

// The stored session is { user, credential, status, isAdmin }.
export function loadStoredSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveStoredSession(session) {
  if (session) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  else localStorage.removeItem(AUTH_STORAGE_KEY)
}

// Send the Google credential to the backend, which verifies it and returns the
// user's approval status. Throws on invalid/expired token or network error.
export async function verifyWithServer(credential, partnerToken) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, ...(partnerToken ? { partnerToken } : {}) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo verificar la sesión')
  return data // { ok, status, isAdmin, tier, maxFighters, features, scopedEventId, partner, user }
}

// Admin-only API. `credential` must belong to the admin account.
export async function adminApi(credential, action, params = {}) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, action, ...params }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Error del servidor')
  return data
}
