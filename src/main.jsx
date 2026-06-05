import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Auto-reload when a new service worker takes over
registerSW({
  onNeedRefresh() {
    window.location.reload()
  },
  onOfflineReady() {},
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
