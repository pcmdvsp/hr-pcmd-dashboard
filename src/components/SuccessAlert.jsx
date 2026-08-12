import { useEffect, useState } from 'react'
import './SuccessAlert.css'

export const showSuccessAlert = message => window.dispatchEvent(new CustomEvent('success-alert', { detail: typeof message === 'string' ? { message } : message }))

export default function SuccessAlert() {
  const [alert, setAlert] = useState(null)
  useEffect(() => { const open = event => setAlert(event.detail); window.addEventListener('success-alert', open); return () => window.removeEventListener('success-alert', open) }, [])
  if (!alert) return null
  return <div className="success-alert-backdrop" role="presentation"><section className="success-alert" role="alertdialog" aria-modal="true" aria-labelledby="success-alert-title"><h2 id="success-alert-title">Update successful</h2><p>{alert.message}</p>{alert.actionUrl && <a className="success-alert-link" href={alert.actionUrl} target="_blank" rel="noopener noreferrer">{alert.actionLabel || 'Open official request'}</a>}<button className="primary-button" onClick={() => setAlert(null)}>Close</button></section></div>
}
