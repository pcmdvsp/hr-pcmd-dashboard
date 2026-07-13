import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const submit = async event => { event.preventDefault(); setLoading(true); setError(''); const { error: resultError } = await supabase.auth.signInWithPassword({ email, password }); setLoading(false); if (resultError) setError(resultError.message) }
  return <main className="auth-layout"><form className="auth-card" onSubmit={submit}><div className="brand-mark">HR</div><p className="eyebrow">INTERNAL PORTAL</p><h1>HR Dashboard</h1><p>Sign in with your work email to update your daily work status.</p><label>Email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" /></label><label>Password<input required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button></form></main>
}
