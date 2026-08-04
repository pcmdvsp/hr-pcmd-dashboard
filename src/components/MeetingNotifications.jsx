import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { enablePushNotifications, hasPushSubscription, pushSupported } from '../utils/pushNotifications'
import './MeetingNotifications.css'

const formatDate = value => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
const formatTime = value => value ? String(value).slice(0, 5) : 'Time not set'
const statusLabel = { business_trip: 'Business trip', leave: 'Annual leave', sick: 'Sick leave' }
const statusDateRange = notification => notification.start_date && notification.end_date
  ? `From: ${formatDate(notification.start_date)} – To: ${formatDate(notification.end_date)}`
  : 'Date range not available'
const meetingDateTime = notification => {
  if (notification.kind === 'meeting' && notification.meetingIds?.length > 1)
    return `Weekly: ${formatDate(notification.firstDate)} – ${formatDate(notification.lastDate)} · ${formatTime(notification.start_time)} – ${formatTime(notification.end_time)}`
  if (notification.kind === 'cancelled' && notification.cancellationIds?.length > 1)
    return `Cancelled occurrences: ${formatDate(notification.firstDate)} – ${formatDate(notification.lastDate)} · ${formatTime(notification.start_time)} – ${formatTime(notification.end_time)}`
  return `${formatDate(notification.kind === 'cancelled' ? notification.meeting_date : notification.date)} · ${formatTime(notification.start_time)} – ${formatTime(notification.end_time)}`
}

export default function MeetingNotifications({ employeeId, onOpenMeetingInfo }) {
  const [meetings, setMeetings] = useState([])
  const [views, setViews] = useState([])
  const [cancellations, setCancellations] = useState([])
  const [statusUpdates, setStatusUpdates] = useState([])
  const [statusReads, setStatusReads] = useState([])
  const [open, setOpen] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [browserRegistered, setBrowserRegistered] = useState(false)
  const realtimeRefreshTimer = useRef(null)

  useEffect(() => {
    const refreshBrowserRegistration = () => hasPushSubscription().then(setBrowserRegistered).catch(() => setBrowserRegistered(false))
    refreshBrowserRegistration()
    window.addEventListener('focus', refreshBrowserRegistration)
    return () => window.removeEventListener('focus', refreshBrowserRegistration)
  }, [])

  const load = useCallback(async () => {
    const [attendeeResult, viewResult, cancellationResult, statusResult, statusReadResult] = await Promise.all([
      supabase.from('employee_meeting_attendees').select('meeting_id').eq('employee_id', employeeId),
      supabase.from('employee_meeting_views').select('meeting_id,seen_at,seen_meeting_updated_at,notification_meeting_updated_at').eq('employee_id', employeeId),
      supabase.from('employee_meeting_cancellations').select('id,content,meeting_date,start_time,end_time,location,cancelled_at,read_at').eq('employee_id', employeeId).order('cancelled_at', { ascending: false }).limit(100),
      supabase.from('status_update_notifications').select('id,employee_id,participant_ids,status,start_date,end_date,content,location,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('status_update_notification_reads').select('notification_id').eq('employee_id', employeeId),
    ])
    if (attendeeResult.error || viewResult.error || cancellationResult.error || statusResult.error || statusReadResult.error) return
    const ids = (attendeeResult.data || []).map(item => item.meeting_id)
    const meetingResult = ids.length
      ? await supabase.from('employee_meetings').select('id,date,start_time,end_time,content,location,updated_at,recurrence_id,recurrence_rule,recurrence_until').in('id', ids).order('date').order('start_time')
      : { data: [], error: null }
    if (meetingResult.error) return
    const statusUpdates = statusResult.data || []
    const statusEmployeeIds = [...new Set(statusUpdates.flatMap(item => [item.employee_id, ...(item.participant_ids || [])]))]
    const employeeResult = statusEmployeeIds.length
      ? await supabase.from('profiles').select('id,full_name').in('id', statusEmployeeIds)
      : { data: [], error: null }
    if (employeeResult.error) return
    const nameById = new Map((employeeResult.data || []).map(employee => [employee.id, employee.full_name]))
    setMeetings(meetingResult.data || [])
    setViews(viewResult.data || [])
    setCancellations(cancellationResult.data || [])
    setStatusUpdates(statusUpdates.map(item => ({ ...item, full_name: nameById.get(item.employee_id) || 'A user', participant_names: (item.participant_ids || []).filter(id => id !== item.employee_id).map(id => nameById.get(id) || 'A user') })))
    setStatusReads(statusReadResult.data || [])
  }, [employeeId])

  useEffect(() => {
    load()
    const interval = window.setInterval(load, 30 * 60 * 1000)
    return () => window.clearInterval(interval)
  }, [load])

  useEffect(() => {
    const scheduleRefresh = () => {
      window.clearTimeout(realtimeRefreshTimer.current)
      realtimeRefreshTimer.current = window.setTimeout(load, 400)
    }
    const channel = supabase
      .channel(`notification-bell:${employeeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_meeting_attendees', filter: `employee_id=eq.${employeeId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_meeting_cancellations', filter: `employee_id=eq.${employeeId}` }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'status_update_notifications' }, scheduleRefresh)
      .subscribe()
    return () => {
      window.clearTimeout(realtimeRefreshTimer.current)
      supabase.removeChannel(channel)
    }
  }, [employeeId, load])

  const notifications = useMemo(() => {
    const viewById = new Map(views.map(view => [view.meeting_id, view]))
    const meetingGroups = new Map()
    meetings.forEach(meeting => {
      const view = viewById.get(meeting.id)
      const key = meeting.recurrence_id || meeting.id
      const isNew = !view || new Date(meeting.updated_at) > new Date(view.notification_meeting_updated_at || 0)
      const existing = meetingGroups.get(key)
      if (existing) {
        existing.meetingIds.push(meeting.id)
        existing.lastDate = meeting.date
        existing.isNew ||= isNew
        existing.updatedAtByMeetingId[meeting.id] = meeting.updated_at
        if (new Date(meeting.updated_at) > new Date(existing.notificationDate)) existing.notificationDate = meeting.updated_at
        return
      }
      meetingGroups.set(key, { ...meeting, kind: 'meeting', meetingIds: [meeting.id], updatedAtByMeetingId: { [meeting.id]: meeting.updated_at }, firstDate: meeting.date, lastDate: meeting.date, notificationDate: meeting.updated_at, isNew })
    })
    const meetingNotifications = [...meetingGroups.values()]
    // All cancellation rows created by one Cancel action share cancelled_at.
    // Group them so cancelling future occurrences produces one bell item.
    const cancellationGroups = new Map()
    cancellations.forEach(cancellation => {
      const key = cancellation.cancelled_at || cancellation.id
      const existing = cancellationGroups.get(key)
      if (existing) {
        existing.cancellationIds.push(cancellation.id)
        if (cancellation.meeting_date < existing.firstDate) existing.firstDate = cancellation.meeting_date
        if (cancellation.meeting_date > existing.lastDate) existing.lastDate = cancellation.meeting_date
        existing.isNew ||= !cancellation.read_at
        return
      }
      cancellationGroups.set(key, {
        ...cancellation,
        kind: 'cancelled',
        cancellationIds: [cancellation.id],
        firstDate: cancellation.meeting_date,
        lastDate: cancellation.meeting_date,
        notificationDate: cancellation.cancelled_at,
        isNew: !cancellation.read_at,
      })
    })
    const cancellationNotifications = [...cancellationGroups.values()]
    const statusNotifications = statusUpdates
      .map(update => ({ ...update, kind: 'status', notificationDate: update.created_at, isNew: !statusReads.some(read => read.notification_id === update.id) }))
    return [...cancellationNotifications, ...meetingNotifications, ...statusNotifications]
      .sort((a, b) => new Date(b.notificationDate) - new Date(a.notificationDate))
      .slice(0, 15)
  }, [meetings, views, cancellations, statusUpdates, statusReads])

  const unreadCount = useMemo(() => notifications.filter(notification => notification.isNew).length, [notifications])

  const openNotification = async notification => {
    if (notification.kind === 'status') {
      const result = await supabase.from('status_update_notification_reads').upsert({ notification_id: notification.id, employee_id: employeeId }, { onConflict: 'notification_id,employee_id' })
      if (!result.error) setStatusReads(current => current.some(item => item.notification_id === notification.id) ? current : [...current, { notification_id: notification.id }])
      setOpen(false)
      return
    }
    if (notification.kind === 'cancelled') {
      const cancellationIds = notification.cancellationIds || [notification.id]
      const readAt = new Date().toISOString()
      const result = await supabase.from('employee_meeting_cancellations').update({ read_at: readAt }).in('id', cancellationIds)
      if (!result.error) setCancellations(current => current.map(item => cancellationIds.includes(item.id) ? { ...item, read_at: readAt } : item))
    } else {
      const seenAt = new Date().toISOString()
      const meetingIds = notification.meetingIds || [notification.id]
      const nextViews = meetingIds.map(meetingId => {
        const currentView = views.find(view => view.meeting_id === meetingId)
        return { meeting_id: meetingId, employee_id: employeeId, seen_at: currentView?.seen_at || seenAt, seen_meeting_updated_at: currentView?.seen_meeting_updated_at || '1970-01-01T00:00:00.000Z', notification_meeting_updated_at: notification.updatedAtByMeetingId?.[meetingId] || notification.updated_at }
      })
      const result = await supabase.from('employee_meeting_views').upsert(nextViews, { onConflict: 'meeting_id,employee_id' })
      if (!result.error) setViews(current => [...current.filter(view => !meetingIds.includes(view.meeting_id)), ...nextViews])
    }
    setOpen(false)
    onOpenMeetingInfo()
  }
  const enablePush = async () => {
    try { await enablePushNotifications(employeeId); setBrowserRegistered(true); setPushMessage('Browser notifications enabled.') }
    catch (error) { setPushMessage(error.message || 'Unable to enable browser notifications.') }
  }

  return <div className="meeting-notifications">
    <button type="button" className="notification-bell" aria-label="Notifications" aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) load() }}>
      <Bell size={18} strokeWidth={2.2}/>{unreadCount > 0 && <b>{unreadCount > 99 ? '99+' : unreadCount}</b>}
    </button>
    {open && <section className="notification-panel" aria-label="Notifications">
      <header><strong>Notifications</strong><span>{unreadCount} new</span></header>
      {pushSupported() && <button type="button" className="notification-enable-push" onClick={enablePush} disabled={browserRegistered}>{browserRegistered ? 'Browser notifications registered' : Notification.permission === 'granted' ? 'Register this browser for notifications' : 'Enable browser notifications'}</button>}
      {pushMessage && <p className="notification-push-message">{pushMessage}</p>}
      {notifications.length ? <div className="notification-list">{notifications.map(notification => <button type="button" className={`notification-item ${notification.kind === 'cancelled' ? 'is-cancelled' : ''} ${notification.kind === 'status' ? 'is-status-update' : ''}`} key={`${notification.kind}-${notification.recurrence_id || notification.id}`} onClick={() => openNotification(notification)}>{notification.kind === 'status' ? <><b>{notification.full_name} updated his status{notification.status === 'business_trip' && notification.participant_names?.length ? ` and ${notification.participant_names.join(', ')}` : ''} to {statusLabel[notification.status]}.</b><span>{statusDateRange(notification)}</span>{notification.status === 'business_trip' && <><small>Content: {notification.content || 'Not specified'}</small><small>Location: {notification.location || 'Not specified'}</small></>}{notification.status === 'leave' && <small>Location: {notification.location || 'Not specified'}</small>}</> : <><b>{notification.kind === 'cancelled' ? `Canceled: ${notification.content}` : notification.content || 'Meeting'}</b><span>{meetingDateTime(notification)}</span><small>{notification.location || 'Location not specified'}</small></>}{notification.isNew && <em className="notification-new-tag">New</em>}</button>)}</div> : <p>No notifications yet.</p>}
    </section>}
  </div>
}
