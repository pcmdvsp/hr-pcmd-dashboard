import { useEffect, useState } from 'react'
import './SuccessAlert.css'

export const showSuccessAlert = message => window.dispatchEvent(new CustomEvent('success-alert', { detail: message }))

export default function SuccessAlert() {
  const [message, setMessage] = useState('')
  useEffect(() => { const open = event => setMessage(event.detail); window.addEventListener('success-alert', open); return () => window.removeEventListener('success-alert', open) }, [])
  if (!message) return null
  return <div className="success-alert-backdrop" role="presentation"><section className="success-alert" role="alertdialog" aria-modal="true" aria-labelledby="success-alert-title"><h2 id="success-alert-title">Update successful</h2><p>{message}</p><button className="primary-button" onClick={() => setMessage('')}>Close</button></section></div>
}
