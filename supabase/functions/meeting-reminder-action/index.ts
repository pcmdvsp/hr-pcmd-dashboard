import { createClient } from 'npm:@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers })
const env = (name: string) => Deno.env.get(name) ?? ''
const key = (modern: string, legacy: string) => { try { return JSON.parse(env(modern)).default as string } catch { return env(legacy) } }

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405)
  const serviceKey = key('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const url = env('SUPABASE_URL')
  if (!url || !serviceKey) return response({ error: 'Function secrets are not configured.' }, 500)
  let input: { token?: unknown, action?: unknown }
  try { input = await request.json() } catch { return response({ error: 'Invalid request body.' }, 400) }
  const token = typeof input.token === 'string' ? input.token : ''
  const action = typeof input.action === 'string' ? input.action : ''
  if (!token || !['snooze', 'stop'].includes(action)) return response({ error: 'Invalid reminder action.' }, 400)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const changes = action === 'snooze'
    ? { snoozed_until: new Date(Date.now() + 5 * 60000).toISOString(), stopped_at: null }
    : { snoozed_until: null, stopped_at: new Date().toISOString() }
  const { error } = await admin.from('meeting_reminder_preferences').update(changes).eq('action_token', token)
  if (error) return response({ error: error.message }, 500)
  return response({ ok: true, action })
})
