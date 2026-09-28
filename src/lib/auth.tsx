import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

type Ctx = { session: Session | null; profile: Profile | null; loading: boolean; reload: () => Promise<void>; signOut: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null as unknown as Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(s: Session | null) {
    if (!s) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile((data as Profile) ?? null)
  }

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      await loadProfile(data.session)
      if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Supabase ұсынысы: callback ішінде басқа сұрауды кейінге қалдыру
        setTimeout(() => { loadProfile(s) }, 0)
      }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const reload = async () => { const { data } = await supabase.auth.getSession(); setSession(data.session); await loadProfile(data.session) }
  const signOut = async () => { await supabase.auth.signOut(); setProfile(null); setSession(null) }

  return <AuthCtx.Provider value={{ session, profile, loading, reload, signOut }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
export const useIsSuper = () => useAuth().profile?.role === 'super_admin'
