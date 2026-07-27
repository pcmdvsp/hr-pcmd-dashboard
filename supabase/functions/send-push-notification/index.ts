import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const response = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const env = (name: string) => Deno.env.get(name) ?? ''
const defaultKey = (modernName: string, legacyName: string) => {
  const modernValue = env(modernName)
  if (modernValue) {
    try { return JSON.parse(modernValue).default as string }
    catch { /* fall back to the legacy secret */ }
  }
  return env(legacyName)
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return response({ error: 'Authentication is required.' }, 401)

  const url = env('SUPABASE_URL')
  const anonKey = defaultKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
  const serviceRoleKey = defaultKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublicKey = env('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = env('VAPID_PRIVATE_KEY')
  const vapidSubject = env('VAPID_SUBJECT')
  if (!url || !anonKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return response({ error: 'Push notification secrets are not configured.' }, 500)
  }

  const callerClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } })
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !caller) return response({ error: 'Your session is invalid or has expired.' }, 401)

  const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: profile } = await adminClient.from('profiles').select('role,active').eq('id', caller.id).maybeSingle()
  if (!profile || profile.role !== 'admin' || !profile.active) return response({ error: 'Only active administrators can send a test push notification.' }, 403)

  let input: { title?: unknown, body?: unknown }
  try { input = await request.json() } catch { input = {} }
  const title = typeof input.title === 'string' ? input.title.slice(0, 120) : 'PCMD test notification'
  const body = typeof input.body === 'string' ? input.body.slice(0, 240) : 'Push notifications are working on this device.'

  const { data: subscriptions, error: subscriptionError } = await adminClient.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', caller.id)
  if (subscriptionError) return response({ error: subscriptionError.message }, 500)
  if (!subscriptions?.length) return response({ error: 'No push subscription was found. Enable browser notifications first.' }, 400)

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  let sent = 0
  const expiredIds: string[] = []
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title, body, url: '/' }))
      sent += 1
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode)
      if (statusCode === 404 || statusCode === 410) expiredIds.push(subscription.id)
    }
  }
  if (expiredIds.length) await adminClient.from('push_subscriptions').delete().in('id', expiredIds)
  if (!sent) return response({ error: 'The push service did not accept this device subscription. Enable notifications again and retry.' }, 502)
  return response({ sent })
})
