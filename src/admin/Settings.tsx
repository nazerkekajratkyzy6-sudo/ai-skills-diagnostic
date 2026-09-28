import { useCallback, useEffect, useState } from 'react'
import { useI18n, type TKey } from '../i18n'
import { AdminHead, useAdmin } from './AdminLayout'
import { ErrorBox, Modal, toast } from '../components'
import { adminApi, errCode, supabase } from '../lib/supabase'
import { randomPassword } from '../lib/util'
import type { Profile } from '../lib/types'

export default function Settings() {
  const { t } = useI18n()
  const { isSuper, profile } = useAdmin()
  const [pw, setPw] = useState('')
  const [pwErr, setPwErr] = useState<string | null>(null)
  const [supers, setSupers] = useState<Profile[]>([])
  const [adding, setAdding] = useState(false)
  const [af, setAf] = useState({ login: '', password: '', full_name: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!isSuper) return
    const { data } = await supabase.from('profiles').select('*').eq('role', 'super_admin').order('created_at')
    setSupers((data as Profile[]) || [])
  }, [isSuper])
  useEffect(() => { load() }, [load])

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setPwErr(null)
    if (pw.length < 8) { setPwErr(t('err_password_short')); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setPwErr(error.message); else { setPw(''); toast(t('set_password_changed')) }
  }
  const demo = async (fn: 'seed_demo_data' | 'delete_demo_data') => {
    setBusy(true)
    const { error } = await supabase.rpc(fn)
    setBusy(false)
    if (error) toast(errCode(error) === 'demo_exists' ? t('set_demo_exists') : error.message)
    else toast(t(fn === 'seed_demo_data' ? 'set_demo_created' : 'set_demo_deleted'))
  }
  const addSuper = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    try { await adminApi('create_admin', { role: 'super_admin', ...af }); setAdding(false); toast(t('saved')); load() }
    catch (e2) { const m = (e2 as Error).message; setErr(['err_login_format', 'err_password_short', 'err_login_exists'].includes(m) ? t(m as TKey) : t('err_api', { msg: m })) }
  }
  const setActive = async (p: Profile) => {
    try { await adminApi('set_active', { user_id: p.id, active: !p.is_active }); load() } catch (e) { toast((e as Error).message) }
  }

  return (
    <>
      <AdminHead title={t('nav_settings')} />
      <div className="admin-body stack" style={{ maxWidth: 820 }}>
        <form className="card stack" onSubmit={changePw}>
          <h3>{t('set_password')}</h3>
          <div className="small muted">{profile.full_name} · {profile.login}</div>
          <label className="field"><span>{t('set_new_password')}</span><input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
          <ErrorBox msg={pwErr} />
          <div><button className="btn primary">{t('save')}</button></div>
        </form>

        {isSuper && (<>
          <div className="card stack">
            <h3>{t('set_demo')}</h3>
            <p className="small muted">{t('set_demo_text')}</p>
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => demo('seed_demo_data')}>{t('set_demo_create')}</button>
              <button className="btn danger" disabled={busy} onClick={() => { if (confirm(t('confirm_delete'))) demo('delete_demo_data') }}>{t('set_demo_delete')}</button>
            </div>
          </div>
          <div className="card stack">
            <div className="row between"><h3 style={{ margin: 0 }}>{t('set_admins')}</h3>
              <button className="btn sm" onClick={() => { setErr(null); setAf({ login: '', password: randomPassword(), full_name: '' }); setAdding(true) }}>+ {t('set_add_super')}</button></div>
            <div className="table-wrap"><table>
              <thead><tr><th>{t('sc_admin_name')}</th><th>{t('sc_admin_login')}</th><th>{t('sc_status')}</th><th /></tr></thead>
              <tbody>{supers.map(s => (
                <tr key={s.id}><td>{s.full_name || '—'}</td><td className="mono">{s.login}</td>
                  <td><span className={'badge ' + (s.is_active ? 'ok' : 'off')}>{s.is_active ? t('sc_active') : t('sc_admin_disabled')}</span></td>
                  <td>{s.id !== profile.id && <button className="btn sm" onClick={() => setActive(s)}>{t(s.is_active ? 'sc_admin_disable' : 'sc_admin_enable')}</button>}</td></tr>
              ))}</tbody></table></div>
          </div>
          <div className="card"><h3>{t('set_backup')}</h3><p className="small muted">{t('set_backup_text')}</p></div>
        </>)}
      </div>
      {adding && (
        <Modal title={t('set_add_super')} onClose={() => setAdding(false)}>
          <form className="stack" onSubmit={addSuper}>
            <label className="field"><span>{t('sc_admin_name')}</span><input type="text" value={af.full_name} onChange={e => setAf({ ...af, full_name: e.target.value })} /></label>
            <label className="field"><span>{t('sc_admin_login')}</span><input type="text" required autoCapitalize="none" value={af.login} onChange={e => setAf({ ...af, login: e.target.value })} /></label>
            <label className="field"><span>{t('sc_admin_password')}</span><input type="text" required minLength={8} value={af.password} onChange={e => setAf({ ...af, password: e.target.value })} /></label>
            <ErrorBox msg={err} />
            <button className="btn primary">{t('create')}</button>
          </form>
        </Modal>
      )}
    </>
  )
}
