import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { LangSwitch, pick, useI18n, type TKey } from '../i18n'
import { Topbar, Loading, ErrorBox } from '../components'
import { supabase, errCode, adminApi } from '../lib/supabase'
import { isUrl } from '../lib/util'
import type { EvidenceFile } from '../lib/types'

interface PubTask {
  key: string; kind: 'standard' | 'vibe'; title_kk: string; title_ru: string; instruction_kk: string; instruction_ru: string
  tool_options: string[]; allow_text: boolean; prompt_mode: 'none' | 'optional' | 'required'
  process_kk: string[]; process_ru: string[]; extra_type: 'none' | 'multi' | 'single'
  extra_question_kk: string | null; extra_question_ru: string | null; extra_options_kk: string[]; extra_options_ru: string[]
}
interface DiagInfo {
  school: { name: string; code: string; city: string | null; is_demo: boolean }
  campaign: {
    code: string; name_kk: string; name_ru: string; topic_kk: string; topic_ru: string
    product_choice: boolean; platform_survey: boolean; platform_options: string[]; allow_files: boolean; max_files: number
  }
  participant: { full_name: string; position: string | null; personal_code: string } | null
  tasks: PubTask[]
}
interface Ans {
  process_level: number | null; tools: string[]; other_on: boolean; other_tool: string; link: string
  result_text: string; prompt_text: string; extra_answer: number[]; time_seconds: number; files: EvidenceFile[]
}
const emptyAns = (): Ans => ({ process_level: null, tools: [], other_on: false, other_tool: '', link: '', result_text: '', prompt_text: '', extra_answer: [], time_seconds: 0, files: [] })

interface Draft {
  full_name: string; position: string; step: number; started_at: string | null; answers: Record<string, Ans>
  chosen_task: string | null; platforms: Record<string, number>; platforms_other: string
}
const emptyDraft = (): Draft => ({ full_name: '', position: '', step: 0, started_at: null, answers: {}, chosen_task: null, platforms: {}, platforms_other: '' })

const POSITIONS_KK = ['Мұғалім', 'Директордың орынбасары', 'Директор', 'Әдіскер', 'Педагог-психолог', 'Тәрбиеші']
const POSITIONS_RU = ['Учитель', 'Заместитель директора', 'Директор', 'Методист', 'Педагог-психолог', 'Воспитатель']
const ACCEPT = 'image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.html,.htm'
const OK_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'html', 'htm']
const MAX_FILE = 10 * 1024 * 1024

function storageGet(k: string) { try { return localStorage.getItem(k) } catch { return null } }
function storageSet(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* ignore */ } }
function storageDel(k: string) { try { localStorage.removeItem(k) } catch { /* ignore */ } }

/** Телефон фотосын жеңілдету: 1920px-ке дейін кішірейтіп, JPEG ретінде сақтау */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch { return file }
}

type Screen = { kind: 'intro' } | { kind: 'platforms' } | { kind: 'choose' } | { kind: 'task'; task: PubTask } | { kind: 'review' }

export default function Diagnostic() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { schoolCode, personalCode } = useParams()
  const [sp] = useSearchParams()
  const campaignCode = sp.get('c') || null

  const [info, setInfo] = useState<DiagInfo | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const stepEnteredAt = useRef<number>(Date.now())
  const topRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const draftKey = info ? `aisd_draft_${info.school.code}_${info.campaign.code}_${info.participant?.personal_code || ''}` : ''

  useEffect(() => {
    let alive = true
    supabase.rpc('get_diagnostic', { p_school_code: schoolCode || null, p_campaign_code: campaignCode, p_personal_code: personalCode || null })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { setLoadErr(errCode(error)); return }
        const d = data as DiagInfo
        setInfo(d)
        const key = `aisd_draft_${d.school.code}_${d.campaign.code}_${d.participant?.personal_code || ''}`
        const saved = storageGet(key)
        let base = emptyDraft()
        if (saved) { try { base = { ...base, ...JSON.parse(saved) } } catch { /* ignore */ } }
        if (d.participant) { base.full_name = d.participant.full_name; base.position = base.position || d.participant.position || '' }
        setDraft(base)
      })
    return () => { alive = false }
  }, [schoolCode, personalCode, campaignCode])

  useEffect(() => { if (draftKey) storageSet(draftKey, JSON.stringify(draft)) }, [draft, draftKey])

  const tasks = info?.tasks || []
  const standard = tasks.filter(x => x.kind === 'standard')
  const choiceMode = !!info?.campaign.product_choice && standard.length > 0
  const activeTasks = choiceMode
    ? tasks.filter(x => x.kind !== 'standard' || x.key === draft.chosen_task)
    : tasks

  const screens: Screen[] = useMemo(() => {
    if (!info) return []
    const out: Screen[] = [{ kind: 'intro' }]
    if (info.campaign.platform_survey && info.campaign.platform_options.length) out.push({ kind: 'platforms' })
    if (choiceMode) out.push({ kind: 'choose' })
    for (const tk of activeTasks) out.push({ kind: 'task', task: tk })
    out.push({ kind: 'review' })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, choiceMode, draft.chosen_task])

  const step = Math.min(draft.step, Math.max(0, screens.length - 1))
  const screen = screens[step]
  const task = screen?.kind === 'task' ? screen.task : null
  const taskIndex = task ? activeTasks.findIndex(x => x.key === task.key) : -1
  const ans: Ans = task ? { ...emptyAns(), ...(draft.answers[task.key] || {}) } : emptyAns()

  const setAns = (patch: Partial<Ans>) => {
    if (!task) return
    setDraft(d => ({ ...d, answers: { ...d.answers, [task.key]: { ...emptyAns(), ...(d.answers[task.key] || {}), ...patch } } }))
  }

  const goStep = (n: number) => {
    const spent = Math.round((Date.now() - stepEnteredAt.current) / 1000)
    stepEnteredAt.current = Date.now()
    setDraft(d => {
      const answers = { ...d.answers }
      if (task) answers[task.key] = { ...emptyAns(), ...(answers[task.key] || {}), time_seconds: (answers[task.key]?.time_seconds || 0) + spent }
      return { ...d, answers, step: n, started_at: d.started_at || (n >= 1 ? new Date().toISOString() : null) }
    })
    setErr(null)
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const hasEvidence = (tk: PubTask, a: Ans) => (a.link.trim() && isUrl(a.link)) || a.files.length > 0 || (tk.allow_text && a.result_text.trim())

  const validateTask = (tk: PubTask, a: Ans): TKey | null => {
    if (a.process_level == null) return 'err_process'
    if (a.process_level > 0) {
      if (a.tools.length === 0 && !(a.other_on && a.other_tool.trim())) return 'err_tools'
      if (a.link.trim() && !isUrl(a.link)) return 'err_link'
      if (!hasEvidence(tk, a)) return info?.campaign.allow_files ? 'err_evidence_files' : (tk.allow_text ? 'err_evidence' : 'err_link')
      if (tk.prompt_mode === 'required' && a.prompt_text.trim().length < 5) return 'err_prompt'
    }
    if (tk.extra_type === 'single' && a.extra_answer.length === 0) return 'err_extra'
    return null
  }

  const startDiag = (e: React.FormEvent) => {
    e.preventDefault()
    if (draft.full_name.trim().replace(/\s+/g, ' ').length < 3) { setErr(t('err_name')); return }
    if (!draft.position.trim()) { setErr(t('err_position')); return }
    goStep(step + 1)
  }

  const nextFromTask = () => {
    if (!task) return
    const v = validateTask(task, ans)
    if (v) { setErr(t(v)); return }
    goStep(step + 1)
  }

  const onFiles = async (list: FileList | null) => {
    if (!list || !info || !task) return
    setErr(null)
    const max = info.campaign.max_files
    let current = [...ans.files]
    for (const raw of Array.from(list)) {
      if (current.length >= max) { setErr(t('f_err_max', { n: max })); break }
      const ext = raw.name.toLowerCase().split('.').pop() || ''
      if (!OK_EXT.includes(ext)) { setErr(t('f_err_type')); continue }
      const file = await shrinkImage(raw)
      if (file.size > MAX_FILE) { setErr(t('f_err_size')); continue }
      setUploading(true)
      try {
        const r = await adminApi<{ path: string; token: string; content_type: string }>('upload_url', {
          school_code: info.school.code, campaign_code: info.campaign.code, personal_code: info.participant?.personal_code || null,
          file_name: file.name, size: file.size,
        })
        const { error } = await supabase.storage.from('evidence').uploadToSignedUrl(r.path, r.token, file, { contentType: r.content_type })
        if (error) throw error
        current = [...current, { path: r.path, name: raw.name.slice(0, 200), size: file.size, type: r.content_type }]
        setAns({ files: current })
      } catch (e) {
        const m = (e as Error).message
        setErr(m === 'file_type' ? t('f_err_type') : m === 'file_size' ? t('f_err_size') : t('f_err_upload'))
      }
      setUploading(false)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = async () => {
    if (!info) return
    setSending(true); setErr(null)
    const payload = {
      school_code: info.school.code, campaign_code: info.campaign.code, personal_code: info.participant?.personal_code || null,
      full_name: draft.full_name.trim(), position: draft.position.trim(), language: lang, started_at: draft.started_at,
      chosen_task: choiceMode ? draft.chosen_task : null,
      platforms: draft.platforms, platforms_other: draft.platforms_other.trim(),
      answers: activeTasks.map(tk => {
        const a = { ...emptyAns(), ...(draft.answers[tk.key] || {}) }
        const done = (a.process_level ?? 0) > 0
        return {
          task_key: tk.key, process_level: a.process_level ?? 0,
          tools: done ? a.tools : [], other_tool: done && a.other_on ? a.other_tool.trim() : '',
          link: done ? a.link.trim() : '', result_text: done && tk.allow_text ? a.result_text : '',
          prompt_text: done ? a.prompt_text : '', extra_answer: a.extra_answer, time_seconds: a.time_seconds,
          files: done ? a.files : [],
        }
      }),
    }
    const { data, error } = await supabase.rpc('submit_diagnostic', { p: payload })
    setSending(false)
    if (error) { setErr(t(('e_' + errCode(error)) as TKey)); return }
    const token = (data as { token: string }).token
    storageDel(draftKey)
    storageSet('aisd_last_result', token)
    nav(`/r/${token}`, { replace: true })
  }

  const progress = screens.length > 1 ? Math.round((step / (screens.length - 1)) * 100) : 0

  if (loadErr) {
    return (<><Topbar /><div className="page"><div className="card" style={{ marginTop: 24 }}>
      <div className="alert error" role="alert">{t(('e_' + loadErr) as TKey)}</div>
    </div></div></>)
  }
  if (!info || !screen) return (<><Topbar /><div className="page"><Loading /></div></>)

  const positions = lang === 'kk' ? POSITIONS_KK : POSITIONS_RU
  const nav2 = (onNext: () => void, nextLabel = t('next')) => (
    <div className="row nav-buttons">
      <button type="button" className="btn big" onClick={() => goStep(step - 1)} disabled={uploading || sending}>{t('back')}</button>
      <div className="spacer" />
      <button type="button" className="btn primary big" onClick={onNext} disabled={uploading || sending}>{nextLabel}</button>
    </div>
  )
  const known = Object.keys(draft.platforms).filter(k => info.campaign.platform_options.includes(k))

  return (
    <>
      <Topbar />
      <div className="page" ref={topRef}>
        {info.school.is_demo && <p><span className="badge demo">{t('demo_badge')}</span></p>}
        {screen.kind !== 'intro' && (
          <div className="stack" style={{ marginBottom: 12 }}>
            <div className="row between small muted">
              <span>{task ? t('task_of', { n: taskIndex + 1, total: activeTasks.length }) : ''}</span>
              <span>{pick(info.campaign, 'name', lang)}</span>
            </div>
            <div className="progress" aria-hidden="true"><div style={{ width: `${progress}%` }} /></div>
          </div>
        )}

        {screen.kind === 'intro' && (
          <form className="stack" onSubmit={startDiag}>
            <div className="center" style={{ padding: '12px 0 4px' }}>
              <h1>{t('diag_title')}</h1>
              <p className="muted" style={{ fontSize: '1.05rem' }}>{t('diag_sub')}</p>
            </div>
            <div className="card stack">
              <label className="field"><span>{t('f_full_name')}</span>
                <input type="text" autoComplete="name" value={draft.full_name} readOnly={!!info.participant}
                  onChange={e => setDraft({ ...draft, full_name: e.target.value })} placeholder={t('f_full_name_ph')} required /></label>
              <div className="field"><span className="label">{t('f_school')}</span>
                <div className="alert info" style={{ padding: '10px 12px' }}>{info.school.name}{info.school.city ? `, ${info.school.city}` : ''}</div></div>
              <label className="field"><span>{t('f_position')}</span>
                <input type="text" list="positions" value={draft.position} onChange={e => setDraft({ ...draft, position: e.target.value })}
                  placeholder={t('f_position_ph')} required />
                <datalist id="positions">{positions.map(p => <option key={p} value={p} />)}</datalist></label>
              <div className="field"><span className="label">{t('f_language')}</span><LangSwitch /></div>
              <div className="alert info small"><b>{t('topic')}:</b> {pick(info.campaign, 'topic', lang)}</div>
              <ErrorBox msg={err} />
              <button className="btn primary big block" type="submit">{t('start')}</button>
              <p className="hint center">{t('draft_saved')}</p>
            </div>
          </form>
        )}

        {screen.kind === 'platforms' && (
          <div className="card stack">
            <h2 style={{ marginBottom: 0 }}>{t('pl_title')}</h2>
            <p className="muted" style={{ margin: 0 }}>{t('pl_sub')}</p>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">{t('pl_know')}</legend>
              <div className="chips">
                {info.campaign.platform_options.map(pl => {
                  const on = !!draft.platforms[pl]
                  return (
                    <label key={pl} className={'chip' + (on ? ' on' : '')}>
                      <input type="checkbox" checked={on} onChange={() => {
                        const next = { ...draft.platforms }
                        if (on) delete next[pl]; else next[pl] = 1
                        setDraft({ ...draft, platforms: next })
                      }} />{on ? '✓ ' : ''}{pl}
                    </label>
                  )
                })}
              </div>
            </fieldset>
            {known.length > 0 && (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="label">{t('pl_master')}</legend>
                <p className="hint" style={{ marginTop: 0 }}>{t('pl_master_hint')}</p>
                <div className="chips">
                  {known.map(pl => {
                    const on = draft.platforms[pl] === 2
                    return (
                      <label key={pl} className={'chip' + (on ? ' on master' : '')}>
                        <input type="checkbox" checked={on} onChange={() => setDraft({ ...draft, platforms: { ...draft.platforms, [pl]: on ? 1 : 2 } })} />
                        {on ? '★ ' : ''}{pl}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )}
            <label className="field"><span>{t('pl_other')}</span>
              <input type="text" value={draft.platforms_other} maxLength={300} placeholder={t('pl_other_ph')}
                onChange={e => setDraft({ ...draft, platforms_other: e.target.value })} /></label>
            {known.length === 0 && <p className="hint">{t('pl_none_selected')}</p>}
            {nav2(() => goStep(step + 1))}
          </div>
        )}

        {screen.kind === 'choose' && (
          <div className="card stack">
            <h2 style={{ marginBottom: 0 }}>{t('ch_title')}</h2>
            <p className="muted" style={{ margin: 0 }}>{t('ch_sub')}</p>
            <div className="alert info small"><b>{t('topic')}:</b> {pick(info.campaign, 'topic', lang)}</div>
            <div className="choices">
              {standard.map(tk => (
                <label key={tk.key} className={'choice' + (draft.chosen_task === tk.key ? ' on' : '')}>
                  <input type="radio" name="chosen" checked={draft.chosen_task === tk.key} onChange={() => setDraft({ ...draft, chosen_task: tk.key })} />
                  <span><b>{pick(tk, 'title', lang)}</b><br /><span className="small muted">{pick(tk, 'instruction', lang).split('.')[0]}.</span></span>
                </label>
              ))}
            </div>
            <ErrorBox msg={err} />
            {nav2(() => { if (!draft.chosen_task) { setErr(t('err_choice')); return } goStep(step + 1) })}
          </div>
        )}

        {task && (
          <div className="card stack">
            <h2 style={{ marginBottom: 0 }}>{pick(task, 'title', lang)}</h2>
            <div className="alert info small"><b>{t('topic')}:</b> {pick(info.campaign, 'topic', lang)}</div>
            <p style={{ fontSize: '1.03rem' }}>{pick(task, 'instruction', lang)}</p>

            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">{t('q_process')}</legend>
              <div className="choices">
                {(lang === 'kk' ? task.process_kk : task.process_ru).map((txt, i) => (
                  <label key={i} className={'choice' + (ans.process_level === i ? ' on' : '')}>
                    <input type="radio" name={`proc-${task.key}`} checked={ans.process_level === i} onChange={() => setAns({ process_level: i })} />
                    <span>{txt}</span>
                  </label>
                ))}
              </div>
              <p className="hint">{t('skip_hint')}</p>
            </fieldset>

            {(ans.process_level ?? 0) > 0 && (
              <>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('q_tools')} <span className="muted small">({t('q_tools_hint')})</span></legend>
                  <div className="chips">
                    {task.tool_options.map(tool => {
                      const on = ans.tools.includes(tool)
                      return (
                        <label key={tool} className={'chip' + (on ? ' on' : '')}>
                          <input type="checkbox" checked={on} onChange={() => setAns({ tools: on ? ans.tools.filter(x => x !== tool) : [...ans.tools, tool] })} />
                          {on ? '✓ ' : ''}{tool}
                        </label>
                      )
                    })}
                    <label className={'chip' + (ans.other_on ? ' on' : '')}>
                      <input type="checkbox" checked={ans.other_on} onChange={() => setAns({ other_on: !ans.other_on })} />
                      {ans.other_on ? '✓ ' : ''}{t('other')}
                    </label>
                  </div>
                  {ans.other_on && <input type="text" style={{ marginTop: 8 }} value={ans.other_tool} maxLength={100}
                    onChange={e => setAns({ other_tool: e.target.value })} placeholder={t('other_ph')} aria-label={t('other_ph')} />}
                </fieldset>

                <label className="field"><span>{t('q_link')}</span>
                  <input type="url" inputMode="url" autoCapitalize="none" value={ans.link} onChange={e => setAns({ link: e.target.value })} placeholder={t('q_link_ph')} />
                  <div className="hint">{t('q_link_hint')}</div></label>

                {info.campaign.allow_files && (
                  <div className="field">
                    <span className="label">{t('f_or')}</span>
                    <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={e => onFiles(e.target.files)} />
                    <button type="button" className="btn block" disabled={uploading || ans.files.length >= info.campaign.max_files}
                      onClick={() => fileRef.current?.click()}>
                      {uploading ? t('f_uploading') : `📎 ${t('f_upload')}`}
                    </button>
                    <div className="hint">{t('f_upload_hint', { n: info.campaign.max_files })}</div>
                    {ans.files.length > 0 && (
                      <ul className="file-list">
                        {ans.files.map(f => (
                          <li key={f.path}>
                            <span>📄 {f.name} <span className="muted small">({Math.max(1, Math.round(f.size / 1024))} KB)</span></span>
                            <button type="button" className="btn sm link" onClick={() => setAns({ files: ans.files.filter(x => x.path !== f.path) })}>{t('f_remove')}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {task.allow_text && (
                  <label className="field"><span>{t('q_text')}</span>
                    <textarea value={ans.result_text} onChange={e => setAns({ result_text: e.target.value })} maxLength={20000} /></label>
                )}

                {task.prompt_mode !== 'none' && (
                  <label className="field"><span>{task.prompt_mode === 'required' ? t('q_prompt_required') : t('q_prompt')}</span>
                    <textarea value={ans.prompt_text} onChange={e => setAns({ prompt_text: e.target.value })} placeholder={t('q_prompt_ph')} maxLength={10000} /></label>
                )}
              </>
            )}

            {task.extra_type !== 'none' && (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="label">{pick(task, 'extra_question', lang)}</legend>
                {task.extra_type === 'multi' ? (
                  <div className="chips">
                    {(lang === 'kk' ? task.extra_options_kk : task.extra_options_ru).map((o, i) => {
                      const on = ans.extra_answer.includes(i)
                      return (
                        <label key={i} className={'chip' + (on ? ' on' : '')}>
                          <input type="checkbox" checked={on} onChange={() => setAns({ extra_answer: on ? ans.extra_answer.filter(x => x !== i) : [...ans.extra_answer, i] })} />
                          {on ? '✓ ' : ''}{o}
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <div className="choices">
                    {(lang === 'kk' ? task.extra_options_kk : task.extra_options_ru).map((o, i) => (
                      <label key={i} className={'choice' + (ans.extra_answer[0] === i ? ' on' : '')}>
                        <input type="radio" name={`extra-${task.key}`} checked={ans.extra_answer[0] === i} onChange={() => setAns({ extra_answer: [i] })} />
                        <span>{i + 1}. {o}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            )}

            <ErrorBox msg={err} />
            {nav2(nextFromTask)}
          </div>
        )}

        {screen.kind === 'review' && (
          <div className="card stack">
            <h2>{t('review_title')}</h2>
            <div className="stack">
              {activeTasks.map(tk => {
                const a = draft.answers[tk.key]
                const done = (a?.process_level ?? 0) > 0
                const idx = screens.findIndex(s => s.kind === 'task' && s.task.key === tk.key)
                return (
                  <div key={tk.key} className="row between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <button type="button" className="btn link" onClick={() => goStep(idx)}>{pick(tk, 'title', lang)}</button>
                    <span className={'badge ' + (done ? 'ok' : '')}>{done ? t('review_done') : t('review_not_done')}</span>
                  </div>
                )
              })}
            </div>
            <ErrorBox msg={err} />
            {nav2(submit, sending ? t('sending') : t('finish'))}
          </div>
        )}
      </div>
    </>
  )
}
