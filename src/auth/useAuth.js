import { useCallback, useEffect, useState } from 'react'
import {
  AUTH_STORAGE_KEY,
  loadStoredSession,
  saveStoredSession,
  verifyWithServer,
} from './googleAuth'

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
  const signIn = useCallback(async (credential) => {
    setError('')
    try {
      const res = await verifyWithServer(credential)
      applySession({
        credential,
        user: res.user,
        status: res.status,
        isAdmin: res.isAdmin,
        tier: res.tier,
        maxFighters: res.maxFighters,
        features: res.features,
      })
      return res
    } catch (e) {
      setError(e.message || 'No se pudo iniciar sesión')
      applySession(null)
      throw e
    }
  }, [applySession])

  // Re-verify the stored credential and refresh status/tier (e.g. after
  // redeeming a code or an admin changing the tier). No-op when logged out.
  const refresh = useCallback(async () => {
    const stored = loadStoredSession()
    if (!stored?.credential) return null
    const res = await verifyWithServer(stored.credential)
    applySession({
      credential: stored.credential,
      user: res.user,
      status: res.status,
      isAdmin: res.isAdmin,
      tier: res.tier,
      maxFighters: res.maxFighters,
      features: res.features,
    })
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
        applySession({
          credential: stored.credential,
          user: res.user,
          status: res.status,
          isAdmin: res.isAdmin,
          tier: res.tier,
          maxFighters: res.maxFighters,
          features: res.features,
        })
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
    credential: session?.credential || null,
    checking,
    error,
    signIn,
    signOut,
    refresh,
  }
}
