import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const defaultKey = (modernName: string, legacyName: string) => {
  const modernValue = Deno.env.get(modernName)
  if (modernValue) {
    try { return JSON.parse(modernValue).default as string }
    catch { /* Fall back to the legacy secret below. */ }
  }
  return Deno.env.get(legacyName) ?? ''
}

const response = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return response({ error: 'Authentication is required.' }, 401)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = defaultKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
  const serviceRoleKey = defaultKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceRoleKey) return response({ error: 'Function secrets are not configured.' }, 500)

  const callerClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !caller) return response({ error: 'Your session is invalid or has expired.' }, 401)

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from('profiles').select('role,active').eq('id', caller.id).maybeSingle()
  if (callerProfileError || !callerProfile || callerProfile.role !== 'admin' || !callerProfile.active) {
    return response({ error: 'Only active administrators can set another user\'s password.' }, 403)
  }

  let payload: { email?: unknown, password?: unknown }
  try { payload = await request.json() }
  catch { return response({ error: 'Invalid request body.' }, 400) }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const password = typeof payload.password === 'string' ? payload.password : ''
  if (!email || !email.includes('@')) return response({ error: 'A valid employee email is required.' }, 400)
  if (password.length < 8) return response({ error: 'Password must be at least 8 characters.' }, 400)

  const { data: employee, error: employeeError } = await adminClient
    .from('profiles').select('id,role,active').eq('email', email).maybeSingle()
  if (employeeError || !employee || !employee.active) return response({ error: 'No active employee was found with this email address.' }, 404)
  if (employee.role !== 'normal') return response({ error: 'This feature is available only for normal user accounts.' }, 400)

  const { error: passwordError } = await adminClient.auth.admin.updateUserById(employee.id, { password })
  if (passwordError) return response({ error: passwordError.message }, 400)

  const { error: profileError } = await adminClient
    .from('profiles').update({ must_change_password: true }).eq('id', employee.id)
  if (profileError) return response({ error: 'Password was set, but the password-change flag could not be saved. Please contact a system administrator.' }, 500)

  return response({ message: 'Temporary password set successfully.' })
})
