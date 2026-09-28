import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { Topbar, ErrorBox } from '../components'
import { supabase, loginToEmail } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { t } = useI18n()
  const nav = useNavigate()
  const { profile, session, reload, loading } = useAuth()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (!loading && profile?.is_active) nav('/admin', { replace: true }) }, [profile, loading, nav])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginToEmail(login), password })
    if (error || !data.session) { setBusy(false); setErr(t('login_err') + (error ? ` (${error.message})` : '')); return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', data.session.user.id).maybeSingle()
    if (!p || !p.is_active) { await supabase.auth.signOut(); setBusy(false); setErr(p ? t('login_err') : t('login_no_profile')); return }
    await reload(); setBusy(false); nav('/admin', { replace: true })
  }

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 460 }}>
        <form className="card stack" onSubmit={submit} style={{ marginTop: 24 }}>
          <h1>{t('login_title')}</h1>
          {session && !profile && !loading && <div className="alert warn">{t('login_no_profile')}</div>}
          <label className="field"><span>{t('login_login')}</span>
            <input type="text" autoComplete="username" autoCapitalize="none" value={login} onChange={e => setLogin(e.target.value)} required /></label>
          <label className="field"><span>{t('login_password')}</span>
            <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
          <ErrorBox msg={err} />
          <button className="btn primary big block" disabled={busy}>{busy ? t('loading') : t('login_btn')}</button>
          <p className="small muted center"><Link to="/setup">{t('setup_title')}</Link></p>
        </form>
      </div>
    </>
  )
}
