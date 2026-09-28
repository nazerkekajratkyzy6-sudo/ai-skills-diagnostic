import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pick, useI18n } from '../i18n'
import { AdminHead, useAdmin } from './AdminLayout'
import FiltersBar from './Filters'
import { Bars, Columns, GroupSplit } from './Charts'
import { Loading } from '../components'
import { supabase } from '../lib/supabase'
import { useCampaigns, useSchools } from '../lib/data'
import { cleanFilters } from '../lib/util'
import type { Filters } from '../lib/types'

interface Overview {
  schools: number; participants: number; completed: number; avg_percent: number | null; avg_tools: number | null
  groups: Record<'1' | '2' | '3', number>
  skills: { key: string; title_kk: string; title_ru: string; avg: number; n: number; n0: number; n1: number; n2: number }[]
  tools: { tool: string; n: number }[]
  platforms: { name: string; know: number; master: number }[]; platforms_responded: number
  product_choices: { key: string; n: number; title_kk: string; title_ru: string }[]
  vibe_scores: Record<'0' | '1' | '2', number>; vibe_self: Record<string, number> | null
  by_day: { day: string; n: number; avg: number }[]
  by_campaign: { id: string; name_kk: string; name_ru: string; n: number; avg: number; g1: number; g2: number; g3: number }[]
}
interface SchoolRow {
  id: string; name: string; region: string | null; city: string | null; is_demo: boolean; participants: number; completed: number
  g1: number; g2: number; g3: number; avg_percent: number | null; skills: Record<string, number> | null; top_tools: string[]
}

export default function Dashboard() {
  const { t, lang } = useI18n()
  const { isSuper } = useAdmin()
  const { schools } = useSchools()
  const { campaigns } = useCampaigns()
  const [f, setF] = useState<Filters>({})
  const [ov, setOv] = useState<Overview | null>(null)
  const [rows, setRows] = useState<SchoolRow[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const p = cleanFilters(f)
    Promise.all([supabase.rpc('stats_overview', { f: p }), supabase.rpc('school_stats', { f: p })]).then(([a, b]) => {
      if (!alive) return
      if (a.error || b.error) { setErr((a.error || b.error)!.message); return }
      setErr(null); setOv(a.data as Overview); setRows((b.data as SchoolRow[]) || [])
    })
    return () => { alive = false }
  }, [f])

  const skillKeys = ov?.skills.map(s => s.key) || []

  return (
    <>
      <AdminHead title={t('nav_dashboard')} />
      <div className="admin-body">
        <FiltersBar value={f} onChange={setF} schools={schools} campaigns={campaigns} isSuper={isSuper} />
        {err && <div className="alert error">{err}</div>}
        {!ov ? <Loading /> : (
          <div className="stack">
            <div className="grid grid-4">
              {isSuper && <div className="stat"><div className="v">{ov.schools}</div><div className="l">{t('st_schools')}</div></div>}
              <div className="stat"><div className="v">{ov.participants}</div><div className="l">{t('st_participants')}</div></div>
              <div className="stat"><div className="v">{ov.completed}</div><div className="l">{t('st_completed')}</div></div>
              <div className="stat"><div className="v">{ov.avg_percent ?? '—'}{ov.avg_percent != null ? '%' : ''}</div><div className="l">{t('st_avg')}</div></div>
              <div className="stat"><div className="v">{ov.avg_tools ?? '—'}</div><div className="l">{t('st_avg_tools')}</div></div>
            </div>

            {ov.completed === 0 ? <div className="card"><p className="muted">{t('st_no_data')}</p></div> : (<>
              <div className="card">
                <h3>{t('st_groups')}</h3>
                <GroupSplit g1={ov.groups['1']} g2={ov.groups['2']} g3={ov.groups['3']} />
                <p className="small" style={{ marginTop: 10 }}><Link to="/admin/results">{t('rs_group_lists')} →</Link></p>
              </div>
              <div className="grid grid-2">
                <div className="card">
                  <h3>{t('st_skills')}</h3>
                  <Bars max={2} fmt={v => v.toFixed(2)} rows={ov.skills.map(s => ({
                    label: pick(s as unknown as Record<string, unknown>, 'title', lang), value: Number(s.avg),
                    title: `${pick(s as unknown as Record<string, unknown>, 'title', lang)}: ${s.avg} · 0: ${s.n0} · 1: ${s.n1} · 2: ${s.n2}`,
                  }))} />
                </div>
                <div className="card">
                  <h3>{t('st_tools')}</h3>
                  {ov.tools.length ? <Bars rows={ov.tools.slice(0, 10).map(x => ({ label: x.tool, value: x.n }))} /> : <p className="muted">—</p>}
                  <p className="hint">{t('st_tools_note')}</p>
                </div>
              </div>
              {ov.platforms_responded > 0 && (
                <div className="card">
                  <div className="row between"><h3 style={{ margin: 0 }}>{t('st_platforms')}</h3>
                    <span className="small muted">{t('st_pl_of', { n: ov.platforms_responded })}</span></div>
                  <p className="hint">{t('st_platforms_hint')}</p>
                  <div className="legend" style={{ marginBottom: 10 }}>
                    <span><i style={{ background: 'var(--primary)' }} />{t('st_pl_master')}</span>
                    <span><i style={{ background: '#bfd0f7' }} />{t('st_pl_know')}</span>
                  </div>
                  <div className="bars">
                    {ov.platforms.map(p => (
                      <div className="pl-row" key={p.name} title={`${p.name}: ${t('st_pl_master')} ${p.master}, ${t('st_pl_know')} ${p.know} / ${ov.platforms_responded}`}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <div className="track">
                          <div className="know" style={{ width: `${(p.know / ov.platforms_responded) * 100}%` }} />
                          <div className="master" style={{ width: `${(p.master / ov.platforms_responded) * 100}%` }} />
                        </div>
                        <span className="val">{p.master} / {p.know}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ov.product_choices.length > 0 && (
                <div className="card">
                  <h3>{t('st_choices')}</h3>
                  <Bars rows={ov.product_choices.map(c => ({ label: pick(c, 'title', lang), value: c.n }))} />
                </div>
              )}
              <div className="grid grid-2">
                <div className="card">
                  <h3>{t('st_vibe')}</h3>
                  <div className="label small">{t('st_vibe_practical')}</div>
                  <Bars rows={(['0', '1', '2'] as const).map(k => ({ label: `${k}`, value: ov.vibe_scores[k] || 0 }))} />
                  <div className="label small" style={{ marginTop: 12 }}>{t('st_vibe_self')}</div>
                  <Bars rows={['1', '2', '3', '4', '5'].map(k => ({ label: k, value: ov.vibe_self?.[k] || 0 }))} />
                </div>
                <div className="card">
                  <h3>{t('st_dynamics')}</h3>
                  <Columns rows={ov.by_day.map(d => ({ label: d.day.slice(5).split('-').reverse().join('.'), value: d.n, title: `${d.day}: ${d.n} · ${d.avg}%` }))} />
                  {ov.by_campaign.length > 0 && <>
                    <div className="label small" style={{ marginTop: 14 }}>{t('st_by_campaign')}</div>
                    <Bars max={100} fmt={v => `${v}%`} rows={ov.by_campaign.map(c => ({
                      label: pick(c as unknown as Record<string, unknown>, 'name', lang), value: Number(c.avg),
                      title: `${pick(c as unknown as Record<string, unknown>, 'name', lang)}: ${c.n} · ${c.avg}% · G1 ${c.g1} / G2 ${c.g2} / G3 ${c.g3}`,
                    }))} />
                  </>}
                </div>
              </div>
            </>)}

            <div className="card">
              <h3>{t('st_by_school')}</h3>
              <div className="table-wrap">
                <table className="schools-table">
                  <thead><tr>
                    <th>{t('sc_name')}</th><th className="num">{t('sc_participants')}</th><th className="num">{t('st_completed')}</th>
                    <th className="num">{t('group_short_1')}</th><th className="num">{t('group_short_2')}</th><th className="num">{t('group_short_3')}</th>
                    <th className="num">%</th>
                    {ov.skills.map(s => <th key={s.key} className="num">{pick(s as unknown as Record<string, unknown>, 'title', lang).split(' ')[0]}</th>)}
                    <th>{t('rs_tools')}</th>
                  </tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td><Link to={`/admin/schools/${r.id}`}>{r.name}</Link> {r.is_demo && <span className="badge demo">{t('demo_badge')}</span>}
                          <div className="small muted">{[r.region, r.city].filter(Boolean).join(', ')}</div></td>
                        <td className="num">{r.participants}</td><td className="num">{r.completed}</td>
                        <td className="num">{r.g1}</td><td className="num">{r.g2}</td><td className="num">{r.g3}</td>
                        <td className="num">{r.avg_percent ?? '—'}</td>
                        {skillKeys.map(k => <td key={k} className="num">{r.skills?.[k] ?? '—'}</td>)}
                        <td className="small">{r.top_tools.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
