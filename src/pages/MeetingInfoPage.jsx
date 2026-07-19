import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatDate, today } from '../utils/status'
import { showRoomReservationAlert } from '../components/RoomReservationAlert'
import { getUnavailableMeetingParticipants } from '../utils/meetingAvailability'
import './MeetingInfoPage.css'

const KNT_MEETING_ROOM = 'KNT meeting room'
const ROOM_MESSAGE = 'The meeting room has been reserved for the selected time. Please choose different time!'

const timeRange = meeting => meeting.start_time && meeting.end_time
  ? `${meeting.start_time.slice(0, 5)} – ${meeting.end_time.slice(0, 5)}`
  : meeting.start_time?.slice(0, 5) || 'Time not set'

const moveDate = (date, delta) => {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + delta)
  return value.toISOString().slice(0, 10)
}

export default function MeetingInfoPage({ profile, goBack }) {
  const [date, setDate] = useState(today())
  const [meetings, setMeetings] = useState([])
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [attendees, setAttendees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [actionMeeting, setActionMeeting] = useState(null)
  const [cancellingMeeting, setCancellingMeeting] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [meetingResult, employeeResult, departmentResult] = await Promise.all([
      supabase.from('employee_meetings').select('id,organizer_id,date,content,location,online_link,start_time,end_time').eq('date', date).order('start_time'),
      supabase.from('profiles').select('id,full_name,employee_code,department_id').eq('active', true).order('full_name'),
      supabase.from('departments').select('id,name,sort_order').order('sort_order'),
    ])
    if (meetingResult.error || employeeResult.error || departmentResult.error) {
      setError(meetingResult.error?.message || employeeResult.error?.message || departmentResult.error?.message)
      setLoading(false)
      return
    }
    const ids = (meetingResult.data || []).map(meeting => meeting.id)
    const attendeeResult = ids.length
      ? await supabase.from('employee_meeting_attendees').select('meeting_id,employee_id').in('meeting_id', ids)
      : { data: [], error: null }
    if (attendeeResult.error) setError(attendeeResult.error.message)
    setMeetings(meetingResult.data || [])
    setEmployees(employeeResult.data || [])
    setDepartments(departmentResult.data || [])
    setAttendees(attendeeResult.data || [])
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees])
  const departmentById = useMemo(() => new Map(departments.map(department => [department.id, department])), [departments])
  const groupedMeetings = useMemo(() => {
    const groups = new Map()
    meetings.forEach(meeting => {
      const organizer = employeeById.get(meeting.organizer_id)
      const participantPeople = attendees
        .filter(attendee => attendee.meeting_id === meeting.id)
        .map(attendee => employeeById.get(attendee.employee_id))
        .filter(Boolean)
      const involvedPeople = [organizer, ...participantPeople].filter(Boolean)
      const departmentIds = [...new Set(involvedPeople.map(person => person.department_id || 'leadership'))]
      departmentIds.forEach(departmentId => {
        const department = departmentById.get(departmentId)
        if (!groups.has(departmentId)) groups.set(departmentId, { name: department?.name || 'Leadership', sortOrder: department?.sort_order ?? -1, items: [] })
        const participantsInDepartment = participantPeople.filter(person => (person.department_id || 'leadership') === departmentId)
        groups.get(departmentId).items.push({ ...meeting, participants: participantsInDepartment.length ? participantsInDepartment : [organizer].filter(Boolean) })
      })
    })
    return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  }, [meetings, attendees, employeeById, departmentById])

  const canEdit = meeting => meeting.organizer_id === profile.id || profile.role === 'admin'
  const selectedAttendeeIds = editing ? attendees.filter(attendee => attendee.meeting_id === editing.id).map(attendee => attendee.employee_id) : []
  const cancelMeeting = async meeting => {
    setActionMeeting(null)
    setCancellingMeeting(null)
    setError('')
    const attendeeLookup = await supabase.from('employee_meeting_attendees').select('employee_id').eq('meeting_id', meeting.id)
    if (attendeeLookup.error) return setError(attendeeLookup.error.message)
    const cancellationRows = (attendeeLookup.data || []).map(attendee => ({ employee_id: attendee.employee_id, meeting_id: meeting.id, content: meeting.content || 'Meeting', meeting_date: meeting.date, start_time: meeting.start_time, end_time: meeting.end_time, location: meeting.location }))
    if (cancellationRows.length) {
      const notificationResult = await supabase.from('employee_meeting_cancellations').insert(cancellationRows)
      if (notificationResult.error) return setError(notificationResult.error.message)
    }
    const attendeesResult = await supabase.from('employee_meeting_attendees').delete().eq('meeting_id', meeting.id)
    if (attendeesResult.error) return setError(attendeesResult.error.message)
    const meetingResult = await supabase.from('employee_meetings').delete().eq('id', meeting.id)
    if (meetingResult.error) return setError(meetingResult.error.message)
    load()
  }

  return <main className="app-shell meeting-page">
    <header className="topbar">
      <div><p className="eyebrow">EMPLOYEE MEETINGS</p><h1>Meeting Info</h1><p className="subtle">{formatDate(date)}</p></div>
      <button className="secondary-button" onClick={goBack}>← Back to dashboard</button>
    </header>
    <section className="monthly-controls">
      <button onClick={() => setDate(moveDate(date, -1))}>← Previous day</button>
      <input type="date" value={date} onChange={event => setDate(event.target.value)} />
      <button onClick={() => setDate(moveDate(date, 1))}>Next day →</button>
      <button onClick={() => setDate(today())}>Today</button>
    </section>
    {error && <p className="notice error">{error}</p>}
    {loading ? <p className="loading">Loading meetings...</p> : <div className="monthly-table-wrap">
      <table className="monthly-table">
        <thead><tr><th>Content</th><th>Date</th><th>Location</th><th>Participants</th><th>Actions</th><th>Online link</th></tr></thead>
        <tbody>{groupedMeetings.map(group => <Fragment key={group.name}>
          <tr><td colSpan="6"><b>{group.name}</b></td></tr>
          {group.items.map(meeting => <tr key={`${group.name}-${meeting.id}`}>
            <td>{meeting.content || '—'}</td>
            <td>{timeRange(meeting)}</td>
            <td>{meeting.location || '—'}</td>
            <td>{meeting.participants.map(person => person.full_name).join(', ') || '—'}</td>
            <td>{canEdit(meeting) ? <button className="secondary-button" onClick={() => setActionMeeting(meeting)}>Edit</button> : '—'}</td>
            <td>{meeting.online_link ? <a href={meeting.online_link} target="_blank" rel="noreferrer">Go online</a> : '—'}</td>
          </tr>)}
        </Fragment>)}</tbody>
      </table>
      {meetings.length === 0 && <p className="empty">No meetings scheduled for this day.</p>}
    </div>}
    {editing && <div className="modal-backdrop"><div className="modal">
      <MeetingEditor meeting={editing} employees={employees} attendeeIds={selectedAttendeeIds} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
    </div></div>}
    {actionMeeting && <div className="modal-backdrop"><section className="meeting-action-dialog" role="dialog" aria-modal="true"><button type="button" className="close" onClick={() => setActionMeeting(null)} aria-label="Close">×</button><p className="eyebrow">MEETING ACTIONS</p><h2>{actionMeeting.content || 'Meeting'}</h2><p>Choose an action for this meeting.</p><div><button type="button" className="secondary-button" onClick={() => { setActionMeeting(null); setEditing(actionMeeting) }}>Update meeting</button><button type="button" className="secondary-button cancel-action" onClick={() => { setActionMeeting(null); setCancellingMeeting(actionMeeting) }}>Cancel meeting</button></div></section></div>}
    {cancellingMeeting && <div className="modal-backdrop"><section className="meeting-action-dialog meeting-cancel-confirm" role="alertdialog" aria-modal="true"><p className="eyebrow">CONFIRM CANCELLATION</p><h2>Cancel this meeting?</h2><p>All assigned participants will be removed and receive a cancellation notification.</p><div><button type="button" className="secondary-button" onClick={() => setCancellingMeeting(null)}>Keep meeting</button><button type="button" className="secondary-button cancel-action" onClick={() => cancelMeeting(cancellingMeeting)}>Cancel meeting</button></div></section></div>}
  </main>
}

function MeetingEditor({ meeting, employees, attendeeIds, onClose, onSaved }) {
  const [content, setContent] = useState(meeting.content || '')
  const [location, setLocation] = useState(meeting.location || '')
  const [onlineLink, setOnlineLink] = useState(meeting.online_link || '')
  const [startTime, setStartTime] = useState(meeting.start_time?.slice(0, 5) || '')
  const [endTime, setEndTime] = useState(meeting.end_time?.slice(0, 5) || '')
  const [selectedIds, setSelectedIds] = useState(attendeeIds)
  const [query, setQuery] = useState('')
  const [unavailable, setUnavailable] = useState(new Map())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (error === ROOM_MESSAGE) showRoomReservationAlert(ROOM_MESSAGE) }, [error])
  useEffect(() => { getUnavailableMeetingParticipants([meeting.date]).then(nextUnavailable => { setUnavailable(nextUnavailable); setSelectedIds(ids => ids.filter(id => !nextUnavailable.has(id))) }) }, [meeting.date])
  const results = useMemo(() => {
    const text = query.trim().toLowerCase()
    return text ? employees.filter(employee => `${employee.full_name} ${employee.employee_code}`.toLowerCase().includes(text)) : []
  }, [employees, query])
  const selectedEmployees = useMemo(() => employees.filter(employee => selectedIds.includes(employee.id)), [employees, selectedIds])
  const toggleParticipant = id => { if (!unavailable.has(id)) setSelectedIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]) }

  const submit = async event => {
    event.preventDefault()
    if (!content.trim() || !location.trim()) return setError('Content and location are required.')
    if (!startTime || !endTime) return setError('Start time and end time are required for a meeting.')
    if (endTime < startTime) return setError('The end time must not be earlier than the start time.')
    setSaving(true)
    setError('')
    const currentUnavailable = await getUnavailableMeetingParticipants([meeting.date])
    const invalidSelected = selectedIds.find(id => currentUnavailable.has(id))
    if (invalidSelected) { setSaving(false); return setError(`This participant is unavailable: ${currentUnavailable.get(invalidSelected)}.`) }
    if (location.trim() === KNT_MEETING_ROOM) {
      const reservation = await supabase.from('employee_meetings').select('id').eq('date', meeting.date).eq('location', KNT_MEETING_ROOM).neq('id', meeting.id).lt('start_time', endTime).gt('end_time', startTime).limit(1)
      if (reservation.error) { setSaving(false); return setError(reservation.error.message) }
      if (reservation.data?.length) { setSaving(false); return setError(ROOM_MESSAGE) }
    }
    const update = await supabase.from('employee_meetings').update({
      content: content.trim(), location: location.trim(), online_link: onlineLink.trim() || null, start_time: startTime, end_time: endTime,
    }).eq('id', meeting.id)
    if (update.error) { setSaving(false); return setError(update.error.message) }
    const remove = await supabase.from('employee_meeting_attendees').delete().eq('meeting_id', meeting.id)
    if (remove.error) { setSaving(false); return setError(remove.error.message) }
    if (selectedIds.length) {
      const insert = await supabase.from('employee_meeting_attendees').insert(selectedIds.map(employeeId => ({ meeting_id: meeting.id, employee_id: employeeId })))
      if (insert.error) { setSaving(false); return setError(insert.error.message) }
    }
    setSaving(false)
    onSaved()
  }

  return <form className="status-form" onSubmit={submit}>
    <div className="form-title"><div><p className="eyebrow">EDIT MEETING</p><h2>{meeting.date}</h2></div><button type="button" className="close" onClick={onClose} aria-label="Close">×</button></div>
    <div className="date-range" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
      <label>Start time<input required type="time" value={startTime} onChange={event => setStartTime(event.target.value)} /></label>
      <label>End time<input required type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></label>
    </div>
    <label>Content<textarea required value={content} onChange={event => setContent(event.target.value)} rows="3" /></label>
    <label><span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Location <span><input type="checkbox" checked={location === KNT_MEETING_ROOM} onChange={event => setLocation(event.target.checked ? KNT_MEETING_ROOM : '')} /> {KNT_MEETING_ROOM}</span></span><input required value={location} onChange={event => setLocation(event.target.value)} /></label>
    <label>Online Link <span className="subtle">(optional)</span><input type="url" value={onlineLink} onChange={event => setOnlineLink(event.target.value)} placeholder="https://..." /></label>
    <p className="subtle">Selected participants</p>
    <div className="employee-list" aria-label="Selected meeting participants">
      {selectedEmployees.map(employee => { const reason = unavailable.get(employee.id); return <button type="button" key={employee.id} disabled={Boolean(reason)} className="employee-badge is-editable is-selected" style={reason ? { opacity: .55, cursor: 'not-allowed' } : undefined} onClick={() => toggleParticipant(employee.id)}>✓ {employee.full_name} <span className="employee-code">{reason ? `Unavailable: ${reason}` : employee.employee_code}</span></button> })}
      {selectedEmployees.length === 0 && <p className="empty">No participants selected</p>}
    </div>
    <label>Search participants<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name or employee ID" /></label>
    {query.trim() && <div className="employee-list" aria-label="Meeting participant search results">
      {results.map(employee => { const reason = unavailable.get(employee.id); return <button type="button" key={employee.id} disabled={Boolean(reason)} className={`employee-badge is-editable ${selectedIds.includes(employee.id) ? 'is-selected' : ''}`} style={reason ? { opacity: .55, cursor: 'not-allowed' } : undefined} onClick={() => toggleParticipant(employee.id)}>{selectedIds.includes(employee.id) ? '✓ ' : ''}{employee.full_name} <span className="employee-code">{reason ? `Unavailable: ${reason}` : employee.employee_code}</span></button> })}
      {results.length === 0 && <p className="empty">No matching employees</p>}
    </div>}
    {error && <p className="form-error">{error}</p>}
    <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : 'Update'}</button>
  </form>
}
