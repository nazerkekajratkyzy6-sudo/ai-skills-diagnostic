import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LangSwitch, useI18n } from '../i18n'
import { Logo } from '../components'

export default function Home() {
  const { t } = useI18n()
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const go = (e: React.FormEvent) => {
    e.preventDefault()
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!c) return
    nav(c.length >= 8 ? `/p/${c}` : `/d/${c}`)
  }
  return (
    <div className="page">
      <div className="hero">
        <LangSwitch />
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Logo /></div>
        <h1>{t('home_title')}</h1>
        <p>{t('home_sub')}</p>
      </div>
      <form className="card stack" onSubmit={go}>
        <label className="field">
          <span>{t('home_code_label')}</span>
          <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder={t('home_code_ph')}
            autoCapitalize="characters" autoComplete="off" className="mono" />
        </label>
        <button className="btn primary big block" type="submit" disabled={!code.trim()}>{t('home_go')}</button>
      </form>
      <div className="card">
        <h3>{t('home_how')}</h3>
        <ol className="steps">
          <li>{t('home_step1')}</li><li>{t('home_step2')}</li><li>{t('home_step3')}</li>
        </ol>
      </div>
      <p className="center" style={{ marginTop: 24 }}><Link to="/login">{t('home_admin')}</Link></p>
    </div>
  )
}
