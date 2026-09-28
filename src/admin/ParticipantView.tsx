import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pick, useI18n } from '../i18n'
import { AdminHead, useAdmin } from './AdminLayout'
import { CopyBox, GroupBadge, Loading, ScoreBox, toast } from '../components'
import { supabase } from '../lib/supabase'
import { useSchools } from '../lib/data'
import { fmtDate, fmtDuration, personalLink } from '../lib/util'
import type { Participant, Submission, Task } from '../lib/types'

export default function ParticipantView() {
  const { t, lang } = useI18n()
  const { id } = useParams()
  const { isSuper } = useAdmin()
  const { schools } = useSchools()
  const [p, setP] = useState<(Participant & { schools: { name: string } }) | null | undefined>(undefined)
  const [subs, setSubs] = useState<Submission[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [moveTo, setMoveTo] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('participants').select('*, schools(name)').eq('id', id).maybeSingle()
    setP(data as never)
    const { data: ss } = await supabase.from('submissions').select('*, campaigns(name_kk,name_ru), answers(task_key,score)').eq('participant_id', id).order('finished_at')
    const list = (ss as Submission[]) || []
    setSubs(list)
    if (list.length) {
      const { data: tt } = await supabase.from('tasks').select('*').in('campaign_id', list.map(x => x.campaign_id)).order('position')
      setTasks((tt as Task[]) || [])
    }
  }, [id])
  useEffect(() => { load() }, [load])

  if (p === undefined) return <><AdminHead title="…" /><div className="admin-body"><Loading /></div></>
  if (!p) return <><AdminHead title={t('rs_profile')} /><div className="admin-body"><p className="muted">{t('rs_none')}</p></div></>

  const keys: Task[] = []
  for (const tk of tasks) if (!keys.find(k => k.key === tk.key)) keys.push(tk)

  const move = async () => {
    if (!moveTo) return
    const { error } = await supabase.rpc('move_participant', { p_participant: p.id, p_school: moveTo })
    if (error) toast(error.message); else { toast(t('pt_move_done')); load() }
  }

  return (
    <>
      <AdminHead title={p.full_name}>{p.is_demo && <span className="badge demo">{t('demo_badge')}</span>}</AdminHead>
      <div className="admin-body stack">
        <div className="card stack">
          <div className="small"><span className="muted">{t('rs_school')}:</span> <Link to={`/admin/schools/${p.school_id}`}>{p.schools?.name}</Link> · <span className="muted">{t('pt_position')}:</span> {p.position || '—'}</div>
          <CopyBox label={t('pt_link')} value={personalLink(p.personal_code)} />
          {isSuper && (
            <div className="row">
              <select value={moveTo} onChange={e => setMoveTo(e.target.value)} style={{ maxWidth: 360 }} aria-label={t('pt_move')}>
                <option value="">{t('pt_move')}…</option>
                {schools.filter(s => s.id !== p.school_id && s.is_demo === p.is_demo).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="btn sm" disabled={!moveTo} onClick={move}>{t('save')}</button>
            </div>
          )}
        </div>
        <div className="card">
          <h3>{t('pt_history')}</h3>
          {subs.length === 0 ? <p className="muted">{t('rs_none')}</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>{t('rs_campaign')}</th><th>{t('rs_date')}</th><th className="num">{t('rs_time')}</th>
                {keys.map(k => <th key={k.key} className="num">{pick(k as unknown as Record<string, unknown>, 'title', lang).split(' ')[0]}</th>)}
                <th className="num">%</th><th>{t('rs_group')}</th></tr></thead>
              <tbody>{subs.map(s => {
                const by = Object.fromEntries((s.answers || []).map(a => [a.task_key, a.score]))
                return (
                  <tr key={s.id}>
                    <td><Link to={`/admin/results/${s.id}`}>{pick((s.campaigns || {}) as Record<string, unknown>, 'name', lang)}</Link></td>
                    <td className="nowrap">{fmtDate(s.finished_at)}</td><td className="num">{fmtDuration(s.duration_seconds)}</td>
                    {keys.map(k => <td key={k.key} className="num"><ScoreBox s={by[k.key]} /></td>)}
                    <td className="num">{s.percent}%</td><td><GroupBadge g={s.group_no} /></td>
                  </tr>
                )
              })}</tbody></table></div>
          )}
        </div>
      </div>
    </>
  )
}
