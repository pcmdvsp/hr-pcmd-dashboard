import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { STATUS, today } from '../utils/status'
import { getUnavailableMeetingParticipants } from '../utils/meetingAvailability'
import { showRoomReservationAlert } from './RoomReservationAlert'
import { showSuccessAlert } from './SuccessAlert'
import './OvertimeConfirmDialog.css'

const KNT_MEETING_ROOM = 'KNT meeting room'
const ROOM_MESSAGE = 'The meeting room has been reserved for the selected time. Please choose different time!'
const selectableStatuses = ['working', 'business_trip', 'leave', 'sick', 'meeting']
const notePlaceholders = { leave: 'Location', sick: 'Type of sickness' }
const draftKey = employeeId => `my-status-draft:${employeeId}`
const readDraft = employeeId => { try { return JSON.parse(sessionStorage.getItem(draftKey(employeeId)) || 'null') } catch { return null } }
const datesInRange = (start, end) => {
  if (!start || !end || end < start) return []
  const dates = []; const cursor = new Date(`${start}T12:00:00`); const last = new Date(`${end}T12:00:00`)
  while (cursor <= last) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setDate(cursor.getDate() + 1) }
  return dates
}

export default function StatusForm({ employee, onSaved, onClose }) {
  const [status, setStatus] = useState('leave')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState(today())
  const [note, setNote] = useState('')
  const [content, setContent] = useState('')
  const [location, setLocation] = useState('')
  const [onlineLink, setOnlineLink] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [participantQuery, setParticipantQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedDepartment, setSelectedDepartment] = useState(null)
  const [unavailable, setUnavailable] = useState(new Map())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [draftInitialized, setDraftInitialized] = useState(false)
  const [confirmOvertime, setConfirmOvertime] = useState(false)
  const [overtimeApproved, setOvertimeApproved] = useState(false)
  const [overtimeDates, setOvertimeDates] = useState([])
  const formRef = useRef(null)
  const needsDetails = status === 'meeting' || status === 'business_trip'
  const dates = useMemo(() => datesInRange(startDate, endDate), [startDate, endDate])

  useEffect(() => { if (error === ROOM_MESSAGE) showRoomReservationAlert(ROOM_MESSAGE) }, [error])
  useEffect(() => {
    const draft = onClose ? null : readDraft(employee.id)
    setDraftInitialized(false)
    setStatus(draft?.status || employee.daily?.status || employee.displayStatus || 'working')
    setStartDate(draft?.startDate || today())
    setEndDate(draft?.endDate || today())
    setNote(draft?.note || employee.daily?.note || '')
    setContent(draft?.content || employee.daily?.content || '')
    setLocation(draft?.location || employee.daily?.location || '')
    setOnlineLink(draft?.onlineLink || '')
    setStartTime(draft?.startTime || employee.daily?.start_time?.slice(0, 5) || '')
    setEndTime(draft?.endTime || employee.daily?.end_time?.slice(0, 5) || '')
    setParticipantQuery(draft?.participantQuery || '')
    setSelectedIds(draft?.selectedIds || (employee.id ? [employee.id] : []))
    setSelectedDepartment(null)
    setConfirmOvertime(false)
    setOvertimeApproved(false)
    setOvertimeDates([])
    setSaved(false)
    setDraftInitialized(true)
  }, [employee, onClose])
  useEffect(() => {
    if (onClose || !draftInitialized || saved) return
    sessionStorage.setItem(draftKey(employee.id), JSON.stringify({ status, startDate, endDate, note, content, location, onlineLink, startTime, endTime, participantQuery, selectedIds }))
  }, [employee.id, onClose, draftInitialized, saved, status, startDate, endDate, note, content, location, onlineLink, startTime, endTime, participantQuery, selectedIds])
  useEffect(() => { if (!onClose && saved) sessionStorage.removeItem(draftKey(employee.id)) }, [employee.id, onClose, saved])
  useEffect(() => {
    if (status !== 'meeting') return
    Promise.all([
      supabase.from('profiles').select('id,full_name,employee_code,department_id').eq('active', true).order('full_name'),
      supabase.from('departments').select('id,name,sort_order').order('sort_order'),
    ]).then(([employeeResult, departmentResult]) => {
      if (employeeResult.error || departmentResult.error) setError(employeeResult.error?.message || departmentResult.error?.message)
      else { setEmployees(employeeResult.data || []); setDepartments(departmentResult.data || []) }
    })
  }, [status])
  useEffect(() => {
    if (status !== 'meeting' || endDate < startDate) { setUnavailable(new Map()); return }
    getUnavailableMeetingParticipants(dates).then(nextUnavailable => {
      setUnavailable(nextUnavailable)
      if (nextUnavailable.has(employee.id)) setSelectedIds(ids => ids.filter(id => id !== employee.id))
    })
  }, [status, dates, startDate, endDate, employee.id])

  const filteredEmployees = useMemo(() => {
    const query = participantQuery.trim().toLowerCase()
    return query ? employees.filter(item => item.id !== employee.id && `${item.full_name} ${item.employee_code}`.toLowerCase().includes(query)) : []
  }, [employees, participantQuery, employee.id])
  const filteredDepartments = useMemo(() => {
    const query = participantQuery.trim().toLowerCase()
    return query ? departments.filter(department => department.name.toLowerCase().includes(query)) : []
  }, [departments, participantQuery])
  const organizerUnavailableReason = unavailable.get(employee.id)
  const markChanged = () => { setSaved(false); setOvertimeApproved(false); setOvertimeDates([]) }
  const toggleParticipant = id => {
    if (unavailable.has(id)) return
    setSelectedIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id])
    markChanged()
  }
  const addDepartmentParticipants = departmentId => {
    const department = departments.find(item => item.id === departmentId)
    const members = employees.filter(item => item.department_id === departmentId && !unavailable.has(item.id))
    setSelectedIds(ids => [...new Set([...ids, ...members.map(member => member.id)])])
    setSelectedDepartment(department || null)
    setParticipantQuery('')
    markChanged()
  }

  const submit = async event => {
    event.preventDefault()
    if (endDate < startDate) return setError('The end date must not be earlier than the start date.')
    if (needsDetails && (!content.trim() || !location.trim())) return setError('Content and location are required.')
    if (status === 'leave' && !note.trim()) return setError('Location is required for annual leave.')
    if (status === 'meeting' && (!startTime || !endTime)) return setError('Start time and end time are required for a meeting.')
    if (status === 'meeting' && endTime < startTime) return setError('The end time must not be earlier than the start time.')
    if ((status === 'working' || status === 'meeting') && !overtimeApproved) {
      const calendarResult = await supabase.from('work_calendar').select('date,day_type').in('date', dates)
      if (calendarResult.error) return setError(calendarResult.error.message)
      const calendarTypes = new Map((calendarResult.data || []).map(day => [day.date, day.day_type]))
      const selectedWeekendDates = dates.filter(date => {
        const dayType = calendarTypes.get(date) || (new Date(`${date}T12:00:00`).getDay() % 6 === 0 ? 'weekend' : 'working_day')
        return dayType === 'weekend'
      })
      if (selectedWeekendDates.length) { setOvertimeDates(selectedWeekendDates); setConfirmOvertime(true); return }
    }
    setSaving(true); setError('')
    if (status === 'meeting') {
      const currentUnavailable = await getUnavailableMeetingParticipants(dates)
      // An unavailable organizer may still create a meeting, but neither the
      // organizer nor any unavailable employee can become an attendee.
      const availableSelectedIds = [...new Set(selectedIds.filter(id => !currentUnavailable.has(id)))]
      if (location.trim() === KNT_MEETING_ROOM) {
        const reservation = await supabase.from('employee_meetings').select('id').in('date', dates).eq('location', KNT_MEETING_ROOM).lt('start_time', endTime).gt('end_time', startTime).limit(1)
        if (reservation.error) { setSaving(false); return setError(reservation.error.message) }
        if (reservation.data?.length) { setSaving(false); return setError(ROOM_MESSAGE) }
      }
      const meetingResult = await supabase.from('employee_meetings').insert(dates.map(date => ({ organizer_id: employee.id, date, content: content.trim(), location: location.trim(), online_link: onlineLink.trim() || null, start_time: startTime, end_time: endTime, is_overtime: overtimeDates.includes(date) }))).select('id')
      if (meetingResult.error) { setSaving(false); return setError(meetingResult.error.message) }
      const meetingIds = (meetingResult.data || []).map(meeting => meeting.id)
      if (meetingIds.length && availableSelectedIds.length) {
        const attendeeResult = await supabase.from('employee_meeting_attendees').insert(meetingIds.flatMap(meetingId => availableSelectedIds.map(employeeId => ({ meeting_id: meetingId, employee_id: employeeId }))))
        if (attendeeResult.error) { setSaving(false); return setError(attendeeResult.error.message) }
      }
    } else {
      if (status !== 'working') {
        const meetingsResult = await supabase.from('employee_meetings').select('id').in('date', dates)
        if (meetingsResult.error) { setSaving(false); return setError(meetingsResult.error.message) }
        const meetingIds = (meetingsResult.data || []).map(meeting => meeting.id)
        const cancelOwnResult = await supabase.from('employee_meetings').delete().eq('organizer_id', employee.id).in('date', dates)
        if (cancelOwnResult.error) { setSaving(false); return setError(cancelOwnResult.error.message) }
        if (meetingIds.length) {
          const leaveResult = await supabase.from('employee_meeting_attendees').delete().eq('employee_id', employee.id).in('meeting_id', meetingIds)
          if (leaveResult.error) { setSaving(false); return setError(leaveResult.error.message) }
        }
      }
      const normalDates = dates.filter(date => !overtimeDates.includes(date))
      const result = status === 'working'
        ? await Promise.all([
          normalDates.length ? supabase.from('daily_status').delete().eq('employee_id', employee.id).in('date', normalDates) : Promise.resolve({ error: null }),
          overtimeDates.length ? supabase.from('daily_status').upsert(overtimeDates.map(date => ({ employee_id: employee.id, date, status: 'working', is_overtime: true, note: null, content: null, location: null, start_time: null, end_time: null })), { onConflict: 'employee_id,date' }) : Promise.resolve({ error: null }),
        ]).then(results => ({ error: results.find(item => item.error)?.error || null }))
        : await supabase.from('daily_status').upsert(dates.map(date => ({ employee_id: employee.id, date, status, is_overtime: false, note: needsDetails ? null : note.trim() || null, content: needsDetails ? content.trim() : null, location: needsDetails ? location.trim() : null, start_time: null, end_time: null })), { onConflict: 'employee_id,date' })
      if (result.error) { setSaving(false); return setError(result.error.message) }
    }
    setSaving(false); setSaved(true); showSuccessAlert('Your status has been updated successfully.'); onSaved?.(); onClose?.()
  }

  return <form ref={formRef} className="status-form" onSubmit={submit}>
    <div className="form-title"><div><p className="eyebrow">UPDATE STATUS</p>{onClose && <h2>{employee.full_name}</h2>}</div>{onClose && <button type="button" className="close" onClick={onClose} aria-label="Close">×</button>}</div>
    <label>Status<select value={status} onChange={event => { setStatus(event.target.value); markChanged() }}>{selectableStatuses.map(key => <option key={key} value={key}>{STATUS[key].label}</option>)}</select></label>
    <div className="date-range" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
      <label>From date<input type="date" min={today()} value={startDate} onChange={event => { setStartDate(event.target.value); if (event.target.value > endDate) setEndDate(event.target.value); markChanged() }} /></label>
      <label>To date<input type="date" min={startDate} value={endDate} onChange={event => { setEndDate(event.target.value); markChanged() }} /></label>
    </div>
    {status === 'meeting' && <>
      <div className="date-range" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <label>Start time<input required type="time" value={startTime} onChange={event => { setStartTime(event.target.value); markChanged() }} /></label>
        <label>End time<input required type="time" value={endTime} onChange={event => { setEndTime(event.target.value); markChanged() }} /></label>
      </div>
      <label>Search participants<input value={participantQuery} onChange={event => { setParticipantQuery(event.target.value); markChanged() }} placeholder="Search by name or employee ID" /></label>
      <div className="employee-list" aria-label="Meeting organizer">
        <button type="button" disabled={Boolean(organizerUnavailableReason)} className={`employee-badge is-editable ${selectedIds.includes(employee.id) ? 'is-selected' : ''}`} style={organizerUnavailableReason ? { opacity: .55, cursor: 'not-allowed' } : undefined} onClick={() => toggleParticipant(employee.id)}>
          {selectedIds.includes(employee.id) ? '✓ ' : ''}{employee.full_name} <span className="employee-code">{organizerUnavailableReason ? `Unavailable: ${organizerUnavailableReason}` : 'Meeting organizer'}</span>
        </button>
      </div>
      {selectedDepartment && <div className="employee-list" aria-label={`${selectedDepartment.name} members`}>
        <p className="subtle">{selectedDepartment.name}</p>
        {employees.filter(item => item.department_id === selectedDepartment.id).map(item => { const reason = unavailable.get(item.id); return <button type="button" key={item.id} disabled={Boolean(reason)} className={`employee-badge is-editable ${selectedIds.includes(item.id) ? 'is-selected' : ''}`} style={reason ? { opacity: .55, cursor: 'not-allowed' } : undefined} onClick={() => toggleParticipant(item.id)}>{selectedIds.includes(item.id) ? '✓ ' : ''}{item.full_name} <span className="employee-code">{reason ? `Unavailable: ${reason}` : item.employee_code}</span></button> })}
      </div>}
      {participantQuery.trim() && <div className="employee-list" aria-label="Meeting participant search results">
        {filteredDepartments.map(department => <button type="button" key={department.id} className="employee-badge is-editable" onClick={() => addDepartmentParticipants(department.id)}>{department.name} <span className="employee-code">Add available members</span></button>)}
        {filteredEmployees.map(item => { const reason = unavailable.get(item.id); return <button type="button" key={item.id} disabled={Boolean(reason)} className={`employee-badge is-editable ${selectedIds.includes(item.id) ? 'is-selected' : ''}`} style={reason ? { opacity: .55, cursor: 'not-allowed' } : undefined} onClick={() => toggleParticipant(item.id)}>{selectedIds.includes(item.id) ? '✓ ' : ''}{item.full_name} <span className="employee-code">{reason ? `Unavailable: ${reason}` : item.employee_code}</span></button> })}
        {filteredEmployees.length === 0 && filteredDepartments.length === 0 && <p className="empty">No matching employees or departments</p>}
      </div>}
    </>}
    {needsDetails ? <>
      <label>Content<textarea required value={content} onChange={event => { setContent(event.target.value); markChanged() }} rows="3" /></label>
      {status === 'meeting' ? <>
        <label><span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Location <span><input type="checkbox" checked={location === KNT_MEETING_ROOM} onChange={event => { setLocation(event.target.checked ? KNT_MEETING_ROOM : ''); markChanged() }} /> {KNT_MEETING_ROOM}</span></span><input required value={location} onChange={event => { setLocation(event.target.value); markChanged() }} /></label>
        <label>Online Link <span className="subtle">(optional)</span><input type="url" value={onlineLink} onChange={event => { setOnlineLink(event.target.value); markChanged() }} placeholder="https://..." /></label>
      </> : <label>Location<input required value={location} onChange={event => { setLocation(event.target.value); markChanged() }} /></label>}
    </> : status !== 'working' && <label>{status === 'leave' ? 'Location' : 'Note'}<textarea required={status === 'leave'} value={note} onChange={event => { setNote(event.target.value); markChanged() }} placeholder={notePlaceholders[status]} rows="3" /></label>}
    {error && <p className="form-error">{error}</p>}
    {confirmOvertime && <div className="overtime-confirm-backdrop"><section className="overtime-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="overtime-confirm-title"><p className="eyebrow">OVERTIME CONFIRMATION</p><h2 id="overtime-confirm-title">Please confirm your overtime working on selected weekend?</h2><div className="overtime-confirm-actions"><button type="button" className="secondary-button" onClick={() => { setConfirmOvertime(false); setOvertimeDates([]) }}>No</button><button type="button" className="primary-button" onClick={() => { setConfirmOvertime(false); setOvertimeApproved(true); window.setTimeout(() => formRef.current?.requestSubmit(), 0) }}>Yes</button></div></section></div>}
    <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : saved ? 'Saved' : 'Save status'}</button>
  </form>
}
