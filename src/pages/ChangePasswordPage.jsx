import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ChangePasswordPage({ refreshProfile }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (password.length < 8) return setError('Mật khẩu cần ít nhất 8 ký tự.')
    if (password !== confirm) return setError('Xác nhận mật khẩu chưa khớp.')
    setSaving(true); setError(''); setSuccess(false)
    const auth = await supabase.auth.updateUser({ password })
    if (auth.error) { setSaving(false); return setError(auth.error.message) }
    const profile = await supabase.rpc('complete_password_change')
    setSaving(false)
    if (profile.error) return setError(profile.error.message)
    setSuccess(true)
    setTimeout(() => refreshProfile(), 900)
  }

  return <main className="auth-layout"><form className="auth-card" onSubmit={submit}><div className="brand-mark">!</div><p className="eyebrow">BẢO MẬT TÀI KHOẢN</p><h1>Đổi mật khẩu</h1><p>Bạn đang dùng mật khẩu tạm thời. Vui lòng đặt mật khẩu riêng trước khi tiếp tục.</p><label>Mật khẩu mới<input required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label><label>Xác nhận mật khẩu<input required type="password" value={confirm} onChange={event => setConfirm(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}{success && <p style={{ color: '#227a48', fontSize: 13 }}>Đổi mật khẩu thành công. Đang chuyển đến Dashboard...</p>}<button className="primary-button" disabled={saving || success}>{saving ? 'Đang cập nhật...' : success ? 'Đã cập nhật' : 'Xác nhận mật khẩu mới'}</button></form></main>
}
