import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { STATUS, today } from '../utils/status'
import { downloadOutlookCalendar } from '../utils/outlookCalendar'
import './MyScheduleOverview.css'
import './MeetingDayPopup.css'

const startOfCurrentWeek = () => { const date = new Date(`${today()}T12:00:00`); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date }
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const formatMeetingDate = value => { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}` }
const formatMeetingTime = value => { const [hourText, minute = '00'] = String(value || '00:00').split(':'); const hour = Number(hourText); return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}` }
const nonWorkingInfo = day => ({ weekend: { label: 'Weekend', color: '#9aa6b2' }, holiday: { label: day.holiday_name || 'Holiday', color: '#b0bac6' }, special_leave: { label: day.holiday_name || 'Special leave', color: '#b0bac6' } }[day.day_type])

export default function MyScheduleOverview({ employeeId }) {
  const [records, setRecords] = useState([])
  const [meetings, setMeetings] = useState([])
  const [calendar, setCalendar] = useState([])
  const [views, setViews] = useState([])
  const [selectedMeetings, setSelectedMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const days = useMemo(() => {
    const start = startOfCurrentWeek()
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(start); date.setDate(start.getDate() + index)
      return { key: dateKey(date), weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date), day: date.getDate(), month: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date) }
    })
  }, [])

  useEffect(() => {
    const start = days[0].key
    const end = new Date(`${days.at(-1).key}T12:00:00`); end.setDate(end.getDate() + 1)
    const endKey = dateKey(end)
    Promise.all([
      supabase.from('daily_status').select('date,status,is_overtime,content,location').eq('employee_id', employeeId).gte('date', start).lt('date', endKey),
      supabase.from('employee_meetings').select('id,organizer_id,date,start_time,end_time,content,location,is_overtime,updated_at').gte('date', start).lt('date', endKey).order('start_time'),
      supabase.from('employee_meeting_attendees').select('meeting_id').eq('employee_id', employeeId),
      supabase.from('work_calendar').select('date,day_type,holiday_name').gte('date', start).lt('date', endKey),
      supabase.from('profiles').select('id,full_name,email').eq('active', true),
      supabase.from('employee_meeting_views').select('meeting_id,seen_at,seen_meeting_updated_at').eq('employee_id', employeeId),
    ]).then(([statusResult, meetingResult, attendeeResult, calendarResult, profileResult, viewResult]) => {
      const attendedIds = new Set((attendeeResult.data || []).map(item => item.meeting_id))
      const organizerById = new Map((profileResult.data || []).map(person => [person.id, person.full_name || person.email]))
      setRecords(statusResult.data || [])
      setMeetings((meetingResult.data || []).filter(meeting => meeting.organizer_id === employeeId || attendedIds.has(meeting.id)).map(meeting => ({ ...meeting, organizerName: organizerById.get(meeting.organizer_id) || 'The meeting organizer' })))
      setCalendar(calendarResult.data || [])
      setViews(viewResult.data || [])
      setLoading(false)
    })
  }, [employeeId, days])

  const statusByDate = useMemo(() => new Map(records.map(record => [record.date, record])), [records])
  const meetingsByDate = useMemo(() => meetings.reduce((map, meeting) => { map.set(meeting.date, [...(map.get(meeting.date) || []), meeting]); return map }, new Map()), [meetings])
  const calendarByDate = useMemo(() => new Map(calendar.map(day => [day.date, day])), [calendar])
  const viewByMeeting = useMemo(() => new Map(views.map(view => [view.meeting_id, view])), [views])
  const meetingBadge = dayMeetings => {
    const states = dayMeetings.map(meeting => { const view = viewByMeeting.get(meeting.id); return !view ? 'New' : new Date(meeting.updated_at) > new Date(view.seen_meeting_updated_at) ? 'Updated' : null })
    return states.includes('New') ? 'New' : states.includes('Updated') ? 'Updated' : null
  }
  const openMeetingDay = async dayMeetings => {
    if (!dayMeetings.length) return
    setSelectedMeetings(dayMeetings)
    const seenAt = new Date().toISOString()
    const payload = dayMeetings.map(meeting => ({ meeting_id: meeting.id, employee_id: employeeId, seen_at: seenAt, seen_meeting_updated_at: meeting.updated_at }))
    const result = await supabase.from('employee_meeting_views').upsert(payload, { onConflict: 'meeting_id,employee_id' })
    if (!result.error) setViews(current => [...current.filter(view => !payload.some(item => item.meeting_id === view.meeting_id)), ...payload])
  }

  return <>
    <section className="my-schedule">
      <div className="my-schedule-heading"><div><p className="eyebrow">MY SCHEDULE</p><h2>This week & next week</h2></div><span>{loading ? 'Loading...' : '14 days'}</span></div>
      <div className="my-schedule-grid">{days.map(day => {
        const record = statusByDate.get(day.key)
        const dayMeetings = meetingsByDate.get(day.key) || []
        const fallbackType = new Date(`${day.key}T12:00:00`).getDay() % 6 === 0 ? 'weekend' : 'working_day'
        const calendarDay = calendarByDate.get(day.key) || { day_type: fallbackType }
        const isWorkingDay = calendarDay.day_type === 'working_day'
        const effectiveStatus = dayMeetings.length ? 'meeting' : record?.status || 'working'
        const isWeekendBusinessTrip = !isWorkingDay && record?.status === 'business_trip'
        const isWeekendOvertime = !isWorkingDay && (record?.is_overtime || dayMeetings.some(meeting => meeting.is_overtime))
        const baseNonWorkingInfo = nonWorkingInfo(calendarDay)
        const info = isWorkingDay ? STATUS[effectiveStatus] : isWeekendOvertime ? { label: `${baseNonWorkingInfo.label} · Overtime`, color: STATUS.working.color } : isWeekendBusinessTrip ? { label: `${baseNonWorkingInfo.label} · Business trip`, color: STATUS.business_trip.color } : baseNonWorkingInfo
        const isToday = day.key === today()
        const badge = meetingBadge(dayMeetings)
        const meetingDetails = dayMeetings.map(meeting => `Time: ${meeting.start_time?.slice(0, 5) || '-'} - ${meeting.end_time?.slice(0, 5) || '-'}\nContent: ${meeting.content || '-'}\nLocation: ${meeting.location || '-'}`).join('\n\n')
        const details = !isWorkingDay ? isWeekendOvertime ? `${baseNonWorkingInfo.label}\nOvertime${dayMeetings.length ? `\n\n${meetingDetails}` : ''}` : isWeekendBusinessTrip ? `${baseNonWorkingInfo.label}\nBusiness trip\nContent: ${record.content || '-'}\nLocation: ${record.location || '-'}` : calendarDay.holiday_name || info.label : dayMeetings.length ? meetingDetails : record?.status === 'business_trip' ? `Content: ${record.content || '-'}\nLocation: ${record.location || '-'}` : info.label
        return <article key={day.key} role={dayMeetings.length ? 'button' : undefined} tabIndex={dayMeetings.length ? 0 : undefined} onClick={() => openMeetingDay(dayMeetings)} onKeyDown={event => { if (dayMeetings.length && (event.key === 'Enter' || event.key === ' ')) openMeetingDay(dayMeetings) }} className={`schedule-day ${isToday ? 'is-today' : ''} ${isWorkingDay ? '' : 'is-non-working'}`} style={{ '--schedule-color': info.color, cursor: dayMeetings.length ? 'pointer' : 'default' }}><small>{day.weekday}</small><strong>{day.day}</strong><em>{day.month}</em><span>{isToday ? `Today · ${info.label}` : info.label}</span>{badge && <b style={{ fontSize: 9, color: badge === 'New' ? '#168452' : '#b26b00' }}>{badge}</b>}<div className="schedule-tooltip">{dayMeetings.length ? `${details}\n\nClick to add to Outlook Calendar.` : details}</div></article>
      })}</div>
      <div className="my-schedule-legend">{Object.entries(STATUS).map(([key, item]) => <span key={key}><i style={{ background: item.color }} />{item.label}</span>)}<span><i style={{ background: '#9aa6b2' }} />Weekend / holiday</span></div>
    </section>
    {selectedMeetings.length > 0 && <div className="modal-backdrop"><div className="modal"><div className="form-title"><div><h2>Meetings</h2></div><button type="button" className="close" onClick={() => setSelectedMeetings([])} aria-label="Close">×</button></div>{selectedMeetings.map(meeting => <section key={meeting.id}><p className="meeting-invitation">{meeting.organizerName} invited you to the meeting!</p><hr className="meeting-divider"/><p className="meeting-detail"><b>Content:</b> {meeting.content}</p><p className="meeting-detail"><b>Time:</b> {formatMeetingTime(meeting.start_time)} - {formatMeetingTime(meeting.end_time)}, {formatMeetingDate(meeting.date)}</p><p className="meeting-detail"><b>Location:</b> {meeting.location}</p><button type="button" className="secondary-button" onClick={() => downloadOutlookCalendar(meeting, meeting.organizerName)}>Add to Outlook Calendar</button></section>)}</div></div>}
  </>
}
