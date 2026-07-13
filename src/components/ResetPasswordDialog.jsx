import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ResetPasswordDialog({ employees, onClose }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async event => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    const employee = employees.find(item => item.email.trim().toLowerCase() === normalizedEmail)
    if (!employee) return setError('Không tìm thấy nhân viên đang hoạt động với email này.')
    if (employee.role !== 'normal') return setError('Chức năng này chỉ áp dụng cho tài khoản normal user.')
    setSending(true); setError(''); setSuccess('')
    const flag = await supabase.from('profiles').update({ must_change_password: true }).eq('id', employee.id)
    if (flag.error) { setSending(false); return setError(flag.error.message) }
    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const result = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })
    setSending(false)
    if (result.error) {
      await supabase.from('profiles').update({ must_change_password: employee.must_change_password }).eq('id', employee.id)
      return setError(result.error.message)
    }
    setSuccess(`Đã gửi link đặt lại mật khẩu đến ${normalizedEmail}.`)
  }

  return <div className="modal-backdrop" role="presentation"><div className="modal"><form className="status-form reset-password-form" onSubmit={submit}><div className="form-title"><div><p className="eyebrow">QUẢN TRỊ TÀI KHOẢN</p><h2>Gửi link đặt lại mật khẩu</h2></div><button type="button" className="close" onClick={onClose} aria-label="Đóng">×</button></div><p className="subtle">User sẽ nhận link qua email và phải đặt mật khẩu mới trước khi dùng hệ thống.</p><label>Email nhân viên<input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="ten@congty.vn" autoFocus /></label>{error && <p className="form-error">{error}</p>}{success && <p className="form-success">{success}</p>}<button className="primary-button" disabled={sending || Boolean(success)}>{sending ? 'Đang gửi...' : success ? 'Đã gửi link' : 'Gửi link reset password'}</button></form></div></div>
}
