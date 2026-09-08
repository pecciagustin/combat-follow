import { useCallback, useEffect, useState } from 'react'
import { AUTH_STORAGE_KEY, loadStoredUser, saveStoredUser } from './googleAuth'

// Small auth state hook: keeps the signed-in user in state + localStorage.
export function useAuth() {
  const [user, setUser] = useState(loadStoredUser)

  const signIn = useCallback((profile) => {
    setUser(profile)
    saveStoredUser(profile)
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    saveStoredUser(null)
    // Prevent GIS auto-select from silently re-logging the user next time.
    try {
      window.google?.accounts?.id?.disableAutoSelect()
    } catch { /* ignore */ }
  }, [])

  // Keep tabs in sync (sign out in one tab reflects in others).
  useEffect(() => {
    function onStorage(e) {
      if (e.key === AUTH_STORAGE_KEY) setUser(loadStoredUser())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { user, signIn, signOut }
}
