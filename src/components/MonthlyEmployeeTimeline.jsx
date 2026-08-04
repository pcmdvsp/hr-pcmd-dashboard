import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { STATUS, today } from '../utils/status'
import { departmentAccent } from '../utils/departmentAccent'
import './MonthlyEmployeeTimeline.css'

const nextMonth = month => { const value = new Date(`${month}-01T12:00:00`); value.setMonth(value.getMonth() + 1); return value.toISOString().slice(0, 10) }
const datesInMonth = month => { const end = nextMonth(month); const days = []; for (let date = `${month}-01`; date < end; date = new Date(`${date}T12:00:00`).toISOString().slice(0, 10)) { days.push(date); const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + 1); date = value.toISOString().slice(0, 10); if (date >= end) break } return days }
const fallbackDayType = date => new Date(`${date}T12:00:00`).getDay() % 6 === 0 ? 'weekend' : 'working_day'
const shortWeekday = date => new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))
const monthTitle = month => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`))

export default function MonthlyEmployeeTimeline({ month, employees, departments, query, departmentFilter }) {
  const [statuses, setStatuses] = useState([])
  const [calendar, setCalendar] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
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
  }, [month])

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
      // Keep ordinary working days as individual blank cells. Explicit statuses
      // use their status alone so consecutive dates become one continuous bar.
      const key = cell.status && cell.status !== 'working' ? cell.status : `${cell.status || 'off'}:${cell.dayType}:${cell.status === 'working' || cell.dayType === 'holiday' ? cell.date : ''}`
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
      <tbody>{groups.map(group => <TimelineGroup key={group.id} group={group} days={days} segmentsFor={segmentsFor} collapsed={collapsedGroups.has(group.id)} onToggle={toggleGroup}/>)}</tbody>
    </table></div>
    {!groups.length && <p className="empty">No matching employees found.</p>}
    <footer>{Object.entries(STATUS).filter(([key]) => key !== 'meeting').map(([key, item]) => <span key={key}><i className={key === 'working' ? 'timeline-working' : ''} style={key === 'working' ? undefined : { background: item.color }}/>{item.label} <b>{summaryCounts[key] || 0}</b></span>)}<span><i className="timeline-off"/>Weekend / holiday</span></footer>
  </section>
}

const timelineTooltip = segment => segment.status === 'business_trip'
  ? ['Business trip', segment.content || 'Content not specified', segment.location || 'Location not specified'].join('\n')
  : segment.status === 'leave'
    ? ['Annual leave', `Location: ${segment.location || segment.note || 'Not specified'}`].join('\n')
  : segment.status ? STATUS[segment.status]?.label : segment.dayType === 'holiday' ? (segment.holidayName || 'Holiday') : segment.dayType === 'weekend' ? 'Weekend' : segment.dayType === 'special_leave' ? (segment.holidayName || 'Special leave') : 'Non-working day'

function FragmentGroup({ group, days, segmentsFor, collapsed, onToggle }) {
  return <><tr className="timeline-group"><th colSpan={days.length + 1}><button type="button" onClick={() => onToggle(group.id)} aria-expanded={!collapsed}><i>{collapsed ? '›' : '⌄'}</i>{group.name} <span>{group.employees.length}</span></button></th></tr>{!collapsed && group.employees.map(employee => <tr key={employee.id}><th className="timeline-employee"><b>{employee.full_name}</b><small>{employee.employee_code}</small></th>{segmentsFor(employee).map((segment, index) => <td key={index} colSpan={segment.length} title={timelineTooltip(segment)} className={`timeline-cell ${segment.status ? `is-${segment.status}` : 'is-off'} ${segment.isHoliday ? 'is-calendar-holiday' : ''} ${segment.isToday ? 'is-today' : ''} ${segment.length === 1 ? 'is-single' : ''} ${segment.dayType}`}><span /></td>)}</tr>)}</>
}

function TimelineGroup({ group, days, segmentsFor, collapsed, onToggle }) {
  const todayIndex = days.indexOf(today())
  return <>
    <tr className="timeline-group"><th colSpan={days.length + 1} style={{ '--department-accent': departmentAccent(group.name, group.sortOrder) }}><button type="button" onClick={() => onToggle(group.id)} aria-expanded={!collapsed}><i>{collapsed ? '>' : 'v'}</i>{group.name} <span>{group.employees.length}</span></button></th></tr>
    {!collapsed && group.employees.map(employee => <tr key={employee.id}>
      <th className="timeline-employee"><b>{employee.full_name}</b></th>
      {segmentsFor(employee).map((segment, index) => {
        const containsToday = todayIndex >= segment.start && todayIndex < segment.start + segment.length
        const todayPosition = containsToday ? `${((todayIndex - segment.start + 0.5) / segment.length) * 100}%` : undefined
        return <td key={index} colSpan={segment.length} title={timelineTooltip(segment)} style={todayPosition ? { '--today-position': todayPosition } : undefined} className={`timeline-cell ${segment.status ? `is-${segment.status}` : 'is-off'} ${segment.isHoliday ? 'is-calendar-holiday' : ''} ${containsToday ? 'is-today' : ''} ${segment.length === 1 ? 'is-single' : ''} ${segment.dayType}`}><span /></td>
      })}
    </tr>)}
  </>
}
