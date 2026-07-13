import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useMonthlyStats(month) {
  const [rows, setRows] = useState([]); const [calendar, setCalendar] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true); setError('')
    const start = `${month}-01`; const end = new Date(`${start}T12:00:00`); end.setMonth(end.getMonth() + 1)
    const endString = end.toISOString().slice(0, 10)
    const [stats, calendarResult] = await Promise.all([
      supabase.rpc('organization_monthly_statistics', { p_month: start }),
      supabase.from('work_calendar').select('*').gte('date', start).lt('date', endString).order('date'),
    ])
    if (stats.error || calendarResult.error) setError(stats.error?.message || calendarResult.error?.message)
    setRows(stats.data || []); setCalendar(calendarResult.data || []); setLoading(false)
  }, [month])
  useEffect(() => { load() }, [load])
  return { rows, calendar, loading, error, reload: load }
}
