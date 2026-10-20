import { useEffect, useMemo, useState } from 'react'
import { pick, useI18n, type TKey } from '../i18n'
import { AdminHead, useAdmin } from './AdminLayout'
import { GroupSplit } from './Charts'
import { Loading, GroupBadge, toast } from '../components'
import { supabase } from '../lib/supabase'
import { useSchools } from '../lib/data'
import { copyText, fmtDate } from '../lib/util'
import { cabinetLink } from '../lib/course'
import { downloadXlsx } from '../lib/export'

interface CourseOverview {
  participants: number; diagnosed: number; started: number; with_accepted: number; rework_total: number; mentors: number
  by_group: Record<'1' | '2' | '3', number>
  modules: { key: string; group_no: number; title_kk: string; title_ru: string; eligible: number; accepted: number; rework: number }[]
  teachers: {
    id: string; full_name: string; position: string | null; personal_code: string; school: string; group_no: number | null
    accepted: number; rework: number; modules: number; last_work: string | null
  }[]
}
interface Skill { key: string; title_kk: string; title_ru: string; avg: number; n: number }

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export default function CourseAdmin() {
  const { t, lang } = useI18n()
  const { isSuper, profile } = useAdmin()
  const { schools } = useSchools(false)
  const [school, setSchool] = useState('')
  const [ov, setOv] = useState<CourseOverview | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const sid = isSuper ? (school || null) : profile.school_id
    setOv(null)
    Promise.all([
      supabase.rpc('course_overview', { p_school: sid }),
      supabase.rpc('stats_overview', { f: sid ? { school_id: sid } : {} }),
    ]).then(([a, b]) => {
      if (!alive) return
      if (a.error) { setErr(a.error.message); return }
      setErr(null); setOv(a.data as CourseOverview)
      setSkills(((b.data as { skills?: Skill[] } | null)?.skills || []).filter(s => s.n > 0))
    })
    return () => { alive = false }
  }, [school, isSuper, profile.school_id])

  // «Не істеу керек» — деректерден автоматты ұсыныстар / автоматические рекомендации
  const recos = useMemo(() => {
    if (!ov) return []
    const out: string[] = []
    const noDiag = ov.participants - ov.diagnosed
    if (noDiag > 0) out.push(t('ca_r_nodiag', { n: noDiag }))
    const weak = [...skills].sort((a, b) => Number(a.avg) - Number(b.avg))[0]
    if (weak) out.push(t('ca_r_weak', { skill: pick(weak, 'title', lang), avg: Number(weak.avg).toFixed(1) }))
    for (const g of [1, 2, 3] as const) {
      const n = ov.by_group[String(g) as '1']
      const first = ov.modules.find(m => m.group_no === g)
      const waiting = ov.teachers.filter(x => x.group_no === g && x.accepted === 0).length
      if (n > 0 && first && waiting > 0) out.push(t('ca_r_group', { g: t(`group_short_${g}` as TKey), n: waiting, module: pick(first, 'title', lang) }))
    }
    if (ov.rework_total > 0) out.push(t('ca_r_rework', { n: ov.rework_total }))
    if (ov.mentors > 0) out.push(t('ca_r_mentors', { n: ov.mentors }))
    return out
  }, [ov, skills, t, lang])

  const exportXlsx = async () => {
    if (!ov) return
    await downloadXlsx('course-progress.xlsx',
      [t('ca_col_name'), t('ca_col_school'), t('f_position'), t('ca_col_group'), t('ca_col_accepted'), t('ca_col_rework'),
       t('ca_col_progress'), t('ca_col_last'), t('ca_col_cabinet')],
      ov.teachers.map(x => [x.full_name, x.school, x.position, x.group_no, x.accepted, x.rework,
        x.modules ? `${x.accepted}/${x.modules}` : '', x.last_work ? fmtDate(x.last_work) : '', cabinetLink(x.personal_code)]),
      t('nav_course'))
  }

  return (
    <>
      <AdminHead title={t('nav_course')}>
        {ov && <button className="btn sm" onClick={exportXlsx}>{t('rs_export_xlsx')}</button>}
      </AdminHead>
      <div className="admin-body stack">
        {isSuper && (
          <div className="filters">
            <label className="field"><span>{t('f_school')}</span>
              <select value={school} onChange={e => setSchool(e.target.value)}>
                <option value="">{t('cp_all_schools')}</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></label>
          </div>
        )}
        {err && <div className="alert error">{err}</div>}
        {!ov ? (!err && <Loading />) : (
          <>
            <div className="grid grid-4">
              <div className="stat"><div className="v">{pct(ov.diagnosed, ov.participants)}%</div>
                <div className="l">{t('ca_coverage')} · {ov.diagnosed}/{ov.participants}</div></div>
              <div className="stat"><div className="v">{pct(ov.started, ov.diagnosed)}%</div>
                <div className="l">{t('ca_started')} · {ov.started}/{ov.diagnosed}</div></div>
              <div className="stat"><div className="v">{pct(ov.with_accepted, ov.diagnosed)}%</div>
                <div className="l">{t('ca_accepted')} · {ov.with_accepted}/{ov.diagnosed}</div></div>
              <div className="stat"><div className="v">{ov.mentors}</div><div className="l">{t('ca_mentors')}</div></div>
            </div>

            <div className="card stack">
              <h3 style={{ margin: 0 }}>{t('ca_reco')}</h3>
              {recos.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('ca_r_none')}</p> : (
                <ul className="reco-list">{recos.map((r, i) => <li key={i}>{r}</li>)}</ul>
              )}
            </div>

            <div className="card">
              <h3>{t('st_groups')}</h3>
              <GroupSplit g1={ov.by_group['1']} g2={ov.by_group['2']} g3={ov.by_group['3']} />
            </div>

            <div className="card stack">
              <h3 style={{ margin: 0 }}>{t('ca_modules')}</h3>
              <div className="table-wrap"><table>
                <thead><tr><th>{t('ca_col_module')}</th><th>{t('ca_col_group')}</th><th className="num">{t('ca_col_eligible')}</th>
                  <th className="num">{t('ca_col_accepted')}</th><th className="num">{t('ca_col_rework')}</th><th className="num">{t('ca_col_not')}</th><th /></tr></thead>
                <tbody>
                  {ov.modules.map(m => {
                    const notStarted = Math.max(0, m.eligible - m.accepted - m.rework)
                    return (
                      <tr key={m.key}>
                        <td>{pick(m, 'title', lang)}</td><td><GroupBadge g={m.group_no} /></td>
                        <td className="num">{m.eligible}</td><td className="num">{m.accepted}</td>
                        <td className="num">{m.rework}</td><td className="num">{notStarted}</td>
                        <td style={{ minWidth: 120 }}><div className="progress"><div style={{ width: `${pct(m.accepted, m.eligible)}%` }} /></div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            </div>

            <div className="card stack">
              <h3 style={{ margin: 0 }}>{t('ca_teachers')}</h3>
              <div className="table-wrap"><table>
                <thead><tr><th>{t('ca_col_name')}</th>{isSuper && <th>{t('ca_col_school')}</th>}<th>{t('ca_col_group')}</th>
                  <th>{t('ca_col_progress')}</th><th>{t('ca_col_last')}</th><th>{t('ca_col_cabinet')}</th></tr></thead>
                <tbody>
                  {ov.teachers.map(x => (
                    <tr key={x.id}>
                      <td>{x.full_name}{x.position && <div className="muted small">{x.position}</div>}</td>
                      {isSuper && <td>{x.school}</td>}
                      <td>{x.group_no ? <GroupBadge g={x.group_no} /> : <span className="muted small">{t('ca_no_group')}</span>}</td>
                      <td>{x.modules ? `${x.accepted} / ${x.modules}` : '—'}{x.rework > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>{t('st_needs_rework')}: {x.rework}</span>}</td>
                      <td className="nowrap">{x.last_work ? fmtDate(x.last_work) : '—'}</td>
                      <td><button className="btn sm" onClick={async () => { if (await copyText(cabinetLink(x.personal_code))) toast(t('copied')) }}>{t('copy')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
