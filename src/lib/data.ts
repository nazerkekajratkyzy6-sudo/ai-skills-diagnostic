import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Campaign, School } from './types'

export function useSchools(includeDemo = true) {
  const [schools, setSchools] = useState<School[]>([])
  const load = useCallback(async () => {
    let q = supabase.from('schools').select('*').order('name')
    if (!includeDemo) q = q.eq('is_demo', false)
    const { data } = await q
    setSchools((data as School[]) || [])
  }, [includeDemo])
  useEffect(() => { load() }, [load])
  return { schools, reload: load }
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false })
    setCampaigns((data as Campaign[]) || [])
  }, [])
  useEffect(() => { load() }, [load])
  return { campaigns, reload: load }
}

/** PostgREST бір сұрауда ең көбі 1000 жол қайтарады — сондықтан беттеп жүктейміз */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 1000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return out
}
