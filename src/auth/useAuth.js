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
      })
      return res
    } catch (e) {
      setError(e.message || 'No se pudo iniciar sesión')
      applySession(null)
      throw e
    }
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

  return {
    user: session?.user || null,
    status: session?.status || null,
    isAdmin: session?.isAdmin || false,
    credential: session?.credential || null,
    checking,
    error,
    signIn,
    signOut,
  }
}
