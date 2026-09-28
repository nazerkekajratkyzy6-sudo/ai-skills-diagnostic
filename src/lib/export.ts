import { supabase } from './supabase'
import { fetchAll } from './data'
import type { Filters, Submission, Task } from './types'
import type { Lang } from '../i18n'
import { fmtDate } from './util'

export const SUBMISSION_SELECT =
  'id,participant_id,school_id,campaign_id,full_name,position,language,started_at,finished_at,duration_seconds,total_score,max_score,percent,group_no,tools_used,tools_count,vibe_self,result_token,reviewed,is_demo,schools!inner(name,region),campaigns(name_kk,name_ru)'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilters(q: any, f: Filters, search?: string) {
  if (f.school_id) q = q.eq('school_id', f.school_id)
  if (f.region) q = q.eq('schools.region', f.region)
  if (f.campaign_id) q = q.eq('campaign_id', f.campaign_id)
  if (f.group_no) q = q.eq('group_no', Number(f.group_no))
  if (f.language) q = q.eq('language', f.language)
  if (f.date_from) q = q.gte('finished_at', f.date_from)
  if (f.date_to) { const d = new Date(f.date_to); d.setDate(d.getDate() + 1); q = q.lt('finished_at', d.toISOString().slice(0, 10)) }
  if (!f.include_demo) q = q.eq('is_demo', false)
  if (search?.trim()) q = q.ilike('full_name', `%${search.trim().replace(/[%_,()]/g, ' ')}%`)
  return q
}

export interface ExportLabels {
  name: string; school: string; region: string; position: string; campaign: string; date: string; language: string
  time: string; group: string; percent: string; vibe_self: string; tools: string; tools_count: string; links: string; groupName: (g: number) => string
  chosen: string; pl_master: string; pl_know: string; pl_other: string; files: string
  langName: (l: string) => string
}

export async function buildExportRows(f: Filters, lang: Lang, L: ExportLabels) {
  const subs = await fetchAll<Submission>((from, to) =>
    applyFilters(supabase.from('submissions').select(SUBMISSION_SELECT + ',chosen_task,platforms,platforms_other,answers(task_key,score,link,result_text,tools,other_tool,files)'), f)
      .order('group_no').order('full_name').range(from, to))
  const campaignIds = Array.from(new Set(subs.map(s => s.campaign_id)))
  const tasks: Task[] = campaignIds.length
    ? ((await supabase.from('tasks').select('*').in('campaign_id', campaignIds).order('position')).data as Task[]) || []
    : []
  // Дағдылар бағандары: кілт бойынша біріктіріледі
  const keys: { key: string; title: string }[] = []
  for (const tk of tasks) if (!keys.find(k => k.key === tk.key)) keys.push({ key: tk.key, title: lang === 'kk' ? tk.title_kk : tk.title_ru })

  const header = [L.name, L.school, L.region, L.position, L.campaign, L.date, L.language, L.time, L.group, L.percent,
    L.chosen, ...keys.map(k => k.title), L.vibe_self, L.tools, L.tools_count, L.pl_master, L.pl_know, L.pl_other,
    ...keys.map(k => `${L.links}: ${k.title}`)]
  const rows: (string | number | null)[][] = subs.map(s => {
    const byKey = Object.fromEntries((s.answers || []).map(a => [a.task_key, a]))
    return [
      s.full_name, s.schools?.name || '', s.schools?.region || '', s.position || '',
      (lang === 'kk' ? s.campaigns?.name_kk : s.campaigns?.name_ru) || '', fmtDate(s.finished_at, true), L.langName(s.language),
      s.duration_seconds != null ? Math.round(s.duration_seconds / 6) / 10 : null, L.groupName(s.group_no), Number(s.percent),
      s.chosen_task ? (keys.find(k => k.key === s.chosen_task)?.title || s.chosen_task) : '',
      ...keys.map(k => (byKey[k.key] ? byKey[k.key].score : null)),
      s.vibe_self, (s.tools_used || []).join(', '), s.tools_count,
      Object.entries(s.platforms || {}).filter(([, v]) => v === 2).map(([k]) => k).join(', '),
      Object.entries(s.platforms || {}).filter(([, v]) => v === 1).map(([k]) => k).join(', '),
      s.platforms_other || '',
      ...keys.map(k => {
        const a = byKey[k.key]; if (!a) return ''
        const parts = [a.link || '', a.result_text ? a.result_text.slice(0, 500) : '', ...(a.files || []).map(f => `${L.files}: ${f.name}`)]
        return parts.filter(Boolean).join(' | ')
      }),
    ]
  })
  return { header, rows }
}

export function downloadCsv(fileName: string, header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    if (v == null) return ''
    const s = String(v)
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // UTF-8 BOM + ";" — Excel кириллицаны дұрыс ашады
  const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export async function downloadXlsx(fileName: string, header: string[], rows: (string | number | null)[][], sheet: string) {
  const { default: writeXlsxFile } = await import('write-excel-file')
  const data = [
    header.map(h => ({ value: h, fontWeight: 'bold' as const, backgroundColor: '#E8EEFB', wrap: true })),
    ...rows.map(r => r.map(v => (v == null || v === '' ? null : typeof v === 'number' ? { type: Number, value: v } : { type: String, value: String(v) }))),
  ]
  const columns = header.map((_, i) => ({ width: i === 0 ? 32 : i === 1 ? 28 : i < 10 ? 14 : 18 }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await writeXlsxFile(data as any, { fileName, columns, sheet: sheet.slice(0, 31) })
}
