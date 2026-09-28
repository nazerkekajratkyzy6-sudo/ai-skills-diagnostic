import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '')
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export const configured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'aisd-auth' },
})

/** Логинді ішкі email-ге айналдыру: "school12" → "school12@users.aisd.local" */
export function loginToEmail(login: string): string {
  const v = login.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@users.aisd.local`
}
export function emailToLogin(email: string | null | undefined): string {
  if (!email) return ''
  return email.endsWith('@users.aisd.local') ? email.replace('@users.aisd.local', '') : email
}

/** Сервер функциясын (Vercel /api/admin) шақыру */
export async function adminApi<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  })
  let body: { error?: string } & Record<string, unknown> = {}
  try { body = await res.json() } catch { /* ignore */ }
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body as T
}

/** Postgres қатесінен қысқа кодты алу (мысалы "already_submitted") */
export function errCode(e: unknown): string {
  const msg = (e as { message?: string })?.message || String(e)
  const m = msg.match(/(school_not_found|personal_code_not_found|school_inactive|diagnostic_closed|no_campaign|already_submitted|invalid_name|invalid_choice|demo_exists|forbidden)/)
  if (m) return m[1]
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) return 'network'
  return 'generic'
}
