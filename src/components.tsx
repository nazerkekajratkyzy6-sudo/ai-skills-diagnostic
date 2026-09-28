import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LangSwitch, useI18n } from './i18n'
import { copyText } from './lib/util'

export function Logo() {
  return <img src="/favicon.svg" alt="" width={30} height={30} />
}

export function Topbar({ right }: { right?: ReactNode }) {
  const { t } = useI18n()
  return (
    <header className="topbar">
      <Link to="/" className="brand"><Logo /><span>{t('app_name')}</span></Link>
      <div className="spacer" />
      {right}
      <LangSwitch compact />
    </header>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between"><h2>{title}</h2><button className="btn sm" onClick={onClose} aria-label="close">✕</button></div>
        {children}
      </div>
    </div>
  )
}

let toastSetter: ((s: string | null) => void) | null = null
export function toast(msg: string) { toastSetter?.(msg) }
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { toastSetter = setMsg; return () => { toastSetter = null } }, [])
  useEffect(() => { if (!msg) return; const id = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(id) }, [msg])
  return msg ? <div className="toast" role="status">{msg}</div> : null
}

export function CopyBox({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n()
  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="copybox">
        <input type="text" readOnly value={value} onFocus={e => e.currentTarget.select()} aria-label={label || value} />
        <button type="button" className="btn" onClick={async () => { if (await copyText(value)) toast(t('copied')) }}>{t('copy')}</button>
      </div>
    </div>
  )
}

export function GroupBadge({ g }: { g: number }) {
  const { t } = useI18n()
  return <span className={`badge g${g}`}>{t(`group_short_${g}` as 'group_short_1')}</span>
}

export function ScoreBox({ s }: { s: number | null | undefined }) {
  if (s == null) return <span className="muted">—</span>
  return <span className={`score s${s}`}>{s}</span>
}

export function Loading() {
  const { t } = useI18n()
  return <div className="muted" style={{ padding: 20 }}>{t('loading')}</div>
}

export function ErrorBox({ msg }: { msg: string | null }) {
  return msg ? <div className="alert error" role="alert">{msg}</div> : null
}
