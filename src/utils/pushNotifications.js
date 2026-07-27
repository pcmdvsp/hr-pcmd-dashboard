import { supabase } from '../lib/supabaseClient'

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY

const toApplicationServerKey = value => {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const decoded = atob(base64)
  return Uint8Array.from(decoded, character => character.charCodeAt(0))
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export async function hasPushSubscription() {
  if (!pushSupported()) return false
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return false
  return Boolean(await registration.pushManager.getSubscription())
}

export async function enablePushNotifications(userId) {
  if (!pushSupported()) throw new Error('Push notifications are not supported by this browser.')
  if (!vapidPublicKey) throw new Error('The VAPID public key is not configured in this deployment.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: toApplicationServerKey(vapidPublicKey),
  })
  const serialized = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: serialized.keys?.p256dh,
    auth: serialized.keys?.auth,
  }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function sendTestPushNotification() {
  const { data, error } = await supabase.functions.invoke('send-push-notification', {
    body: { title: 'PCMD test notification', body: 'Push notifications are working on this device.' },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function notifyMeetingPush(meetingId, event) {
  const { data, error } = await supabase.functions.invoke('meeting-push-notification', { body: { meetingId, event } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}
