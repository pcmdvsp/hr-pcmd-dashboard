import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const env = (name: string) => Deno.env.get(name) ?? ''
const key = (modern: string, legacy: string) => { try { return JSON.parse(env(modern)).default as string } catch { return env(legacy) } }
const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const vietnamDate = (offset: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offset * 86400000))
const actionUrl = (url: string) => `${url}/functions/v1/meeting-reminder-action`
const reminderPayload = (meeting: { content: string, location: string, start_time: string }, token: string, url: string, title = 'Meeting starts in 15 minutes') => JSON.stringify({
  title,
  body: `${meeting.content} | ${meeting.start_time?.slice(0, 5)} | ${meeting.location}`,
  route: 'meeting-info',
  actionUrl: actionUrl(url),
  actionToken: token,
  actions: [{ action: 'snooze', title: 'Snooze 5 minutes' }, { action: 'stop', title: 'Stop reminders' }],
})

Deno.serve(async request => {
  if (request.headers.get('x-cron-secret') !== env('CRON_SECRET')) return response({ error: 'Unauthorized.' }, 401)
  const url = env('SUPABASE_URL'), serviceKey = key('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey || !env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY') || !env('VAPID_SUBJECT')) return response({ error: 'Push notification secrets are not configured.' }, 500)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  let sent = 0

  const { data: meetings, error } = await admin.from('employee_meetings').select('id,date,content,location,start_time,end_time').in('date', [vietnamDate(0), vietnamDate(1)])
  if (error) return response({ error: error.message }, 500)
  for (const meeting of meetings || []) {
    const diff = Date.parse(`${meeting.date}T${String(meeting.start_time).slice(0, 8)}+07:00`) - Date.now()
    if (diff < 10 * 60000 || diff > 15 * 60000) continue
    const { data: attendees } = await admin.from('employee_meeting_attendees').select('employee_id').eq('meeting_id', meeting.id)
    for (const recipientId of [...new Set((attendees || []).map(row => row.employee_id))]) {
      const delivery = await admin.from('meeting_push_deliveries').insert({ meeting_id: meeting.id, recipient_id: recipientId, kind: 'reminder_15' })
      if (delivery.error) continue
      const { data: preference, error: preferenceError } = await admin.from('meeting_reminder_preferences').upsert({ meeting_id: meeting.id, recipient_id: recipientId, snoozed_until: null, stopped_at: null }, { onConflict: 'meeting_id,recipient_id' }).select('action_token,stopped_at').single()
      if (preferenceError || preference?.stopped_at) continue
      const { data: subscriptions } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', recipientId)
      for (const subscription of subscriptions || []) {
        try {
          await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, reminderPayload(meeting, preference.action_token, url))
          sent += 1
        } catch (pushError) {
          const status = Number((pushError as { statusCode?: number }).statusCode)
          if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
        }
      }
    }
  }

  // A snooze is stored by the Service Worker action. The scheduler sends one
  // extra reminder when its five-minute time arrives, then clears the snooze.
  const { data: snoozes } = await admin.from('meeting_reminder_preferences').select('meeting_id,recipient_id,action_token').not('snoozed_until', 'is', null).lte('snoozed_until', new Date().toISOString()).is('stopped_at', null)
  for (const snooze of snoozes || []) {
    const { data: meeting } = await admin.from('employee_meetings').select('id,date,content,location,start_time,end_time').eq('id', snooze.meeting_id).maybeSingle()
    if (!meeting) continue
    const { data: subscriptions } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', snooze.recipient_id)
    let delivered = false
    for (const subscription of subscriptions || []) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, reminderPayload(meeting, snooze.action_token, url, 'Meeting reminder'))
        sent += 1; delivered = true
      } catch (pushError) {
        const status = Number((pushError as { statusCode?: number }).statusCode)
        if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
      }
    }
    if (delivered) await admin.from('meeting_reminder_preferences').update({ snoozed_until: null }).eq('meeting_id', snooze.meeting_id).eq('recipient_id', snooze.recipient_id)
  }
  return response({ sent })
})
