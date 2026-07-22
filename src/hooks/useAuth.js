import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useAuth() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(undefined)

  useEffect(() => {
    if (!supabase) { setSession(null); setProfile(null); return undefined }
    const load = async (currentSession) => {
      setSession(currentSession)
      if (!currentSession) return setProfile(null)
      setProfile(undefined)
      const { data } = await supabase.from('profiles').select('*, departments(id,name,sort_order)').eq('id', currentSession.user.id).single()
      setProfile(data ?? null)
    }
    supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => load(next))
    // Mobile browsers commonly pause timers while the app is in the background.
    // Refresh the persisted session when the page becomes active again instead
    // of relying only on the background auto-refresh timer.
    const restoreWhenActive = async () => {
      if (document.visibilityState === 'hidden') return
      const { data: { session: storedSession } } = await supabase.auth.getSession()
      if (!storedSession) return
      const { data, error } = await supabase.auth.refreshSession()
      if (!error && data.session) load(data.session)
    }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') restoreWhenActive() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', restoreWhenActive)
    return () => {
      listener.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', restoreWhenActive)
    }
  }, [])

  return { session, profile, refreshProfile: async () => {
    if (!session) return
    const { data } = await supabase.from('profiles').select('*, departments(id,name,sort_order)').eq('id', session.user.id).single()
    setProfile(data ?? null)
  } }
}
