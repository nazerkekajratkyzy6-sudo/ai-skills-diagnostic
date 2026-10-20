import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pick, useI18n, type TKey } from '../i18n'
import { Topbar, Loading, ErrorBox, ScoreBox } from '../components'
import { supabase, errCode } from '../lib/supabase'
import { isUrl, fmtDate } from '../lib/util'
import { StatusBadge } from './Cabinet'
import {
  promptLink, courseApi, shrinkImage, CourseError,
  type ModuleInfo, type CourseFile, type SubmitResult,
} from '../lib/course'

const ACCEPT = 'image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.html,.htm'
const OK_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'html', 'htm']
const MAX_FILE = 10 * 1024 * 1024
const MAX_FILES = 3

interface Form { prompt_text: string; result_text: string; link: string; reflection: string; files: CourseFile[] }

export default function CourseModule() {
  const { t, lang } = useI18n()
  const { personalCode = '', moduleKey = '' } = useParams()
  const [info, setInfo] = useState<ModuleInfo | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [form, setForm] = useState<Form>({ prompt_text: '', result_text: '', link: '', reflection: '', files: [] })
  const [err, setErr] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => supabase.rpc('get_course_module', { p_personal_code: personalCode, p_key: moduleKey })
    .then(({ data, error }) => {
      if (error) { setLoadErr(errCode(error)); return }
      const d = data as ModuleInfo
      setInfo(d)
      if (d.work) setForm({
        prompt_text: d.work.prompt_text || '', result_text: d.work.result_text || '', link: d.work.link || '',
        reflection: d.work.reflection || '', files: d.work.files || [],
      })
    })
  useEffect(() => { load() }, [personalCode, moduleKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loadErr) return (<><Topbar /><div className="page"><div className="card" style={{ marginTop: 24 }}>
    <div className="alert error" role="alert">{t(('e_' + loadErr) as TKey)}</div></div></div></>)
  if (!info) return (<><Topbar /><div className="page"><Loading /></div></>)

  const m = info.module
  const set = (p: Partial<Form>) => { setForm(f => ({ ...f, ...p })); setErr(null) }
  const steps = pick(m, 'steps', lang).split('\n').map(s => s.trim()).filter(Boolean)
  const promptUrl = promptLink(m.prompt_url)
  const last = result ?? (info.work ? {
    status: info.work.status, reason: info.work.checks?.reason ?? null, checks: info.work.checks,
    score: info.work.score, max_score: info.work.max_score, ai_scores: info.work.ai_scores,
    ai_feedback: info.work.ai_feedback, attempts: info.work.attempts,
  } as SubmitResult : null)

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return
    setErr(null)
    let current = [...form.files]
    for (const raw of Array.from(list)) {
      if (current.length >= MAX_FILES) { setErr(t('f_err_max', { n: MAX_FILES })); break }
      const ext = raw.name.toLowerCase().split('.').pop() || ''
      if (!OK_EXT.includes(ext)) { setErr(t('f_err_type')); continue }
      const file = await shrinkImage(raw)
      if (file.size > MAX_FILE) { setErr(t('f_err_size')); continue }
      setUploading(true)
      try {
        const r = await courseApi<{ path: string; token: string; content_type: string }>('upload_url', {
          personal_code: personalCode, file_name: file.name, size: file.size,
        })
        const { error } = await supabase.storage.from('evidence').uploadToSignedUrl(r.path, r.token, file, { contentType: r.content_type })
        if (error) throw error
        current = [...current, { path: r.path, name: raw.name.slice(0, 200), size: file.size, type: r.content_type }]
        set({ files: current })
      } catch (e) {
        const c = (e as Error).message
        setErr(c === 'file_type' ? t('f_err_type') : c === 'file_size' ? t('f_err_size') : t('f_err_upload'))
      }
      setUploading(false)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const validate = (): string | null => {
    if (form.link.trim() && !isUrl(form.link)) return t('w_err_link')
    if (!isUrl(form.link) && form.files.length === 0) return t('w_err_evidence')
    if (form.prompt_text.trim().length < m.min_prompt_length) return t('w_err_prompt', { n: m.min_prompt_length })
    if (form.result_text.trim().length < m.min_text_length) return t('w_err_description', { n: m.min_text_length })
    if (form.reflection.trim().length < m.min_reflection) return t('w_err_reflection', { n: m.min_reflection })
    return null
  }

  const submit = async () => {
    const v = validate()
    if (v) { setErr(v); return }
    setSending(true); setErr(null); setResult(null)
    try {
      const r = await courseApi<SubmitResult>('submit', {
        personal_code: personalCode, module_key: m.key, language: lang,
        prompt_text: form.prompt_text, result_text: form.result_text, link: form.link.trim(),
        reflection: form.reflection, files: form.files,
      })
      setResult(r)
      load()
      setTimeout(() => document.getElementById('check-result')?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (e) {
      const c = e instanceof CourseError ? e.message : 'generic'
      if (c === 'incomplete' && e instanceof CourseError) {
        const p = e.problems[0]
        setErr(p === 'evidence' ? t('w_err_evidence') : p === 'prompt' ? t('w_err_prompt', { n: m.min_prompt_length })
          : p === 'description' ? t('w_err_description', { n: m.min_text_length }) : t('w_err_reflection', { n: m.min_reflection }))
      } else {
        const key = `w_err_${c}` as TKey
        setErr(['no_diagnostic', 'module_locked', 'too_many_attempts'].includes(c) ? t(key) : t('w_err_generic'))
      }
    }
    setSending(false)
  }

  const counter = (v: string, n: number) => (
    <div className={'hint' + (v.trim().length >= n ? ' ok-text' : '')}>{v.trim().length} / {t('w_min', { n })}</div>
  )

  return (
    <>
      <Topbar />
      <div className="page stack">
        <div style={{ marginTop: 12 }}><Link to={`/k/${personalCode}`}>{t('mod_back')}</Link></div>

        <div className="card stack">
          <div className="row between">
            <h1 style={{ margin: 0 }}>{pick(m, 'title', lang)}</h1>
            <StatusBadge s={info.work?.status} />
          </div>
          <div><span className="label">{t('mod_goal')}</span><p style={{ margin: 0 }}>{pick(m, 'goal', lang)}</p></div>
          <div className="row">
            {m.video_url && <a className="btn" href={m.video_url} target="_blank" rel="noreferrer">{t('mod_video')}</a>}
            {promptUrl && <a className="btn primary" href={promptUrl} target="_blank" rel="noreferrer">{t('mod_prompt_tool')} ↗</a>}
          </div>
          {m.services.length > 0 && (
            <div><span className="label">{t('mod_services')}</span>
              <div className="chips">{m.services.map(s => <span key={s} className="chip">{s}</span>)}</div></div>
          )}
        </div>

        {info.locked && <div className="alert warn">{info.group_no ? t('mod_locked') : t('cab_no_diag')}</div>}

        <div className="card stack">
          <h2 style={{ margin: 0 }}>{t('mod_steps')}</h2>
          <ol className="steps">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <div className="alert info"><b>{t('mod_task')}:</b> {pick(m, 'task', lang)}</div>
        </div>

        <div className="card stack">
          <h2 style={{ margin: 0 }}>{t('mod_rubric')}</h2>
          <ol className="rubric">
            {m.rubric.map((c, i) => (
              <li key={i}>
                <span>{lang === 'ru' ? c.ru : c.kk}</span>
                {last?.ai_scores && <ScoreBox s={last.ai_scores[i]} />}
              </li>
            ))}
          </ol>
          <div className="hint">{t('mod_rubric_hint', { p: m.pass_percent })}</div>
        </div>

        {last && (
          <div className="card stack" id="check-result">
            <div className="row between">
              <h2 style={{ margin: 0 }}>{t('w_result')}</h2>
              {last.max_score > 0 && <b>{t('w_score', { s: last.score, m: last.max_score })}</b>}
            </div>
            {last.status === 'accepted' && <div className="alert ok">{t('w_accepted')}</div>}
            {last.status === 'needs_rework' && <div className="alert warn">{last.reason === 'duplicate' ? t('w_dup') : t('w_low')}</div>}
            {last.ai_feedback && <div><span className="label">{t('w_feedback')}</span><p style={{ margin: 0 }}>{last.ai_feedback}</p></div>}
            {!last.ai_scores && <p className="small muted" style={{ margin: 0 }}>{t('w_ai_off')}</p>}
            <div className="small muted">{t('w_attempts', { n: last.attempts })}{info.work && !result ? ` · ${fmtDate(info.work.updated_at, true)}` : ''}</div>
          </div>
        )}

        {!info.locked && (
          <div className="card stack">
            <h2 style={{ margin: 0 }}>{t('w_title')}</h2>

            <label className="field"><span>{t('w_prompt')}</span>
              <textarea value={form.prompt_text} onChange={e => set({ prompt_text: e.target.value })} maxLength={10000} rows={5} />
              {counter(form.prompt_text, m.min_prompt_length)}</label>

            <label className="field"><span>{t('w_link')}</span>
              <input type="url" inputMode="url" autoCapitalize="none" value={form.link} placeholder="https://..."
                onChange={e => set({ link: e.target.value })} /></label>

            <div className="field">
              <span className="label">{t('w_files', { n: MAX_FILES })}</span>
              <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={e => onFiles(e.target.files)} />
              <button type="button" className="btn block" disabled={uploading || form.files.length >= MAX_FILES}
                onClick={() => fileRef.current?.click()}>
                {uploading ? t('f_uploading') : `📎 ${t('f_upload')}`}
              </button>
              <div className="hint">{t('w_evidence_hint')}</div>
              {form.files.length > 0 && (
                <ul className="file-list">
                  {form.files.map(f => (
                    <li key={f.path}>
                      <span>📄 {f.name} <span className="muted small">({Math.max(1, Math.round(f.size / 1024))} KB)</span></span>
                      <button type="button" className="btn sm link" onClick={() => set({ files: form.files.filter(x => x.path !== f.path) })}>{t('f_remove')}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label className="field"><span>{t('w_desc')}</span>
              <textarea value={form.result_text} onChange={e => set({ result_text: e.target.value })} maxLength={20000} rows={4} />
              {counter(form.result_text, m.min_text_length)}</label>

            <label className="field"><span>{t('w_reflection')}</span>
              <textarea value={form.reflection} onChange={e => set({ reflection: e.target.value })} maxLength={3000} rows={3} />
              {counter(form.reflection, m.min_reflection)}</label>

            <ErrorBox msg={err} />
            <button type="button" className="btn primary big block" onClick={submit} disabled={uploading || sending}>
              {sending ? t('w_checking') : info.work ? t('w_resubmit') : t('w_submit')}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
