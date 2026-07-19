import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import './MeetingNotifications.css'

const formatDate = value => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
const formatTime = value => value ? String(value).slice(0, 5) : 'Time not set'

export default function MeetingNotifications({ employeeId, onOpenMyStatus }) {
  const [meetings, setMeetings] = useState([])
  const [views, setViews] = useState([])
  const [cancellations, setCancellations] = useState([])
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const [attendeeResult, viewResult, cancellationResult] = await Promise.all([
      supabase.from('employee_meeting_attendees').select('meeting_id').eq('employee_id', employeeId),
      supabase.from('employee_meeting_views').select('meeting_id,seen_at,seen_meeting_updated_at,notification_meeting_updated_at').eq('employee_id', employeeId),
      supabase.from('employee_meeting_cancellations').select('id,content,meeting_date,start_time,end_time,location,cancelled_at,read_at').eq('employee_id', employeeId).is('read_at', null).order('cancelled_at', { ascending: false }),
    ])
    if (attendeeResult.error || viewResult.error || cancellationResult.error) return
    const ids = (attendeeResult.data || []).map(item => item.meeting_id)
    const meetingResult = ids.length
      ? await supabase.from('employee_meetings').select('id,date,start_time,end_time,content,location,updated_at').in('id', ids).order('date').order('start_time')
      : { data: [], error: null }
    if (meetingResult.error) return
    setMeetings(meetingResult.data || [])
    setViews(viewResult.data || [])
    setCancellations(cancellationResult.data || [])
  }, [employeeId])

  useEffect(() => {
    load()
    const interval = window.setInterval(load, 15000)
    return () => window.clearInterval(interval)
  }, [load])

  const notifications = useMemo(() => {
    const viewById = new Map(views.map(view => [view.meeting_id, view]))
    const meetingNotifications = meetings.filter(meeting => {
      const view = viewById.get(meeting.id)
      return !view || new Date(meeting.updated_at) > new Date(view.notification_meeting_updated_at || 0)
    }).map(meeting => ({ ...meeting, kind: 'meeting', notificationDate: meeting.updated_at }))
    const cancellationNotifications = cancellations.map(cancellation => ({ ...cancellation, kind: 'cancelled', notificationDate: cancellation.cancelled_at }))
    return [...cancellationNotifications, ...meetingNotifications].sort((a, b) => new Date(b.notificationDate) - new Date(a.notificationDate))
  }, [meetings, views, cancellations])

  const openNotification = async notification => {
    if (notification.kind === 'cancelled') {
      const result = await supabase.from('employee_meeting_cancellations').update({ read_at: new Date().toISOString() }).eq('id', notification.id)
      if (!result.error) setCancellations(current => current.filter(item => item.id !== notification.id))
    } else {
      const seenAt = new Date().toISOString()
      const currentView = views.find(view => view.meeting_id === notification.id)
      const result = await supabase.from('employee_meeting_views').upsert({ meeting_id: notification.id, employee_id: employeeId, seen_at: currentView?.seen_at || seenAt, seen_meeting_updated_at: currentView?.seen_meeting_updated_at || '1970-01-01T00:00:00.000Z', notification_meeting_updated_at: notification.updated_at }, { onConflict: 'meeting_id,employee_id' })
      if (!result.error) setViews(current => [...current.filter(view => view.meeting_id !== notification.id), { ...currentView, meeting_id: notification.id, notification_meeting_updated_at: notification.updated_at }])
    }
    setOpen(false)
    onOpenMyStatus()
  }

  return <div className="meeting-notifications">
    <button type="button" className="notification-bell" aria-label="Meeting notifications" aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) load() }}>
      <Bell size={18} strokeWidth={2.2}/>{notifications.length > 0 && <b>{notifications.length > 99 ? '99+' : notifications.length}</b>}
    </button>
    {open && <section className="notification-panel" aria-label="Meeting notifications">
      <header><strong>Meeting notifications</strong><span>{notifications.length} new</span></header>
      {notifications.length ? <div>{notifications.map(notification => <button type="button" className={`notification-item ${notification.kind === 'cancelled' ? 'is-cancelled' : ''}`} key={`${notification.kind}-${notification.id}`} onClick={() => openNotification(notification)}><b>{notification.kind === 'cancelled' ? `Canceled: ${notification.content}` : notification.content || 'Meeting'}</b><span>{formatDate(notification.kind === 'cancelled' ? notification.meeting_date : notification.date)} · {formatTime(notification.start_time)} – {formatTime(notification.end_time)}</span><small>{notification.location || 'Location not specified'}</small></button>)}</div> : <p>No new meeting notifications.</p>}
    </section>}
  </div>
}
