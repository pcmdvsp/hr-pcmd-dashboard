import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers })
const env = (name: string) => Deno.env.get(name) ?? ''
const key = (modern: string, legacy: string) => {
  try { return JSON.parse(env(modern)).default as string } catch { return env(legacy) }
}

Deno.serve(async request => {
  try {
    if (request.method === 'OPTIONS') return new Response('ok', { headers })
    if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405)

    const authorization = request.headers.get('Authorization')
    if (!authorization) return response({ error: 'Authentication is required.' }, 401)

    const url = env('SUPABASE_URL')
    const anonKey = key('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
    const serviceKey = key('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anonKey || !serviceKey || !env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY') || !env('VAPID_SUBJECT')) {
      return response({ error: 'Push notification secrets are not configured.' }, 500)
    }

    let input: { meetingId?: unknown, event?: unknown }
    try { input = await request.json() } catch { return response({ error: 'Invalid request body.' }, 400) }
    const meetingId = typeof input.meetingId === 'string' ? input.meetingId : ''
    const event = typeof input.event === 'string' ? input.event : ''
    if (!meetingId || !['created', 'updated', 'cancelled'].includes(event)) {
      return response({ error: 'Invalid meeting notification request.' }, 400)
    }
    console.info('Meeting push request received.', { event, meetingId })

    const callerClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) return response({ error: 'Your session is invalid or has expired.' }, 401)

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const [{ data: profile }, { data: meeting, error: meetingError }] = await Promise.all([
      admin.from('profiles').select('role,active').eq('id', caller.id).maybeSingle(),
      admin.from('employee_meetings').select('id,organizer_id,date,content,location,start_time,end_time,updated_at').eq('id', meetingId).maybeSingle(),
    ])
    if (!profile?.active || !meeting || meetingError || (profile.role !== 'admin' && meeting.organizer_id !== caller.id)) {
      return response({ error: 'You are not allowed to send this meeting notification.' }, 403)
    }

    // A changed date or time needs a fresh 15-minute reminder. Remove only the
    // previous reminder state; the update notification itself is still sent
    // immediately below.
    if (event === 'updated') {
      const [deliveryReset, preferenceReset] = await Promise.all([
        admin.from('meeting_push_deliveries').delete().eq('meeting_id', meetingId).eq('kind', 'reminder_15'),
        admin.from('meeting_reminder_preferences').delete().eq('meeting_id', meetingId),
      ])
      if (deliveryReset.error || preferenceReset.error) {
        console.error('Unable to reset the meeting reminder.', {
          delivery: deliveryReset.error?.message,
          preference: preferenceReset.error?.message,
        })
      } else {
        console.info('Meeting reminder reset after an update.', { meetingId })
      }
    }

    const { data: attendees } = await admin.from('employee_meeting_attendees').select('employee_id').eq('meeting_id', meetingId)
    const attendeeIds = [...new Set((attendees || []).map(row => row.employee_id))]
    if (!attendeeIds.length) {
      console.info('Meeting push skipped: no attendees.')
      return response({ sent: 0 })
    }
    const { data: subscriptions } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth,user_id').in('user_id', attendeeIds)
    console.info('Meeting push recipients resolved.', { attendees: attendeeIds.length, subscriptions: subscriptions?.length ?? 0 })

    const labels: Record<string, string> = {
      created: 'New meeting assigned',
      updated: 'Meeting updated',
      cancelled: 'Meeting cancelled',
    }
    const body = `${meeting.content} | ${meeting.start_time?.slice(0, 5)}-${meeting.end_time?.slice(0, 5)} | ${meeting.location}`
    webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))

    let sent = 0
    for (const subscription of subscriptions || []) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify({ title: labels[event], body, route: 'meeting-info' }),
        )
        sent += 1
      } catch (error) {
        const status = Number((error as { statusCode?: number }).statusCode)
        console.error('Meeting push delivery failed.', { status, message: error instanceof Error ? error.message : String(error) })
        if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
      }
    }
    console.info('Meeting push completed.', { sent })
    return response({ sent })
  } catch (error) {
    console.error('Meeting push failed unexpectedly.', error)
    return response({ error: 'Unable to send the meeting push notification.' }, 500)
  }
})
