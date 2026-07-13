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
      const { data } = await supabase.from('profiles').select('*, departments(id,name,sort_order)').eq('id', currentSession.user.id).single()
      setProfile(data ?? null)
    }
    supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => load(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  return { session, profile, refreshProfile: async () => {
    if (!session) return
    const { data } = await supabase.from('profiles').select('*, departments(id,name,sort_order)').eq('id', session.user.id).single()
    setProfile(data ?? null)
  } }
}
