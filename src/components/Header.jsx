import { useEffect, useRef, useState } from 'react'
import { IconRefresh, IconSpinner, IconBell, IconTrophy } from './icons'
import logoCf from '../assets/logo-cf.png'

export default function Header({ isMonitoring, lastUpdated, onRefresh, isLoading, user, isAdmin, onSignOut, onOpenNotifications, onOpenMyTournaments }) {
  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  return (
    <header className="header">
      <div className="header-title">
        <img
          src={logoCf}
          alt="Combat Follow"
          className={`header-logo${isMonitoring ? ' active' : ''}`}
        />
        <div>
          <div className="header-title-main">COMBAT FOLLOW</div>
          <div className="header-subtitle">by Frames and Chokes</div>
        </div>
      </div>
      <div className="header-actions">
        {timeStr && <span className="header-updated">{timeStr}</span>}
        <button
          className="btn-icon"
          onClick={onRefresh}
          disabled={isLoading}
          title="Actualizar ahora"
          aria-label="Actualizar ahora"
        >
          {isLoading ? <IconSpinner size={18} /> : <IconRefresh size={18} />}
        </button>

        {user && (
          <div className="user-menu" ref={menuRef}>
            <button
              className="user-avatar-btn"
              onClick={() => setMenuOpen((o) => !o)}
              title={user.name || user.email}
              aria-label="Cuenta"
            >
              {user.picture ? (
                <img src={user.picture} alt="" className="user-avatar" referrerPolicy="no-referrer" />
              ) : (
                <span className="user-avatar user-avatar-fallback">
                  {(user.name || user.email || '?').charAt(0).toUpperCase()}
                </span>
              )}
            </button>
            {menuOpen && (
              <div className="user-dropdown">
                <div className="user-dropdown-name">{user.name}</div>
                <div className="user-dropdown-email">{user.email}</div>
                <button
                  className="btn-ghost user-menu-item"
                  onClick={() => { setMenuOpen(false); onOpenMyTournaments?.() }}
                >
                  <IconTrophy size={15} />
                  Mis torneos
                </button>
                {isAdmin && (
                  <button
                    className="btn-ghost user-menu-item"
                    onClick={() => { setMenuOpen(false); onOpenNotifications?.() }}
                  >
                    <IconBell size={15} />
                    Notificaciones
                  </button>
                )}
                <button
                  className="btn-ghost user-signout"
                  onClick={() => { setMenuOpen(false); onSignOut() }}
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
