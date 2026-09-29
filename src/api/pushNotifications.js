function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0))
}

export async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) throw new Error('VAPID key not configured')
  const applicationServerKey = urlBase64ToUint8Array(vapidKey)
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  })
}

export async function getExistingSubscription() {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function unsubscribeFromPush() {
  const subscription = await getExistingSubscription()
  if (subscription) await subscription.unsubscribe()
  return subscription
}

export async function registerPushSubscription(credential, subscription) {
  const res = await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, subscription: subscription.toJSON() }),
  })
  if (!res.ok) throw new Error('Failed to register push subscription')
  return res.json()
}

export async function unregisterPushSubscription(credential, endpoint) {
  const res = await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, op: 'remove', endpoint }),
  })
  return res.json()
}
