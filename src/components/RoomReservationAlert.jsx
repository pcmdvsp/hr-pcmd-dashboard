import { useEffect, useState } from 'react'
import './RoomReservationAlert.css'

export const showRoomReservationAlert = message => window.dispatchEvent(new CustomEvent('room-reservation-alert', { detail: message }))

export default function RoomReservationAlert() {
  const [message, setMessage] = useState('')
  useEffect(() => { const open = event => setMessage(event.detail); window.addEventListener('room-reservation-alert', open); return () => window.removeEventListener('room-reservation-alert', open) }, [])
  if (!message) return null
  return <div className="room-alert-backdrop" role="presentation"><section className="room-alert" role="alertdialog" aria-modal="true" aria-labelledby="room-alert-title"><h2 id="room-alert-title">Meeting room unavailable</h2><p>{message}</p><button className="primary-button" onClick={() => setMessage('')}>Close</button></section></div>
}
