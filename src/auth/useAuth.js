import { useCallback, useEffect, useState } from 'react'
import {
  AUTH_STORAGE_KEY,
  loadStoredSession,
  saveStoredSession,
  verifyWithServer,
  readPartnerToken,
  savePartnerToken,
} from './googleAuth'

// Build the persisted session shape from a credential + /api/auth response.
// `partner` is only present the first time they arrive through a partner link.
function sessionFromRes(credential, res, prevPartner) {
  return {
    credential,
    user: res.user,
    status: res.status,
    isAdmin: res.isAdmin,
    tier: res.tier,
    maxFighters: res.maxFighters,
    features: res.features,
    scopedEventId: res.scopedEventId ?? null,
    partner: res.partner ?? prevPartner ?? null,
  }
}

// Auth state hook. The backend is the source of truth for approval status:
// - signIn(credential): verify with the server, persist the session.
// - on mount: re-verify the stored credential so status/blocks apply on reload.
export function useAuth() {
  const [session, setSession] = useState(loadStoredSession)
  const [checking, setChecking] = useState(() => !!loadStoredSession()?.credential)
  const [error, setError] = useState('')

  const applySession = useCallback((next) => {
    setSession(next)
    saveStoredSession(next)
  }, [])

  const signOut = useCallback(() => {
    applySession(null)
    setError('')
    try {
      window.google?.accounts?.id?.disableAutoSelect()
    } catch { /* ignore */ }
  }, [applySession])

  // Called with the raw Google credential (JWT) from the sign-in button.
  // Picks up a pending partner token (from a ?partner=… link) so the server can
  // auto-approve + scope the account, then clears it once redeemed.
  const signIn = useCallback(async (credential) => {
    setError('')
    try {
      const partnerToken = readPartnerToken()
      const res = await verifyWithServer(credential, partnerToken)
      if (res.partner) savePartnerToken(null)
      applySession(sessionFromRes(credential, res))
      return res
    } catch (e) {
      setError(e.message || 'No se pudo iniciar sesión')
      applySession(null)
      throw e
    }
  }, [applySession])

  // Re-verify the stored credential and refresh status/tier (e.g. after an
  // admin approves the account or changes the tier). No-op when logged out.
  const refresh = useCallback(async () => {
    const stored = loadStoredSession()
    if (!stored?.credential) return null
    const res = await verifyWithServer(stored.credential)
    applySession(sessionFromRes(stored.credential, res, stored.partner))
    return res
  }, [applySession])

  // Re-validate the stored session on load (refresh status, honor blocks).
  useEffect(() => {
    const stored = loadStoredSession()
    // `checking` already starts false when there is no stored credential.
    if (!stored?.credential) return
    let cancelled = false
    verifyWithServer(stored.credential)
      .then((res) => {
        if (cancelled) return
        applySession(sessionFromRes(stored.credential, res, stored.partner))
      })
      .catch(() => {
        // Token expired or invalid → require a fresh sign-in.
        if (!cancelled) applySession(null)
      })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [applySession])

  // Keep tabs in sync (sign out / status change in one tab reflects in others).
  useEffect(() => {
    function onStorage(e) {
      if (e.key === AUTH_STORAGE_KEY) setSession(loadStoredSession())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Dev-only bypass so the app is usable locally where /api/auth does not run.
  // Guarded by import.meta.env.DEV: this branch is dead code in production builds,
  // so it can never bypass auth on the deployed site regardless of env vars.
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_NO_AUTH === 'true') {
    return {
      user: { email: 'local@dev.test', name: 'Local Dev', picture: '' },
      status: 'approved',
      isAdmin: false,
      tier: 'team',
      maxFighters: 15,
      features: { realtimeAlerts: false },
      scopedEventId: null,
      partnerEvent: null,
      credential: null,
      checking: false,
      error: '',
      signIn,
      signOut,
      refresh,
    }
  }

  return {
    user: session?.user || null,
    status: session?.status || null,
    isAdmin: session?.isAdmin || false,
    tier: session?.tier || null,
    maxFighters: session?.maxFighters ?? null,
    features: session?.features || null,
    scopedEventId: session?.scopedEventId ?? null,
    partnerEvent: session?.partner ?? null,
    credential: session?.credential || null,
    checking,
    error,
    signIn,
    signOut,
    refresh,
  }
}
