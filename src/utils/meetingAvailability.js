import { supabase } from '../lib/supabaseClient'

export const unavailableStatusLabel = { business_trip: 'Business trip', leave: 'Annual leave', sick: 'Sick leave' }

export async function getUnavailableMeetingParticipantsByDate(dates) {
  if (!dates.length) return new Map()
  const { data, error } = await supabase.from('daily_status').select('employee_id,date,status').in('date', dates).in('status', Object.keys(unavailableStatusLabel))
  if (error) return new Map()
  return (data || []).reduce((byDate, record) => {
    if (!byDate.has(record.date)) byDate.set(record.date, new Map())
    byDate.get(record.date).set(record.employee_id, unavailableStatusLabel[record.status])
    return byDate
  }, new Map())
}

export async function getUnavailableMeetingParticipants(dates) {
  const byDate = await getUnavailableMeetingParticipantsByDate(dates)
  return new Map([...byDate.values()].flatMap(unavailable => [...unavailable.entries()]))
}
