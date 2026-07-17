import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { today } from '../utils/status'

const nextDate = (date, amount) => {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

const fallbackCalendarDay = date => ({
  date,
  day_type: new Date(`${date}T12:00:00`).getDay() % 6 === 0 ? 'weekend' : 'working_day',
  holiday_name: null,
})

export function useDashboard(selectedDate = today(), userId) {
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [calendarDay, setCalendarDay] = useState(() => fallbackCalendarDay(selectedDate))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const date = selectedDate

  const load = useCallback(async () => {
    if (!supabase || !userId) {
      setEmployees([]); setDepartments([]); setCalendarDay(fallbackCalendarDay(date)); setError(''); setLoading(false)
      return
    }
    setLoading(true); setError('')
    const [profileRes, statusRes, deptRes, calendarRes, meetingRes] = await Promise.all([
      supabase.from('profiles').select('*, departments(id,name,sort_order)').eq('active', true).order('full_name'),
      supabase.from('daily_status').select('*'),
      supabase.from('departments').select('*').order('sort_order'),
      supabase.from('work_calendar').select('date,day_type,holiday_name').eq('date', date).maybeSingle(),
      supabase.from('employee_meetings').select('organizer_id,is_overtime').eq('date', date).eq('is_overtime', true),
    ])
    if (profileRes.error || statusRes.error || deptRes.error || calendarRes.error || meetingRes.error) {
      setError(profileRes.error?.message || statusRes.error?.message || deptRes.error?.message || calendarRes.error?.message || meetingRes.error?.message)
    }
    setCalendarDay(calendarRes.data || fallbackCalendarDay(date))
    const statusesByEmployee = new Map()
    ;(statusRes.data || []).forEach(record => {
      if (!statusesByEmployee.has(record.employee_id)) statusesByEmployee.set(record.employee_id, new Map())
      statusesByEmployee.get(record.employee_id).set(record.date, record)
    })
    const getPeriod = (employeeId, daily) => {
      if (!daily) return null
      const dates = statusesByEmployee.get(employeeId) || new Map()
      let start = daily.date; let end = daily.date
      while (dates.get(nextDate(start, -1))?.status === daily.status) start = nextDate(start, -1)
      while (dates.get(nextDate(end, 1))?.status === daily.status) end = nextDate(end, 1)
      return { start, end }
    }
    const overtimeOrganizerIds = new Set((meetingRes.data || []).map(meeting => meeting.organizer_id))
    const people = (profileRes.data || []).map(person => {
      const daily = statusesByEmployee.get(person.id)?.get(date)
      return { ...person, daily, dailyPeriod: getPeriod(person.id, daily), displayStatus: daily?.status || 'working', isOvertime: Boolean(daily?.is_overtime || overtimeOrganizerIds.has(person.id)) }
    })
    const departmentById = new Map((deptRes.data || []).map(department => [department.id, department]))
    people.forEach(person => {
      const department = Array.isArray(person.departments) ? person.departments[0] : person.departments
      if (department?.id && !departmentById.has(department.id)) departmentById.set(department.id, department)
      if (person.department_id && !departmentById.has(person.department_id)) departmentById.set(person.department_id, { id: person.department_id, name: 'Unconfigured department', sort_order: Number.MAX_SAFE_INTEGER })
    })
    setEmployees(people)
    setDepartments([...departmentById.values()].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))
    setLoading(false)
  }, [date, userId])

  useEffect(() => { load() }, [load])
  return { employees, departments, calendarDay, isWorkingDay: calendarDay.day_type === 'working_day', loading, error, date, reload: load }
}
