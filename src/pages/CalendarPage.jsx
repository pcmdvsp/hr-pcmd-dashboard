import { useEffect, useMemo, useState } from 'react'
import { Cake, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { buildMonthGrid, currentMonth, groupBirthdays, monthBounds, moveMonth } from '../utils/birthdayCalendar'
import { today } from '../utils/status'
import './CalendarPage.css'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const monthHeading = month => {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

export default function CalendarPage({ goBack }) {
  const [month, setMonth] = useState(currentMonth())
  const [calendarRows, setCalendarRows] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openBirthday, setOpenBirthday] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true); setError(''); setOpenBirthday('')
      const bounds = monthBounds(month)
      const [calendarResult, profileResult] = await Promise.all([
        supabase.from('work_calendar').select('date,day_type,holiday_name').gte('date', bounds.start).lt('date', bounds.end).order('date'),
        supabase.from('profiles').select('id,full_name,birth_date').eq('active', true).not('birth_date', 'is', null).order('full_name'),
      ])
      if (!active) return
      if (calendarResult.error || profileResult.error) setError(calendarResult.error?.message || profileResult.error?.message)
      setCalendarRows(calendarResult.data || [])
      setProfiles(profileResult.data || [])
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [month])

  const days = useMemo(() => buildMonthGrid(month, calendarRows), [month, calendarRows])
  const birthdays = useMemo(() => groupBirthdays(profiles), [profiles])
  const currentDate = today()

  return <main className="app-shell employee-calendar-page">
    <header className="topbar">
      <div><p className="eyebrow">PEOPLE & WORK CALENDAR</p><h1>Calendar</h1><p className="subtle">Working days, holidays and employee birthdays.</p></div>
      <button className="secondary-button" onClick={goBack}>← Back to dashboard</button>
    </header>
    <section className="employee-calendar-card">
      <div className="employee-calendar-toolbar">
        <button type="button" className="calendar-month-button" onClick={() => setMonth(value => moveMonth(value, -1))}><ChevronLeft size={18}/> Previous month</button>
        <div className="calendar-month-title"><CalendarDays size={21}/><h2>{monthHeading(month)}</h2></div>
        <button type="button" className="calendar-month-button" onClick={() => setMonth(value => moveMonth(value, 1))}>Next month <ChevronRight size={18}/></button>
      </div>
      <div className="employee-calendar-legend"><span><i className="working-day"/>Working day</span><span><i className="weekend"/>Weekend</span><span><i className="holiday"/>Holiday</span><span><Cake size={16}/>Birthday</span></div>
      {error && <p className="notice error">{error}</p>}
      {loading ? <p className="loading">Loading calendar...</p> : <div className="employee-calendar-grid">
        {WEEKDAYS.map(day => <div className="employee-calendar-weekday" key={day}>{day}</div>)}
        {days.map((day, index) => {
          if (!day) return <div className="employee-calendar-blank" key={`blank-${index}`} aria-hidden="true"/>
          const dayBirthdays = birthdays.get(day.date.slice(5)) || []
          const isOpen = openBirthday === day.date
          const holidayLines = day.holiday_name?.split(/\r?\n/).map(line => line.trim()).filter(Boolean) || []
          return <article className={`employee-calendar-day ${day.day_type.replace('_', '-')} ${day.date === currentDate ? 'is-today' : ''}`} key={day.date}>
            <div className="employee-calendar-day-heading"><strong>{Number(day.date.slice(-2))}</strong></div>
            {holidayLines.length > 0 && <div className={`employee-calendar-note ${holidayLines.length > 1 ? 'is-multiline' : ''}`}>{holidayLines.map((line, lineIndex) => <span key={`${day.date}-note-${lineIndex}`}>{line}</span>)}</div>}
            {dayBirthdays.length > 0 && <div className={`birthday-marker ${isOpen ? 'is-open' : ''}`}>
              <button type="button" aria-label={`Show birthdays on ${day.date}`} aria-expanded={isOpen} onClick={() => setOpenBirthday(current => current === day.date ? '' : day.date)}><Cake size={19}/><span>{dayBirthdays.length}</span></button>
              <div className="birthday-popover" role="tooltip"><b>{dayBirthdays.length === 1 ? 'Birthday' : 'Birthdays'}</b>{dayBirthdays.map(person => <span key={person.id}>{person.full_name}</span>)}</div>
            </div>}
          </article>
        })}
      </div>}
    </section>
  </main>
}
