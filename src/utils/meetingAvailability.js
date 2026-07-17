import { supabase } from '../lib/supabaseClient'

export const unavailableStatusLabel = { business_trip: 'Business trip', leave: 'Annual leave', sick: 'Sick leave' }

export async function getUnavailableMeetingParticipants(dates) {
  if (!dates.length) return new Map()
  const { data, error } = await supabase.from('daily_status').select('employee_id,status').in('date', dates).in('status', Object.keys(unavailableStatusLabel))
  if (error) return new Map()
  return new Map((data || []).map(record => [record.employee_id, unavailableStatusLabel[record.status]]))
}
