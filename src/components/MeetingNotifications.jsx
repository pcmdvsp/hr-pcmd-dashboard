import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import './MeetingNotifications.css'

const formatDate = value => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
const formatTime = value => value ? String(value).slice(0, 5) : 'Time not set'
const statusLabel = { business_trip: 'Business trip', leave: 'Annual leave', sick: 'Sick leave' }
const statusDateRange = notification => notification.start_date && notification.end_date
  ? `From: ${formatDate(notification.start_date)} – To: ${formatDate(notification.end_date)}`
  : 'Date range not available'

export default function MeetingNotifications({ employeeId, onOpenMyStatus }) {
  const [meetings, setMeetings] = useState([])
  const [views, setViews] = useState([])
  const [cancellations, setCancellations] = useState([])
  const [statusUpdates, setStatusUpdates] = useState([])
  const [statusReads, setStatusReads] = useState([])
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const [attendeeResult, viewResult, cancellationResult, statusResult, statusReadResult] = await Promise.all([
      supabase.from('employee_meeting_attendees').select('meeting_id').eq('employee_id', employeeId),
      supabase.from('employee_meeting_views').select('meeting_id,seen_at,seen_meeting_updated_at,notification_meeting_updated_at').eq('employee_id', employeeId),
      supabase.from('employee_meeting_cancellations').select('id,content,meeting_date,start_time,end_time,location,cancelled_at,read_at').eq('employee_id', employeeId).is('read_at', null).order('cancelled_at', { ascending: false }),
      supabase.from('status_update_notifications').select('id,employee_id,status,start_date,end_date,content,location,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('status_update_notification_reads').select('notification_id').eq('employee_id', employeeId),
    ])
    if (attendeeResult.error || viewResult.error || cancellationResult.error || statusResult.error || statusReadResult.error) return
    const ids = (attendeeResult.data || []).map(item => item.meeting_id)
    const meetingResult = ids.length
      ? await supabase.from('employee_meetings').select('id,date,start_time,end_time,content,location,updated_at').in('id', ids).order('date').order('start_time')
      : { data: [], error: null }
    if (meetingResult.error) return
    const statusUpdates = statusResult.data || []
    const statusEmployeeIds = [...new Set(statusUpdates.map(item => item.employee_id))]
    const employeeResult = statusEmployeeIds.length
      ? await supabase.from('profiles').select('id,full_name').in('id', statusEmployeeIds)
      : { data: [], error: null }
    if (employeeResult.error) return
    const nameById = new Map((employeeResult.data || []).map(employee => [employee.id, employee.full_name]))
    setMeetings(meetingResult.data || [])
    setViews(viewResult.data || [])
    setCancellations(cancellationResult.data || [])
    setStatusUpdates(statusUpdates.map(item => ({ ...item, full_name: nameById.get(item.employee_id) || 'A user' })))
    setStatusReads(statusReadResult.data || [])
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
    const statusNotifications = statusUpdates
      .filter(update => !statusReads.some(read => read.notification_id === update.id))
      .map(update => ({ ...update, kind: 'status', notificationDate: update.created_at }))
    return [...cancellationNotifications, ...meetingNotifications, ...statusNotifications].sort((a, b) => new Date(b.notificationDate) - new Date(a.notificationDate))
  }, [meetings, views, cancellations, statusUpdates, statusReads])

  const openNotification = async notification => {
    if (notification.kind === 'status') {
      const result = await supabase.from('status_update_notification_reads').upsert({ notification_id: notification.id, employee_id: employeeId }, { onConflict: 'notification_id,employee_id' })
      if (!result.error) setStatusReads(current => [...current, { notification_id: notification.id }])
      setOpen(false)
      return
    }
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
    <button type="button" className="notification-bell" aria-label="Notifications" aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) load() }}>
      <Bell size={18} strokeWidth={2.2}/>{notifications.length > 0 && <b>{notifications.length > 99 ? '99+' : notifications.length}</b>}
    </button>
    {open && <section className="notification-panel" aria-label="Notifications">
      <header><strong>Notifications</strong><span>{notifications.length} new</span></header>
      {notifications.length ? <div>{notifications.map(notification => <button type="button" className={`notification-item ${notification.kind === 'cancelled' ? 'is-cancelled' : ''} ${notification.kind === 'status' ? 'is-status-update' : ''}`} key={`${notification.kind}-${notification.id}`} onClick={() => openNotification(notification)}>{notification.kind === 'status' ? <><b>{notification.full_name} updated his status to {statusLabel[notification.status]}.</b><span>{statusDateRange(notification)}</span>{notification.status === 'business_trip' && <><small>Content: {notification.content || 'Not specified'}</small><small>Location: {notification.location || 'Not specified'}</small></>}{notification.status === 'leave' && <small>Location: {notification.location || 'Not specified'}</small>}</> : <><b>{notification.kind === 'cancelled' ? `Canceled: ${notification.content}` : notification.content || 'Meeting'}</b><span>{formatDate(notification.kind === 'cancelled' ? notification.meeting_date : notification.date)} · {formatTime(notification.start_time)} – {formatTime(notification.end_time)}</span><small>{notification.location || 'Location not specified'}</small></>}</button>)}</div> : <p>No new notifications.</p>}
    </section>}
  </div>
}
