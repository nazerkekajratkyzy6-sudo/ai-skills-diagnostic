import { useCallback, useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { pick, useI18n } from '../i18n'
import { AdminHead, useAdmin } from './AdminLayout'
import { StatusBadge } from './Campaigns'
import { ErrorBox, Loading, toast } from '../components'
import { supabase } from '../lib/supabase'
import { useSchools } from '../lib/data'
import type { Campaign, Task } from '../lib/types'

const lines = (v: string) => v.split('\n').map(x => x.trim()).filter(Boolean)

export default function CampaignEdit() {
  const { t, lang } = useI18n()
  const { id } = useParams()
  const { isSuper } = useAdmin()
  const { schools } = useSchools()
  const [c, setC] = useState<Campaign | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [nResults, setNResults] = useState(0)
  const [tab, setTab] = useState<'main' | 'tasks' | 'thr'>('main')
  const [err, setErr] = useState<string | null>(null)
  const [platformsText, setPlatformsText] = useState('')

  const load = useCallback(async () => {
    const [{ data: cc }, { data: tt }, { data: cs }, { count }] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', id).maybeSingle(),
      supabase.from('tasks').select('*').eq('campaign_id', id).order('position'),
      supabase.from('campaign_schools').select('school_id').eq('campaign_id', id),
      supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('campaign_id', id),
    ])
    setC(cc as Campaign); setPlatformsText(((cc as Campaign)?.platform_options || []).join('\n')); setTasks((tt as Task[]) || []); setSel(((cs as { school_id: string }[]) || []).map(x => x.school_id)); setNResults(count || 0)
  }, [id])
  useEffect(() => { load() }, [load])

  if (!isSuper) return <Navigate to="/admin" replace />
  if (!c) return <><AdminHead title="…" /><div className="admin-body"><Loading /></div></>

  const saveCampaign = async (patch: Partial<Campaign>) => {
    setErr(null)
    const { error } = await supabase.from('campaigns').update(patch).eq('id', c.id)
    if (error) { setErr(error.message); return false }
    toast(t('saved')); load(); return true
  }
  const saveSchools = async () => {
    await supabase.from('campaign_schools').delete().eq('campaign_id', c.id)
    if (!c.all_schools && sel.length) {
      const { error } = await supabase.from('campaign_schools').insert(sel.map(s => ({ campaign_id: c.id, school_id: s })))
      if (error) { setErr(error.message); return }
    }
    await saveCampaign({ all_schools: c.all_schools })
  }
  const recalc = async () => {
    const { data, error } = await supabase.rpc('recalc_campaign', { p_campaign: c.id })
    if (error) toast(error.message); else toast(t('cp_recalc_done', { n: data as number }))
  }
  const setField = <K extends keyof Campaign>(k: K, v: Campaign[K]) => setC({ ...c, [k]: v })

  return (
    <>
      <AdminHead title={pick(c as unknown as Record<string, unknown>, 'name', lang)}>
        {c.is_demo && <span className="badge demo">{t('demo_badge')}</span>}
        <StatusBadge s={c.status} />
        {c.status !== 'published' && <button className="btn primary" onClick={() => saveCampaign({ status: 'published', published_at: new Date().toISOString() })}>{c.status === 'closed' ? t('cp_reopen') : t('cp_publish')}</button>}
        {c.status === 'published' && <button className="btn danger" onClick={() => saveCampaign({ status: 'closed' })}>{t('cp_close')}</button>}
      </AdminHead>
      <div className="admin-body">
        <div className="tabs">
          <button className={tab === 'main' ? 'on' : ''} onClick={() => setTab('main')}>{t('cp_status')} / {t('cp_schools')}</button>
          <button className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}>{t('cp_tasks')} ({tasks.filter(x => x.enabled).length})</button>
          <button className={tab === 'thr' ? 'on' : ''} onClick={() => setTab('thr')}>{t('cp_thresholds')} / {t('cp_criteria')}</button>
        </div>
        <ErrorBox msg={err} />

        {tab === 'main' && (
          <div className="stack">
            <form className="card stack" onSubmit={e => { e.preventDefault(); saveCampaign({ name_kk: c.name_kk, name_ru: c.name_ru, topic_kk: c.topic_kk, topic_ru: c.topic_ru }) }}>
              <div className="grid grid-2">
                <label className="field"><span>{t('cp_name_kk')}</span><input type="text" required value={c.name_kk} onChange={e => setField('name_kk', e.target.value)} /></label>
                <label className="field"><span>{t('cp_name_ru')}</span><input type="text" required value={c.name_ru} onChange={e => setField('name_ru', e.target.value)} /></label>
                <label className="field"><span>{t('cp_topic_kk')}</span><textarea required value={c.topic_kk} onChange={e => setField('topic_kk', e.target.value)} style={{ minHeight: 60 }} /></label>
                <label className="field"><span>{t('cp_topic_ru')}</span><textarea required value={c.topic_ru} onChange={e => setField('topic_ru', e.target.value)} style={{ minHeight: 60 }} /></label>
              </div>
              <div className="row"><span className="muted small">Code: <b className="mono">{c.code}</b> · {t('cp_results_count')}: {nResults}</span><div className="spacer" /><button className="btn primary">{t('save')}</button></div>
            </form>
            <div className="card stack">
              <h3>{t('cp_format')}</h3>
              <label className="checkbox"><input type="checkbox" checked={c.product_choice} onChange={e => setField('product_choice', e.target.checked)} /> {t('cp_product_choice')}</label>
              <p className="hint" style={{ marginTop: -6 }}>{t('cp_product_choice_hint')}</p>
              <label className="checkbox"><input type="checkbox" checked={c.allow_files} onChange={e => setField('allow_files', e.target.checked)} /> {t('cp_allow_files')}</label>
              {c.allow_files && <NumField label={t('cp_max_files')} v={c.max_files} min={1} max={10} on={v => setField('max_files', v)} />}
              <label className="checkbox"><input type="checkbox" checked={c.platform_survey} onChange={e => setField('platform_survey', e.target.checked)} /> {t('cp_platform_survey')}</label>
              {c.platform_survey && (
                <label className="field"><span>{t('cp_platform_options')}</span>
                  <textarea rows={8} value={platformsText} onChange={e => setPlatformsText(e.target.value)} /></label>
              )}
              <div><button className="btn primary" onClick={() => saveCampaign({
                product_choice: c.product_choice, allow_files: c.allow_files, max_files: c.max_files, platform_survey: c.platform_survey,
                platform_options: Array.from(new Set(lines(platformsText))),
              })}>{t('save')}</button></div>
            </div>
            <div className="card stack">
              <h3>{t('cp_schools')}</h3>
              <label className="checkbox"><input type="radio" checked={c.all_schools} onChange={() => setField('all_schools', true)} /> {t('cp_all_schools')}</label>
              <label className="checkbox"><input type="radio" checked={!c.all_schools} onChange={() => setField('all_schools', false)} /> {t('cp_selected_schools')}</label>
              {!c.all_schools && (
                <div className="chips">
                  {schools.filter(s => s.is_demo === c.is_demo).map(s => {
                    const on = sel.includes(s.id)
                    return <label key={s.id} className={'chip' + (on ? ' on' : '')}><input type="checkbox" checked={on}
                      onChange={() => setSel(on ? sel.filter(x => x !== s.id) : [...sel, s.id])} />{on ? '✓ ' : ''}{s.name}</label>
                  })}
                </div>
              )}
              <div><button className="btn primary" onClick={saveSchools}>{t('save')}</button></div>
              <p className="hint">{t('cp_link_note')} <code>?c={c.code}</code></p>
            </div>
          </div>
        )}

        {tab === 'tasks' && <TasksEditor campaign={c} tasks={tasks} hasResults={nResults > 0} reload={load} />}

        {tab === 'thr' && (
          <form className="stack" onSubmit={e => {
            e.preventDefault(); saveCampaign({
              g2_min_percent: c.g2_min_percent, g2_min_completed: c.g2_min_completed, g3_min_percent: c.g3_min_percent,
              g3_min_level2: c.g3_min_level2, g3_min_vibe: c.g3_min_vibe, require_prompt_for_level2: c.require_prompt_for_level2,
              min_prompt_length: c.min_prompt_length, min_text_length: c.min_text_length,
            })
          }}>
            <div className="card stack">
              <h3>{t('cp_thresholds')}</h3>
              <div className="grid grid-2">
                <NumField label={t('cp_g2_percent')} v={c.g2_min_percent} min={0} max={100} on={v => setField('g2_min_percent', v)} />
                <NumField label={t('cp_g2_completed')} v={c.g2_min_completed} min={0} max={50} on={v => setField('g2_min_completed', v)} />
                <NumField label={t('cp_g3_percent')} v={c.g3_min_percent} min={0} max={100} on={v => setField('g3_min_percent', v)} />
                <NumField label={t('cp_g3_level2')} v={c.g3_min_level2} min={0} max={50} on={v => setField('g3_min_level2', v)} />
                <NumField label={t('cp_g3_vibe')} v={c.g3_min_vibe} min={0} max={2} on={v => setField('g3_min_vibe', v)} />
              </div>
              <div className="alert info small">{t('cp_thr_note')}</div>
            </div>
            <div className="card stack">
              <h3>{t('cp_criteria')}</h3>
              <p className="small muted">{t('cp_scoring_rules')}</p>
              <label className="checkbox"><input type="checkbox" checked={c.require_prompt_for_level2} onChange={e => setField('require_prompt_for_level2', e.target.checked)} /> {t('cp_req_prompt')}</label>
              <div className="grid grid-2">
                <NumField label={t('cp_min_prompt')} v={c.min_prompt_length} min={0} max={2000} on={v => setField('min_prompt_length', v)} />
                <NumField label={t('cp_min_text')} v={c.min_text_length} min={0} max={5000} on={v => setField('min_text_length', v)} />
              </div>
            </div>
            <div className="row"><button className="btn primary big">{t('save')}</button>
              <button type="button" className="btn big" onClick={recalc}>{t('cp_recalc')}</button></div>
          </form>
        )}
      </div>
    </>
  )
}

function NumField({ label, v, on, min, max }: { label: string; v: number; on: (v: number) => void; min: number; max: number }) {
  return <label className="field"><span>{label}</span><input type="number" min={min} max={max} required value={v} onChange={e => on(Number(e.target.value))} /></label>
}

function TasksEditor({ campaign, tasks, hasResults, reload }: { campaign: Campaign; tasks: Task[]; hasResults: boolean; reload: () => void }) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string | boolean | number>>({})
  const [err, setErr] = useState<string | null>(null)

  const startEdit = (tk: Task) => {
    setErr(null); setOpen(tk.id)
    setDraft({
      title_kk: tk.title_kk, title_ru: tk.title_ru, instruction_kk: tk.instruction_kk, instruction_ru: tk.instruction_ru,
      tool_options: tk.tool_options.join(', '), allow_text: tk.allow_text, prompt_mode: tk.prompt_mode,
      process_kk: tk.process_kk.join('\n'), process_ru: tk.process_ru.join('\n'), extra_type: tk.extra_type,
      extra_question_kk: tk.extra_question_kk || '', extra_question_ru: tk.extra_question_ru || '',
      extra_options_kk: tk.extra_options_kk.join('\n'), extra_options_ru: tk.extra_options_ru.join('\n'), kind: tk.kind,
    })
  }
  const save = async (tk: Task) => {
    setErr(null)
    const pk = lines(String(draft.process_kk)), pr = lines(String(draft.process_ru))
    if (pk.length !== 3 || pr.length !== 3) { setErr('0 / 1 / 2: 3 lines'); return }
    const { error } = await supabase.from('tasks').update({
      title_kk: draft.title_kk, title_ru: draft.title_ru, instruction_kk: draft.instruction_kk, instruction_ru: draft.instruction_ru,
      tool_options: String(draft.tool_options).split(',').map(x => x.trim()).filter(Boolean), allow_text: draft.allow_text,
      prompt_mode: draft.prompt_mode, process_kk: pk, process_ru: pr, extra_type: draft.extra_type, kind: draft.kind,
      extra_question_kk: String(draft.extra_question_kk) || null, extra_question_ru: String(draft.extra_question_ru) || null,
      extra_options_kk: lines(String(draft.extra_options_kk)), extra_options_ru: lines(String(draft.extra_options_ru)),
    }).eq('id', tk.id)
    if (error) { setErr(error.message); return }
    toast(t('saved')); setOpen(null); reload()
  }
  const toggle = async (tk: Task) => { await supabase.from('tasks').update({ enabled: !tk.enabled }).eq('id', tk.id); reload() }
  const move = async (i: number, dir: -1 | 1) => {
    const a = tasks[i], b = tasks[i + dir]; if (!a || !b) return
    await supabase.from('tasks').update({ position: b.position }).eq('id', a.id)
    await supabase.from('tasks').update({ position: a.position }).eq('id', b.id)
    reload()
  }
  const del = async (tk: Task) => {
    if (hasResults) { toast(t('tk_locked')); return }
    if (!confirm(t('confirm_delete'))) return
    await supabase.from('tasks').delete().eq('id', tk.id); reload()
  }
  const add = async () => {
    const key = prompt(t('tk_key'))?.trim().toLowerCase()
    if (!key) return
    if (!/^[a-z0-9_]{2,40}$/.test(key)) { toast(t('tk_key')); return }
    const base = tasks.find(x => x.key === 'infographic') || tasks[0]
    const { error } = await supabase.from('tasks').insert({
      campaign_id: campaign.id, key, kind: 'standard', position: Math.max(0, ...tasks.map(x => x.position)) + 1,
      title_kk: key, title_ru: key, instruction_kk: '', instruction_ru: '', tool_options: base?.tool_options || ['ChatGPT', 'Gemini', 'Claude'],
      process_kk: base?.process_kk || ['0', '1', '2'], process_ru: base?.process_ru || ['0', '1', '2'],
    })
    if (error) toast(error.message); else reload()
  }

  return (
    <div className="stack">
      {hasResults && <div className="alert warn small">{t('tk_locked')}</div>}
      {tasks.map((tk, i) => (
        <div key={tk.id} className={'task-edit' + (tk.enabled ? '' : ' off')}>
          <div className="row">
            <b>{i + 1}. {pick(tk as unknown as Record<string, unknown>, 'title', lang)}</b>
            <span className="badge">{tk.kind === 'vibe' ? t('tk_kind_vibe') : t('tk_kind_standard')}</span>
            <span className="small muted mono">{tk.key}</span>
            <div className="spacer" />
            <label className="checkbox small"><input type="checkbox" checked={tk.enabled} onChange={() => toggle(tk)} /> {t('tk_enabled')}</label>
            <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('tk_up')}>↑</button>
            <button className="btn sm" onClick={() => move(i, 1)} disabled={i === tasks.length - 1} aria-label={t('tk_down')}>↓</button>
            <button className="btn sm" onClick={() => (open === tk.id ? setOpen(null) : startEdit(tk))}>{t('edit')}</button>
            <button className="btn sm danger" onClick={() => del(tk)}>{t('delete')}</button>
          </div>
          {open === tk.id && (
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="grid grid-2">
                <TF label={t('tk_title_kk')} k="title_kk" d={draft} set={setDraft} />
                <TF label={t('tk_title_ru')} k="title_ru" d={draft} set={setDraft} />
                <TF label={t('tk_instr_kk')} k="instruction_kk" d={draft} set={setDraft} area />
                <TF label={t('tk_instr_ru')} k="instruction_ru" d={draft} set={setDraft} area />
              </div>
              <TF label={t('tk_tools')} k="tool_options" d={draft} set={setDraft} />
              <div className="grid grid-3">
                <label className="field"><span>{t('tk_kind')}</span><select value={String(draft.kind)} onChange={e => setDraft({ ...draft, kind: e.target.value })}>
                  <option value="standard">{t('tk_kind_standard')}</option><option value="vibe">{t('tk_kind_vibe')}</option></select></label>
                <label className="field"><span>{t('tk_prompt_mode')}</span><select value={String(draft.prompt_mode)} onChange={e => setDraft({ ...draft, prompt_mode: e.target.value })}>
                  <option value="none">{t('tk_prompt_none')}</option><option value="optional">{t('tk_prompt_optional')}</option><option value="required">{t('tk_prompt_required')}</option></select></label>
                <label className="checkbox" style={{ alignSelf: 'end', minHeight: 46 }}><input type="checkbox" checked={Boolean(draft.allow_text)} onChange={e => setDraft({ ...draft, allow_text: e.target.checked })} /> {t('tk_allow_text')}</label>
              </div>
              <div className="grid grid-2">
                <TF label={t('tk_process_kk')} k="process_kk" d={draft} set={setDraft} area />
                <TF label={t('tk_process_ru')} k="process_ru" d={draft} set={setDraft} area />
              </div>
              <label className="field"><span>{t('tk_extra_type')}</span><select value={String(draft.extra_type)} onChange={e => setDraft({ ...draft, extra_type: e.target.value })}>
                <option value="none">{t('tk_extra_none')}</option><option value="multi">{t('tk_extra_multi')}</option><option value="single">{t('tk_extra_single')}</option></select></label>
              {draft.extra_type !== 'none' && (
                <div className="grid grid-2">
                  <TF label={t('tk_extra_q_kk')} k="extra_question_kk" d={draft} set={setDraft} />
                  <TF label={t('tk_extra_q_ru')} k="extra_question_ru" d={draft} set={setDraft} />
                  <TF label={t('tk_extra_o_kk')} k="extra_options_kk" d={draft} set={setDraft} area />
                  <TF label={t('tk_extra_o_ru')} k="extra_options_ru" d={draft} set={setDraft} area />
                </div>
              )}
              <ErrorBox msg={err} />
              <div className="row"><button className="btn primary" onClick={() => save(tk)}>{t('save')}</button><button className="btn" onClick={() => setOpen(null)}>{t('cancel')}</button></div>
            </div>
          )}
        </div>
      ))}
      <div><button className="btn" onClick={add}>+ {t('tk_add')}</button></div>
    </div>
  )
}

function TF({ label, k, d, set, area }: { label: string; k: string; d: Record<string, string | boolean | number>; set: (v: Record<string, string | boolean | number>) => void; area?: boolean }) {
  return (
    <label className="field"><span>{label}</span>
      {area ? <textarea value={String(d[k] ?? '')} onChange={e => set({ ...d, [k]: e.target.value })} />
        : <input type="text" value={String(d[k] ?? '')} onChange={e => set({ ...d, [k]: e.target.value })} />}
    </label>
  )
}
