import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pick, useI18n, type TKey } from '../i18n'
import { AdminHead, useAdmin } from './AdminLayout'
import { CopyBox, ErrorBox, Loading, Modal, toast } from '../components'
import { adminApi, supabase } from '../lib/supabase'
import { copyText, diagLink, fmtDate, personalLink, randomPassword, siteUrl } from '../lib/util'
import type { Campaign, Participant, Profile, School } from '../lib/types'

export default function SchoolDetail() {
  const { t, lang } = useI18n()
  const { id } = useParams()
  const { isSuper } = useAdmin()
  const [school, setSchool] = useState<School | null>(null)
  const [admins, setAdmins] = useState<Profile[]>([])
  const [parts, setParts] = useState<(Participant & { done: number })[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [edit, setEdit] = useState(false)
  const [ef, setEf] = useState({ name: '', region: '', city: '' })
  const [adminModal, setAdminModal] = useState(false)
  const [af, setAf] = useState({ login: '', password: '', full_name: '' })
  const [pack, setPack] = useState<string | null>(null)
  const [pwModal, setPwModal] = useState<Profile | null>(null)
  const [newPw, setNewPw] = useState('')
  const [partModal, setPartModal] = useState(false)
  const [bulk, setBulk] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const { data: s } = await supabase.from('schools').select('*').eq('id', id).maybeSingle()
    setSchool(s as School | null)
    if (!s) return
    setEf({ name: s.name, region: s.region || '', city: s.city || '' })
    if (isSuper) {
      const { data: a } = await supabase.from('profiles').select('*').eq('school_id', id).order('created_at')
      setAdmins((a as Profile[]) || [])
    }
    const { data: p } = await supabase.from('participants').select('*, submissions(count)').eq('school_id', id).order('full_name').limit(5000)
    setParts(((p as (Participant & { submissions: { count: number }[] })[]) || []).map(x => ({ ...x, done: x.submissions?.[0]?.count || 0 })))
    const { data: c } = await supabase.from('campaigns').select('*').eq('status', 'published').order('published_at', { ascending: false })
    setCampaigns(((c as Campaign[]) || []).filter(x => x.is_demo === s.is_demo))
  }, [id, isSuper])
  useEffect(() => { load() }, [load])

  if (!school) return <><AdminHead title="…" /><div className="admin-body"><Loading /></div></>

  const upd = async (patch: Partial<School>) => {
    const { error } = await supabase.from('schools').update(patch).eq('id', school.id)
    if (error) { toast(error.message); return }
    toast(t('saved')); load()
  }
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault(); await upd({ name: ef.name.trim(), region: ef.region.trim() || null, city: ef.city.trim() || null }); setEdit(false)
  }
  const newCode = async () => {
    if (!confirm(t('sc_new_code_confirm'))) return
    const { error } = await supabase.rpc('regenerate_school_code', { p_school: school.id })
    if (error) toast(error.message); else { toast(t('saved')); load() }
  }
  const apiErr = (e: unknown) => {
    const m = (e as Error).message
    return ['err_login_format', 'err_password_short', 'err_login_exists'].includes(m) ? t(m as TKey) : t('err_api', { msg: m })
  }
  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    try {
      const r = await adminApi<{ login: string }>('create_admin', { role: 'school_admin', school_id: school.id, ...af })
      setAdminModal(false)
      setPack(t('sc_access_text', { school: school.name, login_url: `${siteUrl()}/login`, login: r.login, password: af.password, link: diagLink(school.code), code: school.code }))
      setAf({ login: '', password: '', full_name: '' }); load()
    } catch (e2) { setErr(apiErr(e2)) }
  }
  const setActive = async (p: Profile, active: boolean) => {
    try { await adminApi('set_active', { user_id: p.id, active }); toast(t('saved')); load() } catch (e) { toast(apiErr(e)) }
  }
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    try { await adminApi('set_password', { user_id: pwModal!.id, password: newPw }); setPwModal(null); toast(t('saved')) } catch (e2) { setErr(apiErr(e2)) }
  }
  const addParticipants = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    const rows = bulk.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [name, pos] = l.split(/[;\t]/).map(x => x?.trim())
      return { school_id: school.id, full_name: name.replace(/\s+/g, ' '), position: pos || null }
    }).filter(r => r.full_name.length >= 3)
    if (!rows.length) return
    const { error } = await supabase.from('participants').insert(rows)
    if (error) { setErr(error.message); return }
    toast(t('pt_added', { n: rows.length })); setBulk(''); setPartModal(false); load()
  }
  const copyAllLinks = async () => {
    const text = parts.map(p => `${p.full_name}\t${personalLink(p.personal_code)}`).join('\n')
    if (await copyText(text)) toast(t('copied'))
  }

  const plist = parts.filter(p => !q || p.full_name.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <AdminHead title={school.name}>
        {school.is_demo && <span className="badge demo">{t('demo_badge')}</span>}
        <span className={'badge ' + (school.status === 'active' ? 'ok' : 'off')}>{t(school.status === 'active' ? 'sc_active' : 'sc_inactive')}</span>
      </AdminHead>
      <div className="admin-body stack">
        <div className="grid grid-2">
          <div className="card stack">
            <div className="row between"><h3 style={{ margin: 0 }}>{t('sc_link')}</h3>
              <span className={'badge ' + (school.diagnostic_open ? 'ok' : 'off')}>{t(school.diagnostic_open ? 'sc_diag_open' : 'sc_diag_closed')}</span></div>
            <p className="hint" style={{ margin: 0 }}>{t('sc_link_hint')}</p>
            <CopyBox value={diagLink(school.code)} />
            <div className="row"><span className="muted">{t('sc_code')}:</span> <b className="mono" style={{ fontSize: '1.3rem' }}>{school.code}</b></div>
            {campaigns.length > 1 && (
              <div className="small">
                <p className="muted" style={{ marginBottom: 6 }}>{t('cp_link_note')}</p>
                {campaigns.map(c => <CopyBox key={c.id} label={pick(c as unknown as Record<string, unknown>, 'name', lang)} value={diagLink(school.code, c.code)} />)}
              </div>
            )}
            <div className="row">
              <a className="btn sm" href={diagLink(school.code)} target="_blank" rel="noreferrer">{t('open')} ↗</a>
              {isSuper && <button className="btn sm" onClick={() => upd({ diagnostic_open: !school.diagnostic_open })}>{t(school.diagnostic_open ? 'sc_close_diag' : 'sc_open_diag')}</button>}
              {isSuper && <button className="btn sm" onClick={newCode}>{t('sc_new_code')}</button>}
            </div>
          </div>
          <div className="card stack">
            <h3>{t('sc_details')}</h3>
            <div className="small"><b>{t('sc_region')}:</b> {school.region || '—'}<br /><b>{t('sc_city')}:</b> {school.city || '—'}<br />
              <b>{t('sc_created')}:</b> {fmtDate(school.created_at)}</div>
            <div className="row">
              <Link className="btn sm" to={`/admin/results?school=${school.id}`}>{t('nav_results')} →</Link>
              {isSuper && <button className="btn sm" onClick={() => setEdit(true)}>{t('sc_edit')}</button>}
              {isSuper && <button className={'btn sm ' + (school.status === 'active' ? 'danger' : '')}
                onClick={() => upd({ status: school.status === 'active' ? 'inactive' : 'active' })}>{t(school.status === 'active' ? 'sc_deactivate' : 'sc_activate')}</button>}
            </div>
          </div>
        </div>

        {isSuper && (
          <div className="card stack">
            <div className="row between"><h3 style={{ margin: 0 }}>{t('sc_admins')}</h3>
              <button className="btn sm primary" onClick={() => { setErr(null); setAf({ login: '', password: randomPassword(), full_name: '' }); setAdminModal(true) }}>+ {t('sc_admin_add')}</button></div>
            {pack && (
              <div className="alert ok stack">
                <b>{t('sc_admin_created')}</b>
                <pre className="pack">{pack}</pre>
                <div className="row"><button className="btn sm" onClick={async () => { if (await copyText(pack)) toast(t('copied')) }}>{t('copy')}</button>
                  <button className="btn sm" onClick={() => setPack(null)}>{t('close')}</button></div>
              </div>
            )}
            {admins.length === 0 ? <p className="muted">—</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>{t('sc_admin_name')}</th><th>{t('sc_admin_login')}</th><th>{t('sc_status')}</th><th>{t('actions')}</th></tr></thead>
                <tbody>{admins.map(a => (
                  <tr key={a.id}>
                    <td>{a.full_name || '—'}</td><td className="mono">{a.login}</td>
                    <td><span className={'badge ' + (a.is_active ? 'ok' : 'off')}>{a.is_active ? t('sc_active') : t('sc_admin_disabled')}</span></td>
                    <td className="row">
                      <button className="btn sm" onClick={() => { setErr(null); setNewPw(randomPassword()); setPwModal(a) }}>{t('sc_admin_set_password')}</button>
                      <button className={'btn sm ' + (a.is_active ? 'danger' : '')} onClick={() => setActive(a, !a.is_active)}>{t(a.is_active ? 'sc_admin_disable' : 'sc_admin_enable')}</button>
                    </td>
                  </tr>))}
                </tbody></table></div>
            )}
          </div>
        )}

        <div className="card stack">
          <div className="row between"><h3 style={{ margin: 0 }}>{t('sc_participants')} ({parts.length})</h3>
            <div className="row">
              {parts.length > 0 && <button className="btn sm" onClick={copyAllLinks}>{t('copy')}: {t('sc_personal_links')}</button>}
              {!school.is_demo && <button className="btn sm primary" onClick={() => { setErr(null); setPartModal(true) }}>+ {t('pt_add')}</button>}
            </div></div>
          {parts.length > 8 && <input type="text" placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 320 }} />}
          {parts.length === 0 ? <p className="muted">{t('pt_none')}</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>{t('pt_name')}</th><th>{t('pt_position')}</th><th>{t('pt_code')}</th><th className="num">{t('cp_results_count')}</th><th>{t('pt_link')}</th></tr></thead>
              <tbody>{plist.map(p => (
                <tr key={p.id}>
                  <td><Link to={`/admin/participants/${p.id}`}>{p.full_name}</Link></td><td>{p.position || '—'}</td>
                  <td className="mono">{p.personal_code}</td><td className="num">{p.done}</td>
                  <td><button className="btn sm" onClick={async () => { if (await copyText(personalLink(p.personal_code))) toast(t('copied')) }}>{t('copy')}</button></td>
                </tr>))}
              </tbody></table></div>
          )}
        </div>
      </div>

      {edit && (
        <Modal title={t('sc_edit')} onClose={() => setEdit(false)}>
          <form className="stack" onSubmit={saveEdit}>
            <label className="field"><span>{t('sc_name')}</span><input type="text" required value={ef.name} onChange={e => setEf({ ...ef, name: e.target.value })} /></label>
            <label className="field"><span>{t('sc_region')}</span><input type="text" value={ef.region} onChange={e => setEf({ ...ef, region: e.target.value })} /></label>
            <label className="field"><span>{t('sc_city')}</span><input type="text" value={ef.city} onChange={e => setEf({ ...ef, city: e.target.value })} /></label>
            <button className="btn primary">{t('save')}</button>
          </form>
        </Modal>
      )}
      {adminModal && (
        <Modal title={t('sc_admin_add')} onClose={() => setAdminModal(false)}>
          <form className="stack" onSubmit={createAdmin}>
            <label className="field"><span>{t('sc_admin_name')}</span><input type="text" value={af.full_name} onChange={e => setAf({ ...af, full_name: e.target.value })} /></label>
            <label className="field"><span>{t('sc_admin_login')}</span><input type="text" autoCapitalize="none" required value={af.login} placeholder="school12" onChange={e => setAf({ ...af, login: e.target.value })} /></label>
            <label className="field"><span>{t('sc_admin_password')}</span><input type="text" required minLength={8} value={af.password} onChange={e => setAf({ ...af, password: e.target.value })} /></label>
            <ErrorBox msg={err} />
            <button className="btn primary">{t('create')}</button>
          </form>
        </Modal>
      )}
      {pwModal && (
        <Modal title={`${t('sc_admin_set_password')}: ${pwModal.login}`} onClose={() => setPwModal(null)}>
          <form className="stack" onSubmit={changePw}>
            <label className="field"><span>{t('set_new_password')}</span><input type="text" required minLength={8} value={newPw} onChange={e => setNewPw(e.target.value)} /></label>
            <ErrorBox msg={err} />
            <button className="btn primary">{t('save')}</button>
          </form>
        </Modal>
      )}
      {partModal && (
        <Modal title={t('pt_bulk')} onClose={() => setPartModal(false)}>
          <form className="stack" onSubmit={addParticipants}>
            <p className="hint">{t('pt_bulk_hint')}</p>
            <textarea rows={8} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'Сейітова Айгерім Болатқызы; мұғалім\nИванова Анна Петровна; учитель'} />
            <ErrorBox msg={err} />
            <button className="btn primary">{t('add')}</button>
          </form>
        </Modal>
      )}
    </>
  )
}
