export const siteUrl = () => window.location.origin

export const diagLink = (schoolCode: string, campaignCode?: string) =>
  `${siteUrl()}/d/${schoolCode}${campaignCode ? `?c=${campaignCode}` : ''}`
export const personalLink = (personalCode: string) => `${siteUrl()}/p/${personalCode}`

export function fmtDate(v: string | null | undefined, withTime = false): string {
  if (!v) return '—'
  const d = new Date(v)
  const p = (n: number) => String(n).padStart(2, '0')
  const s = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
  return withTime ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s
}

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60), s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function cleanFilters<T extends object>(f: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(f)) if (v !== '' && v != null && v !== false) out[k] = v
  return out as Partial<T>
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove(); return ok
  }
}

export const isUrl = (v: string) => /^https?:\/\/[^\s/$.?#]+\.[^\s]+$/i.test(v.trim())

export function randomPassword(len = 10): string {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const arr = new Uint32Array(len); crypto.getRandomValues(arr)
  return Array.from(arr, n => a[n % a.length]).join('')
}
