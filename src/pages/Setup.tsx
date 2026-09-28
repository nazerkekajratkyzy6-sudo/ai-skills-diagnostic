import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n, type TKey } from '../i18n'
import { Topbar, ErrorBox, Loading } from '../components'
import { adminApi } from '../lib/supabase'

export default function Setup() {
  const { t } = useI18n()
  const [status, setStatus] = useState<{ needed: boolean; secret_required: boolean } | null>(null)
  const [statusErr, setStatusErr] = useState<string | null>(null)
  const [f, setF] = useState({ secret: '', login: '', password: '', full_name: '' })
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    adminApi<{ needed: boolean; secret_required: boolean }>('setup_status').then(setStatus).catch(e => setStatusErr(String(e.message || e)))
  }, [])

  const tr = (code: string) => (['setup_exists', 'setup_bad_secret', 'err_login_format', 'err_password_short', 'err_login_exists'].includes(code) ? t(code as TKey) : t('err_api', { msg: code }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true)
    try { await adminApi('bootstrap', f); setDone(true) } catch (e2) { setErr(tr((e2 as Error).message)) }
    setBusy(false)
  }

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 520 }}>
        <div className="card stack" style={{ marginTop: 24 }}>
          <h1>{t('setup_title')}</h1>
          <p className="muted">{t('setup_text')}</p>
          {statusErr && <div className="alert error">{t('err_api', { msg: statusErr })}</div>}
          {!status && !statusErr && <Loading />}
          {status && !status.needed && !done && <div className="alert info">{t('setup_exists')} <Link to="/login">{t('login_btn')}</Link></div>}
          {done && <div className="alert ok">{t('setup_done')} <Link to="/login">{t('login_btn')}</Link></div>}
          {status?.needed && !done && (
            <form className="stack" onSubmit={submit}>
              {status.secret_required && <label className="field"><span>{t('setup_secret')}</span>
                <input type="password" value={f.secret} onChange={e => setF({ ...f, secret: e.target.value })} required /></label>}
              <label className="field"><span>{t('setup_full_name')}</span>
                <input type="text" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></label>
              <label className="field"><span>{t('sc_admin_login')}</span>
                <input type="text" autoCapitalize="none" value={f.login} onChange={e => setF({ ...f, login: e.target.value })} required placeholder="admin" /></label>
              <label className="field"><span>{t('sc_admin_password')}</span>
                <input type="password" autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required minLength={8} /></label>
              <ErrorBox msg={err} />
              <button className="btn primary big block" disabled={busy}>{t('setup_btn')}</button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
