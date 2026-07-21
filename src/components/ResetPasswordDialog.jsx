import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ResetPasswordDialog({ employees, onClose }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async event => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    const employee = employees.find(item => item.email.trim().toLowerCase() === normalizedEmail)
    if (!employee) return setError('No active employee was found with this email address.')
    if (employee.role !== 'normal') return setError('This feature is available only for normal user accounts.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirmPassword) return setError('Password confirmation does not match.')

    setSaving(true); setError(''); setSuccess('')
    const result = await supabase.functions.invoke('admin-set-password', { body: { email: normalizedEmail, password } })
    setSaving(false)
    if (result.error) return setError(result.error.message || 'Unable to set the password.')
    setPassword(''); setConfirmPassword('')
    setSuccess(`A temporary password has been set for ${normalizedEmail}. The user must change it after signing in.`)
  }

  return <div className="modal-backdrop" role="presentation"><div className="modal"><form className="status-form reset-password-form" onSubmit={submit}>
    <div className="form-title"><div><p className="eyebrow">ACCOUNT ADMINISTRATION</p><h2>Set temporary password</h2></div><button type="button" className="close" onClick={onClose} aria-label="Close">×</button></div>
    <p className="subtle">Set a temporary password and communicate it to the user securely. The user will be required to change it at the next sign-in.</p>
    <label>Employee email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@vietsov.com.vn" autoFocus /></label>
    <label>Temporary password<input required minLength="8" type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>
    <label>Confirm temporary password<input required minLength="8" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
    {error && <p className="form-error">{error}</p>}{success && <p className="form-success">{success}</p>}
    <button className="primary-button" disabled={saving || Boolean(success)}>{saving ? 'Saving...' : success ? 'Password set' : 'Set temporary password'}</button>
  </form></div></div>
}
