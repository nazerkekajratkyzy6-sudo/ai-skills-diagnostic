import { useState } from 'react'
import { Link } from 'react-router-dom'
import { pick, useI18n } from '../i18n'
import { AdminHead, useAdmin } from './AdminLayout'
import { GroupBadge, ScoreBox, toast } from '../components'
import { supabase } from '../lib/supabase'
import { useCampaigns, useSchools } from '../lib/data'

interface Side { n: number; avg: number | null; g1: number; g2: number; g3: number }
interface Cmp {
  a: Side; b: Side
  skills: { key: string; title_kk: string; title_ru: string; a: number | null; b: number | null; delta: number | null }[]
  participants: { participant_id: string; full_name: string; a_percent: number; b_percent: number; a_group: number; b_group: number; skills: Record<string, { a: number | null; b: number | null }> }[]
}

const delta = (v: number | null | undefined, digits = 2) =>
  v == null ? '—' : <b style={{ color: v > 0 ? 'var(--ok)' : v < 0 ? 'var(--danger)' : 'var(--muted)' }}>{v > 0 ? '▲ +' : v < 0 ? '▼ ' : ''}{Number(v).toFixed(digits)}</b>

export default function Compare() {
  const { t, lang } = useI18n()
  const { isSuper, profile } = useAdmin()
  const { campaigns } = useCampaigns()
  const { schools } = useSchools()
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [school, setSchool] = useState('')
  const [r, setR] = useState<Cmp | null>(null)

  const run = async () => {
    const { data, error } = await supabase.rpc('compare_campaigns', { p_a: a, p_b: b, p_school: isSuper ? (school || null) : profile.school_id })
    if (error) toast(error.message); else setR(data as Cmp)
  }
  const cname = (id: string) => { const c = campaigns.find(x => x.id === id); return c ? pick(c as unknown as Record<string, unknown>, 'name', lang) : '' }

  return (
    <>
      <AdminHead title={t('cmp_title')} />
      <div className="admin-body stack">
        <div className="card">
          <p className="muted small">{t('cmp_hint')}</p>
          <div className="filters">
            <label className="field"><span>{t('cmp_a')}</span><select value={a} onChange={e => setA(e.target.value)}>
              <option value="">—</option>{campaigns.map(c => <option key={c.id} value={c.id}>{pick(c as unknown as Record<string, unknown>, 'name', lang)}</option>)}</select></label>
            <label className="field"><span>{t('cmp_b')}</span><select value={b} onChange={e => setB(e.target.value)}>
              <option value="">—</option>{campaigns.map(c => <option key={c.id} value={c.id}>{pick(c as unknown as Record<string, unknown>, 'name', lang)}</option>)}</select></label>
            {isSuper && <label className="field"><span>{t('flt_school')}</span><select value={school} onChange={e => setSchool(e.target.value)}>
              <option value="">{t('all')}</option>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
            <button className="btn primary" disabled={!a || !b || a === b} onClick={run}>{t('cmp_run')}</button>
          </div>
        </div>
        {r && (<>
          <div className="table-wrap"><table>
            <thead><tr><th /><th className="num">{cname(a)}</th><th className="num">{cname(b)}</th><th className="num">{t('cmp_change')}</th></tr></thead>
            <tbody>
              <tr><td>{t('st_completed')}</td><td className="num">{r.a.n}</td><td className="num">{r.b.n}</td><td /></tr>
              <tr><td>{t('st_avg')} (%)</td><td className="num">{r.a.avg ?? '—'}</td><td className="num">{r.b.avg ?? '—'}</td>
                <td className="num">{r.a.avg != null && r.b.avg != null ? delta(r.b.avg - r.a.avg, 1) : '—'}</td></tr>
              {([1, 2, 3] as const).map(g => (
                <tr key={g}><td>{t(`group_${g}` as 'group_1')}</td><td className="num">{r.a[`g${g}`]}</td><td className="num">{r.b[`g${g}`]}</td>
                  <td className="num">{delta(r.b[`g${g}`] - r.a[`g${g}`], 0)}</td></tr>
              ))}
              {r.skills.map(s => (
                <tr key={s.key}><td>{pick(s as unknown as Record<string, unknown>, 'title', lang)} <span className="muted small">(0–2)</span></td>
                  <td className="num">{s.a ?? '—'}</td><td className="num">{s.b ?? '—'}</td><td className="num">{delta(s.delta)}</td></tr>
              ))}
            </tbody>
          </table></div>
          <div className="card">
            <h3>{t('cmp_participants_both')} ({r.participants.length})</h3>
            {r.participants.length === 0 ? <p className="muted">—</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>{t('rs_name')}</th>{r.skills.map(s => <th key={s.key} className="num">{pick(s as unknown as Record<string, unknown>, 'title', lang).split(' ')[0]}</th>)}
                  <th className="num">%</th><th>{t('rs_group')}</th></tr></thead>
                <tbody>{r.participants.map(p => (
                  <tr key={p.participant_id}>
                    <td><Link to={`/admin/participants/${p.participant_id}`}>{p.full_name}</Link></td>
                    {r.skills.map(s => <td key={s.key} className="num nowrap"><ScoreBox s={p.skills?.[s.key]?.a} /> → <ScoreBox s={p.skills?.[s.key]?.b} /></td>)}
                    <td className="num nowrap">{p.a_percent} → {p.b_percent}</td>
                    <td className="nowrap"><GroupBadge g={p.a_group} /> → <GroupBadge g={p.b_group} /></td>
                  </tr>))}
                </tbody></table></div>
            )}
          </div>
        </>)}
      </div>
    </>
  )
}
