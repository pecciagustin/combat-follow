import logoCf from '../assets/logo-cf.png'

// Shown to authenticated users who are not (yet) approved.
export default function StatusScreen({ status, user, onSignOut }) {
  const isBlocked = status === 'blocked'

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src={logoCf} alt="Combat Follow" className="login-logo-img" />
        <div className="login-brand">
          <div className="login-title">COMBAT FOLLOW</div>
          <div className="login-subtitle">by Frames and Chokes</div>
        </div>

        {isBlocked ? (
          <>
            <div className="status-badge status-blocked">Acceso bloqueado</div>
            <p className="login-text">
              Tu cuenta no tiene acceso a esta app. Si creés que es un error,
              contactá al administrador.
            </p>
          </>
        ) : (
          <>
            <div className="status-badge status-pending">Pendiente de aprobación</div>
            <p className="login-text">
              Tu solicitud fue registrada. Un administrador debe aprobar tu
              acceso antes de que puedas usar la app.
            </p>
          </>
        )}

        {user?.email && <p className="status-email">{user.email}</p>}

        <button className="btn-ghost login-signout" onClick={onSignOut}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
