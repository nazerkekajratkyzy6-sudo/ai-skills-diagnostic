import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { pick, useI18n, type TKey } from '../i18n'
import { AdminHead, useAdmin } from './AdminLayout'
import { GroupBadge, Loading, ScoreBox, toast } from '../components'
import { supabase } from '../lib/supabase'
import { SUBMISSION_SELECT } from '../lib/export'
import { fmtDate, fmtDuration } from '../lib/util'
import type { Answer, EvidenceFile, Submission, Task } from '../lib/types'

export default function SubmissionView() {
  const { t, lang } = useI18n()
  const { id } = useParams()
  const { isSuper } = useAdmin()
  const nav = useNavigate()
  const [s, setS] = useState<Submission | null | undefined>(undefined)
  const [tasks, setTasks] = useState<Task[]>([])

  const load = useCallback(async () => {
    const { data } = await supabase.from('submissions').select(SUBMISSION_SELECT + ',chosen_task,platforms,platforms_other,answers(*)').eq('id', id).maybeSingle()
    const sub = data as unknown as Submission | null
    setS(sub)
    if (sub) {
      const { data: tt } = await supabase.from('tasks').select('*').eq('campaign_id', sub.campaign_id).order('position')
      setTasks((tt as Task[]) || [])
    }
  }, [id])
  useEffect(() => { load() }, [load])

  if (s === undefined) return <><AdminHead title="…" /><div className="admin-body"><Loading /></div></>
  if (s === null) return <><AdminHead title={t('rs_profile')} /><div className="admin-body"><p className="muted">{t('rs_none')}</p></div></>

  const answers = [...(s.answers || [])].sort((a, b) =>
    (tasks.find(x => x.key === a.task_key)?.position ?? 99) - (tasks.find(x => x.key === b.task_key)?.position ?? 99))

  const setScore = async (a: Answer, score: number) => {
    const { error } = await supabase.from('answers').update({ score }).eq('id', a.id)
    if (error) toast(error.message); else { toast(t('saved')); load() }
  }
  const markReviewed = async () => {
    const { error } = await supabase.from('submissions').update({ reviewed: !s.reviewed }).eq('id', s.id)
    if (error) toast(error.message); else load()
  }
  const del = async () => {
    if (!confirm(t('rs_delete_confirm'))) return
    const { error } = await supabase.from('submissions').delete().eq('id', s.id)
    if (error) toast(error.message); else nav('/admin/results')
  }

  return (
    <>
      <AdminHead title={s.full_name}>
        {s.is_demo && <span className="badge demo">{t('demo_badge')}</span>}
        <GroupBadge g={s.group_no} />
      </AdminHead>
      <div className="admin-body stack">
        <div className="card">
          <div className="grid grid-3 small">
            <div><span className="muted">{t('rs_name')}</span><br /><b><Link to={`/admin/participants/${s.participant_id}`}>{s.full_name}</Link></b><br />{s.position}</div>
            <div><span className="muted">{t('rs_school')}</span><br /><b>{s.schools?.name}</b></div>
            <div><span className="muted">{t('rs_campaign')}</span><br /><b>{pick((s.campaigns || {}) as Record<string, unknown>, 'name', lang)}</b></div>
            <div><span className="muted">{t('rs_date')}</span><br /><b>{fmtDate(s.finished_at, true)}</b></div>
            <div><span className="muted">{t('rs_language')}</span><br /><b>{s.language === 'ru' ? t('rs_lang_ru') : t('rs_lang_kk')}</b></div>
            <div><span className="muted">{t('rs_time')}</span><br /><b>{fmtDuration(s.duration_seconds)}</b></div>
          </div>
          <hr />
          <div className="row">
            <div><span className="muted">{t('rs_summary')}:</span> <b style={{ fontSize: '1.2rem' }}>{t(`group_${s.group_no}` as TKey)}</b> · {s.total_score}/{s.max_score} ({s.percent}%)</div>
            <div className="spacer" />
            {isSuper && <button className="btn sm" onClick={markReviewed}>{s.reviewed ? `✓ ${t('rs_reviewed')}` : t('rs_mark_reviewed')}</button>}
            {isSuper && <button className="btn sm danger" onClick={del}>{t('rs_delete')}</button>}
          </div>
        </div>

        <div className="card">
          <h3>{t('rs_skills')}</h3>
          <div className="stack">
            {answers.map(a => {
              const tk = tasks.find(x => x.key === a.task_key)
              const proc = tk ? (lang === 'kk' ? tk.process_kk : tk.process_ru)[a.process_level] : a.process_level
              const extraOpts = tk ? (lang === 'kk' ? tk.extra_options_kk : tk.extra_options_ru) : []
              return (
                <div key={a.id} className="task-edit">
                  <div className="row">
                    <ScoreBox s={a.score} />
                    <b>{tk ? pick(tk as unknown as Record<string, unknown>, 'title', lang) : a.task_key}</b>
                    {a.score !== a.auto_score && <span className="small muted">({t('rs_auto')}: {a.auto_score})</span>}
                    <div className="spacer" />
                    {isSuper && (
                      <label className="small row" style={{ gap: 6 }} title={t('rs_score_override')}>
                        <span className="muted">{t('st_score')}:</span>
                        <select value={a.score} onChange={e => setScore(a, Number(e.target.value))} style={{ width: 70, minHeight: 36 }} aria-label={t('rs_score_override')}>
                          <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="small stack" style={{ marginTop: 8 }}>
                    <div><span className="muted">{t('rs_process')}:</span> {proc}</div>
                    <div><span className="muted">{t('rs_tools')}:</span> {[...a.tools, a.other_tool].filter(Boolean).join(', ') || '—'}</div>
                    {a.files && a.files.length > 0 && <FileList files={a.files} />}
                    {a.link && <div className="evidence"><span className="muted">{t('q_link')}:</span> <a href={a.link} target="_blank" rel="noopener noreferrer nofollow">{a.link}</a></div>}
                    {a.result_text && <div><span className="muted">{t('rs_text')}:</span><pre className="pack">{a.result_text}</pre></div>}
                    {a.prompt_text && <div><span className="muted">{t('rs_prompt')}:</span><pre className="pack">{a.prompt_text}</pre></div>}
                    {a.extra_answer.length > 0 && <div><span className="muted">{t('rs_extra')}:</span> {a.extra_answer.map(i => extraOpts[i] ?? i).join(', ')}</div>}
                    {a.time_seconds != null && <div className="muted">{t('rs_time')}: {fmtDuration(a.time_seconds)}</div>}
                  </div>
                </div>
              )
            })}
          </div>
          {s.chosen_task && <p className="small" style={{ marginTop: 12 }}><span className="muted">{t('rs_chosen')}:</span> <b>{(() => { const tk = tasks.find(x => x.key === s.chosen_task); return tk ? pick(tk, 'title', lang) : s.chosen_task })()}</b></p>}
          {s.vibe_self != null && <p className="small" style={{ marginTop: 12 }}><span className="muted">{t('rs_vibe_self')}:</span> <b>{s.vibe_self} / 5</b></p>}
          <p className="small"><span className="muted">{t('rs_tools')}:</span> {s.tools_used.join(', ') || '—'} ({s.tools_count})</p>
        </div>
        {(Object.keys(s.platforms || {}).length > 0 || s.platforms_other) && (
          <div className="card small stack">
            <h3>{t('st_platforms')}</h3>
            <div><span className="muted">{t('rs_pl_master')}:</span> <b>{Object.entries(s.platforms || {}).filter(([, v]) => v === 2).map(([k]) => k).join(', ') || '—'}</b></div>
            <div><span className="muted">{t('rs_pl_know')}:</span> {Object.entries(s.platforms || {}).filter(([, v]) => v === 1).map(([k]) => k).join(', ') || '—'}</div>
            {s.platforms_other && <div><span className="muted">{t('rs_pl_other')}:</span> {s.platforms_other}</div>}
          </div>
        )}
      </div>
    </>
  )
}

function FileList({ files }: { files: EvidenceFile[] }) {
  const { t } = useI18n()
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    Promise.all(files.map(async f => {
      const { data } = await supabase.storage.from('evidence').createSignedUrl(f.path, 3600)
      return [f.path, data?.signedUrl || ''] as const
    })).then(r => { if (alive) setUrls(Object.fromEntries(r)) })
    return () => { alive = false }
  }, [files])
  const images = files.filter(f => f.type.startsWith('image/') && !/heic|heif/.test(f.type))
  const others = files.filter(f => !images.includes(f))
  return (
    <div className="stack">
      <span className="muted">{t('rs_files')}:</span>
      {images.length > 0 && (
        <div className="thumbs">{images.map(f => urls[f.path]
          ? <a key={f.path} href={urls[f.path]} target="_blank" rel="noopener noreferrer" title={f.name}><img src={urls[f.path]} alt={f.name} /></a>
          : <span key={f.path} className="muted">{f.name}</span>)}</div>
      )}
      {others.map(f => (
        <div key={f.path} className="evidence">📄 {urls[f.path]
          ? <a href={urls[f.path] + (f.type === 'text/html' ? '&download=' : '')} target="_blank" rel="noopener noreferrer">{f.name}</a>
          : f.name} <span className="muted">({Math.max(1, Math.round(f.size / 1024))} KB)</span></div>
      ))}
    </div>
  )
}
