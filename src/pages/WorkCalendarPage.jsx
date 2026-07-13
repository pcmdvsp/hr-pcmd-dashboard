import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const currentMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)

export default function WorkCalendarPage({ goBack }) {
  const [month, setMonth] = useState(currentMonth()); const [days, setDays] = useState([]); const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  const load = async () => { const start = `${month}-01`; const end = new Date(`${start}T12:00:00`); end.setMonth(end.getMonth() + 1); const { data, error: resultError } = await supabase.from('work_calendar').select('*').gte('date', start).lt('date', end.toISOString().slice(0, 10)).order('date'); if (resultError) setError(resultError.message); setDays(data || []) }
  useEffect(() => { load() }, [month])
  const save = async day => { setSaving(true); const { error: resultError } = await supabase.from('work_calendar').upsert(day); setSaving(false); if (resultError) return setError(resultError.message); load() }
  return <main className="app-shell calendar-page"><header className="topbar"><div><p className="eyebrow">ADMIN ONLY</p><h1>Work calendar</h1></div><button className="secondary-button" onClick={goBack}>← Back to dashboard</button></header><section className="calendar-admin"><label>Month<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}<table className="monthly-table"><thead><tr><th>Date</th><th>Day type</th><th>Holiday name / note</th><th /></tr></thead><tbody>{days.map(day => <CalendarRow key={day.date} day={day} disabled={saving} onSave={save} />)}</tbody></table></section></main>
}

function CalendarRow({ day, disabled, onSave }) {
  const [type, setType] = useState(day.day_type); const [name, setName] = useState(day.holiday_name || '')
  return <tr><td>{day.date}</td><td><select value={type} onChange={event => setType(event.target.value)}><option value="working_day">Working day</option><option value="weekend">Weekend</option><option value="holiday">Holiday</option><option value="special_leave">Special leave</option></select></td><td><input value={name} onChange={event => setName(event.target.value)} placeholder="Example: National Day" /></td><td><button disabled={disabled} onClick={() => onSave({ ...day, day_type: type, holiday_name: name.trim() || null })}>Save</button></td></tr>
}
