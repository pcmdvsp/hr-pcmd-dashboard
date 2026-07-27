self.addEventListener('push', event => {
  const payload = event.data ? event.data.json() : {}
  const title = payload.title || 'PCMD - Vietsovpetro JV'
  const options = {
    body: payload.body || 'You have a new notification.',
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    data: {
      url: payload.url || self.registration.scope,
      route: payload.route || '',
      actionUrl: payload.actionUrl || '',
      actionToken: payload.actionToken || '',
    },
    tag: payload.tag || 'pcmd-push-notification',
    renotify: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const data = event.notification.data || {}
  if ((event.action === 'snooze' || event.action === 'stop') && data.actionUrl && data.actionToken) {
    event.waitUntil(fetch(data.actionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: event.action, token: data.actionToken }),
    }).catch(() => undefined))
    return
  }
  const target = data.route === 'meeting-info'
    ? new URL('./#/meeting-info', self.registration.scope).href
    : (data.url || self.registration.scope)
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(window => window.url.startsWith(self.location.origin))
    if (existing) return existing.navigate(target).then(() => existing.focus())
    return clients.openWindow(target)
  }))
})
