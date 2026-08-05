import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { STATUS, today } from '../utils/status'
import { departmentAccent } from '../utils/departmentAccent'
import { showSuccessAlert } from './SuccessAlert'
import './MonthlyEmployeeTimeline.css'

const nextMonth = month => { const value = new Date(`${month}-01T12:00:00`); value.setMonth(value.getMonth() + 1); return value.toISOString().slice(0, 10) }
const datesInMonth = month => { const end = nextMonth(month); const days = []; for (let date = `${month}-01`; date < end; date = new Date(`${date}T12:00:00`).toISOString().slice(0, 10)) { days.push(date); const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + 1); date = value.toISOString().slice(0, 10); if (date >= end) break } return days }
const fallbackDayType = date => new Date(`${date}T12:00:00`).getDay() % 6 === 0 ? 'weekend' : 'working_day'
const shortWeekday = date => new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))
const monthTitle = month => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`))
const addDays = (date, count) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + count); return value.toISOString().slice(0, 10) }
const laterDate = (first, second) => first > second ? first : second
const editableStatuses = new Set(['business_trip', 'leave', 'sick'])

export default function MonthlyEmployeeTimeline({ month, employees, departments, query, departmentFilter, profile }) {
  const [statuses, setStatuses] = useState([])
  const [calendar, setCalendar] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const [reloadKey, setReloadKey] = useState(0)
  const [statusAction, setStatusAction] = useState(null)
  const [editing, setEditing] = useState(null)
  const days = useMemo(() => datesInMonth(month), [month])

  useEffect(() => {
    let active = true
    const load = () => {
      setLoading(true); setError('')
      Promise.all([
        supabase.from('daily_status').select('employee_id,date,status,is_overtime,content,location,note').gte('date', `${month}-01`).lt('date', nextMonth(month)),
        supabase.from('work_calendar').select('date,day_type,holiday_name').gte('date', `${month}-01`).lt('date', nextMonth(month)),
      ]).then(([statusResult, calendarResult]) => {
        if (!active) return
        if (statusResult.error || calendarResult.error) setError(statusResult.error?.message || calendarResult.error?.message)
        setStatuses(statusResult.data || []); setCalendar(calendarResult.data || []); setLoading(false)
      })
    }
    load()
    const fallback = window.setInterval(load, 30 * 60 * 1000)
    return () => { active = false; window.clearInterval(fallback) }
  }, [month, reloadKey])

  const calendarByDate = useMemo(() => new Map(calendar.map(day => [day.date, day])), [calendar])
  const statusesByEmployee = useMemo(() => {
    const map = new Map()
    statuses.forEach(status => { if (!map.has(status.employee_id)) map.set(status.employee_id, new Map()); map.get(status.employee_id).set(status.date, status) })
    return map
  }, [statuses])
  const shownEmployees = useMemo(() => employees.filter(employee => (departmentFilter === 'all' || (departmentFilter === 'management' ? !employee.department_id : employee.department_id === departmentFilter)) && `${employee.full_name} ${employee.employee_code}`.toLowerCase().includes(query.toLowerCase())), [employees, departmentFilter, query])
  const groups = useMemo(() => {
    const list = departments.map(department => ({ id: department.id, name: department.name, sortOrder: department.sort_order ?? 0, employees: shownEmployees.filter(employee => employee.department_id === department.id) })).filter(group => group.employees.length)
    const management = shownEmployees.filter(employee => !employee.department_id)
    if (management.length) list.unshift({ id: 'management', name: 'Management Board', sortOrder: -1, employees: management })
    return list
  }, [departments, shownEmployees])
  const segmentsFor = employee => {
    const personStatuses = statusesByEmployee.get(employee.id) || new Map()
    const cells = days.map(date => {
      const record = personStatuses.get(date)
      const calendarDay = calendarByDate.get(date) || { day_type: fallbackDayType(date) }
      const status = record?.status === 'meeting' ? 'working' : record?.status || (calendarDay.day_type === 'working_day' ? 'working' : null)
      return { status, dayType: calendarDay.day_type, holidayName: calendarDay.holiday_name, isHoliday: calendarDay.day_type === 'holiday' || Boolean(calendarDay.holiday_name), date, isToday: date === today(), content: record?.content, location: record?.location, note: record?.note }
    })
    return cells.reduce((segments, cell, dayIndex) => {
      // Keep ordinary working days as individual blank cells. Explicit status
      // bars only merge when their displayed details also match. In particular,
      // two adjacent Business trips with different content/location must remain
      // separate so each bar has the correct tooltip.
      const explicitKey = cell.status === 'business_trip'
        ? `${cell.status}:${cell.content || ''}:${cell.location || ''}`
        : cell.status
      const key = cell.status && cell.status !== 'working'
        ? explicitKey
        : `${cell.status || 'off'}:${cell.dayType}:${cell.status === 'working' || cell.dayType === 'holiday' ? cell.date : ''}`
      const previous = segments.at(-1)
      if (previous?.key === key) previous.length += 1
      else segments.push({ ...cell, key, length: 1, start: dayIndex })
      return segments
    }, [])
  }
  const summaryCounts = groups.reduce((counts, group) => {
    group.employees.forEach(employee => segmentsFor(employee).forEach(segment => { counts[segment.status || 'off'] = (counts[segment.status || 'off'] || 0) + segment.length }))
    return counts
  }, {})
  const toggleGroup = groupId => setCollapsedGroups(current => { const next = new Set(current); next.has(groupId) ? next.delete(groupId) : next.add(groupId); return next })

  if (loading) return <p className="loading">Loading monthly timeline...</p>
  if (error) return <p className="notice error">{error}</p>
  return <section className="monthly-timeline-panel">
    <header><div><p className="eyebrow">MONTHLY EMPLOYEE OVERVIEW</p><h2>{monthTitle(month)}</h2></div><p>{shownEmployees.length} employees · {days.length} days</p></header>
    <div className="monthly-timeline-wrap"><table className="monthly-timeline-table">
      <thead><tr><th className="timeline-employee-header">Employee</th>{days.map(date => { const calendarDay = calendarByDate.get(date) || { day_type: fallbackDayType(date) }; return <th className={`${date === today() ? 'is-today' : ''} ${calendarDay.day_type === 'weekend' ? 'is-weekend' : ''} ${calendarDay.day_type === 'holiday' || calendarDay.holiday_name ? 'is-holiday' : ''}`} key={date}><small>{shortWeekday(date)}</small><b>{date.slice(-2)}</b></th> })}</tr></thead>
      <tbody>{groups.map(group => <TimelineGroup key={group.id} group={group} days={days} segmentsFor={segmentsFor} collapsed={collapsedGroups.has(group.id)} onToggle={toggleGroup} profile={profile} onEdit={setStatusAction}/>)}</tbody>
    </table></div>
    {!groups.length && <p className="empty">No matching employees found.</p>}
    <footer>{Object.entries(STATUS).filter(([key]) => key !== 'meeting').map(([key, item]) => <span key={key}><i className={key === 'working' ? 'timeline-working' : ''} style={key === 'working' ? undefined : { background: item.color }}/>{item.label} <b>{summaryCounts[key] || 0}</b></span>)}<span><i className="timeline-off"/>Weekend / holiday</span></footer>
    {statusAction && <TimelineStatusActionDialog editing={statusAction} onClose={() => setStatusAction(null)} onEdit={() => { setEditing(statusAction); setStatusAction(null) }} onCancelled={() => { setStatusAction(null); setReloadKey(key => key + 1) }} />}
    {editing && <TimelineStatusEditDialog editing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReloadKey(key => key + 1) }} />}
  </section>
}

const timelineTooltip = segment => segment.status === 'business_trip'
  ? ['Business trip', segment.content || 'Content not specified', segment.location || 'Location not specified'].join('\n')
  : segment.status === 'leave'
    ? ['Annual leave', `Location: ${segment.location || segment.note || 'Not specified'}`].join('\n')
  : segment.status ? STATUS[segment.status]?.label : segment.dayType === 'holiday' ? (segment.holidayName || 'Holiday') : segment.dayType === 'weekend' ? 'Weekend' : segment.dayType === 'special_leave' ? (segment.holidayName || 'Special leave') : 'Non-working day'

function TimelineStatusActionDialog({ editing, onClose, onEdit, onCancelled }) {
  const { employee, segment, originalEndDate, applyFrom } = editing
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const statusLabel = STATUS[segment.status]?.label || segment.status
  const formatDate = date => new Intl.DateTimeFormat('en-GB').format(new Date(`${date}T12:00:00`))

  const cancelRemainingStatus = async () => {
    if (saving) return
    setSaving(true); setError('')
    const { error: rpcError } = await supabase.rpc('edit_timeline_status', {
      p_employee_id: employee.id,
      p_status: segment.status,
      p_original_start_date: segment.date,
      p_original_end_date: originalEndDate,
      p_apply_from_date: applyFrom,
      p_to_date: originalEndDate,
      p_content: null,
      p_location: null,
      p_note: null,
      p_revert_future: true,
    })
    setSaving(false)
    if (rpcError) return setError(rpcError.message)
    showSuccessAlert('Remaining status days have been cancelled and reverted to calendar default.')
    onCancelled()
  }

  return <div className="timeline-edit-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="timeline-edit-dialog timeline-status-actions" role="dialog" aria-modal="true" aria-labelledby="timeline-action-title">
      <button type="button" className="timeline-edit-close" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">STATUS ACTIONS</p>
      <h3 id="timeline-action-title">{statusLabel}</h3>
      <p className="timeline-edit-person">{employee.full_name}</p>
      {!confirmCancel ? <div className="timeline-action-options"><button type="button" className="primary-button" onClick={onEdit}>Edit</button><button type="button" className="secondary-button timeline-cancel-status-button" onClick={() => setConfirmCancel(true)}>Remove event</button></div> : <div className="timeline-edit-confirm"><p>Remove this remaining event?</p><span>Days from <b>{formatDate(applyFrom)}</b> to <b>{formatDate(originalEndDate)}</b> will return to calendar default. Earlier days will remain unchanged.</span>{error && <p className="notice error">{error}</p>}<button type="button" className="secondary-button" disabled={saving} onClick={() => setConfirmCancel(false)}>Keep event</button><button type="button" className="danger-button" disabled={saving} onClick={cancelRemainingStatus}>{saving ? 'Removing...' : 'Yes, remove event'}</button></div>}
    </section>
  </div>
}

function TimelineStatusEditDialog({ editing, onClose, onSaved }) {
  const { employee, segment, originalEndDate, applyFrom } = editing
  const [fromDate, setFromDate] = useState(applyFrom)
  const [toDate, setToDate] = useState(originalEndDate)
  const [content, setContent] = useState(segment.content || '')
  const [location, setLocation] = useState(segment.location || segment.note || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const statusLabel = STATUS[segment.status]?.label || segment.status
  const detailsLabel = segment.status === 'sick' ? 'Type of sickness' : 'Location'
  const firstAllowedDate = today()

  const updateFromDate = value => {
    // The HTML min attribute prevents picker selection before today. Clamp the
    // value too, because a typed date can bypass that browser UI restriction.
    const nextDate = value && value < firstAllowedDate ? firstAllowedDate : (value || fromDate)
    setFromDate(nextDate)
    if (toDate < nextDate) setToDate(nextDate)
  }

  const save = async () => {
    if (saving) return
    if (toDate < fromDate) return setError('To date must be on or after From date.')
    if (segment.status === 'business_trip' && (!content.trim() || !location.trim())) return setError('Content and location are required.')
    if (segment.status !== 'business_trip' && !location.trim()) return setError(`${detailsLabel} is required.`)
    setSaving(true); setError('')
    const { error: rpcError } = await supabase.rpc('edit_timeline_status', {
      p_employee_id: employee.id,
      p_status: segment.status,
      p_original_start_date: segment.date,
      p_original_end_date: originalEndDate,
      p_apply_from_date: fromDate,
      p_to_date: toDate,
      p_content: segment.status === 'business_trip' ? content.trim() : null,
      p_location: segment.status === 'business_trip' ? location.trim() : null,
      p_note: segment.status === 'business_trip' ? null : location.trim(),
      p_revert_future: false,
    })
    setSaving(false)
    if (rpcError) return setError(rpcError.message)
    showSuccessAlert('Your status has been updated successfully.')
    onSaved()
  }

  return <div className="timeline-edit-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="timeline-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="timeline-edit-title">
      <button type="button" className="timeline-edit-close" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">EDIT STATUS</p>
      <h3 id="timeline-edit-title">{statusLabel}</h3>
      <p className="timeline-edit-person">{employee.full_name}</p>
      <p className="timeline-edit-scope">Changes apply from Today onward. You cannot edit historical days here.</p>
      <div className="timeline-edit-date-fields"><label>From date<input type="date" min={firstAllowedDate} value={fromDate} onChange={event => updateFromDate(event.target.value)} disabled={saving} /></label><label>To date<input type="date" min={fromDate} value={toDate} onChange={event => setToDate(event.target.value)} disabled={saving} /></label></div>
      {segment.status === 'business_trip' && <label>Content<textarea required rows="3" value={content} onChange={event => setContent(event.target.value)} disabled={saving} /></label>}
      <label>{detailsLabel}<input required value={location} onChange={event => setLocation(event.target.value)} disabled={saving} /></label>
      {error && <p className="notice error">{error}</p>}
      <div className="timeline-edit-actions"><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Back</button><button type="button" className="primary-button" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button></div>
    </section>
  </div>
}

function FragmentGroup({ group, days, segmentsFor, collapsed, onToggle }) {
  return <><tr className="timeline-group"><th colSpan={days.length + 1}><button type="button" onClick={() => onToggle(group.id)} aria-expanded={!collapsed}><i>{collapsed ? '›' : '⌄'}</i>{group.name} <span>{group.employees.length}</span></button></th></tr>{!collapsed && group.employees.map(employee => <tr key={employee.id}><th className="timeline-employee"><b>{employee.full_name}</b><small>{employee.employee_code}</small></th>{segmentsFor(employee).map((segment, index) => <td key={index} colSpan={segment.length} title={timelineTooltip(segment)} className={`timeline-cell ${segment.status ? `is-${segment.status}` : 'is-off'} ${segment.isHoliday ? 'is-calendar-holiday' : ''} ${segment.isToday ? 'is-today' : ''} ${segment.length === 1 ? 'is-single' : ''} ${segment.dayType}`}><span /></td>)}</tr>)}</>
}

function TimelineGroup({ group, days, segmentsFor, collapsed, onToggle, profile, onEdit }) {
  const todayIndex = days.indexOf(today())
  const canEditEmployee = employee => profile?.role === 'admin' || employee.id === profile?.id
  return <>
    <tr className="timeline-group"><th colSpan={days.length + 1} style={{ '--department-accent': departmentAccent(group.name, group.sortOrder) }}><button type="button" onClick={() => onToggle(group.id)} aria-expanded={!collapsed}><i>{collapsed ? '>' : 'v'}</i>{group.name} <span>{group.employees.length}</span></button></th></tr>
    {!collapsed && group.employees.map(employee => <tr key={employee.id}>
      <th className="timeline-employee"><b>{employee.full_name}</b></th>
      {segmentsFor(employee).map((segment, index) => {
        const containsToday = todayIndex >= segment.start && todayIndex < segment.start + segment.length
        const todayPosition = containsToday ? `${((todayIndex - segment.start + 0.5) / segment.length) * 100}%` : undefined
        // Timeline edits always start today (or the start of a future status).
        // Historical corrections remain available through the dedicated Admin page.
        const editableFrom = laterDate(segment.date, today())
        const canEdit = editableStatuses.has(segment.status) && canEditEmployee(employee) && editableFrom <= addDays(segment.date, segment.length - 1)
        return <td key={index} colSpan={segment.length} title={canEdit ? `${timelineTooltip(segment)}\n\nClick to edit future days` : timelineTooltip(segment)} style={todayPosition ? { '--today-position': todayPosition } : undefined} className={`timeline-cell ${segment.status ? `is-${segment.status}` : 'is-off'} ${segment.isHoliday ? 'is-calendar-holiday' : ''} ${containsToday ? 'is-today' : ''} ${segment.length === 1 ? 'is-single' : ''} ${segment.dayType} ${canEdit ? 'is-editable-status' : ''}`} onClick={canEdit ? () => onEdit({ employee, segment, originalEndDate: addDays(segment.date, segment.length - 1), applyFrom: editableFrom }) : undefined}><span /></td>
      })}
    </tr>)}
  </>
}
