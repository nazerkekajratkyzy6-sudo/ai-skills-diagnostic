import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { AdminHead, useAdmin } from './AdminLayout'
import { ErrorBox, Modal } from '../components'
import { supabase } from '../lib/supabase'
import { useSchools } from '../lib/data'
import { fmtDate } from '../lib/util'

export default function Schools() {
  const { t } = useI18n()
  const { isSuper, profile } = useAdmin()
  const nav = useNavigate()
  const { schools } = useSchools()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: '', region: '', city: '' })
  const [err, setErr] = useState<string | null>(null)

  if (!isSuper) return <Navigate to={`/admin/schools/${profile.school_id}`} replace />

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    const { data, error } = await supabase.from('schools')
      .insert({ name: f.name.trim(), region: f.region.trim() || null, city: f.city.trim() || null }).select('id').single()
    if (error) { setErr(error.message); return }
    nav(`/admin/schools/${data.id}`)
  }

  const list = schools.filter(s => !q || `${s.name} ${s.region} ${s.city} ${s.code}`.toLowerCase().includes(q.toLowerCase()))
  const regions = Array.from(new Set(schools.map(s => s.region).filter(Boolean))) as string[]

  return (
    <>
      <AdminHead title={t('nav_schools')}>
        <button className="btn primary" onClick={() => setAdding(true)}>+ {t('sc_add')}</button>
      </AdminHead>
      <div className="admin-body stack">
        <input type="text" placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 360 }} />
        {schools.length === 0 ? <div className="card"><p className="muted">{t('sc_none')}</p></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('sc_name')}</th><th>{t('sc_region')}</th><th>{t('sc_city')}</th><th>{t('sc_code')}</th><th>{t('sc_status')}</th><th>{t('sc_created')}</th></tr></thead>
              <tbody>
                {list.map(s => (
                  <tr key={s.id} className="clickable" onClick={() => nav(`/admin/schools/${s.id}`)}>
                    <td><Link to={`/admin/schools/${s.id}`} onClick={e => e.stopPropagation()}>{s.name}</Link> {s.is_demo && <span className="badge demo">{t('demo_badge')}</span>}</td>
                    <td>{s.region || '—'}</td><td>{s.city || '—'}</td><td className="mono">{s.code}</td>
                    <td>
                      <span className={'badge ' + (s.status === 'active' ? 'ok' : 'off')}>{t(s.status === 'active' ? 'sc_active' : 'sc_inactive')}</span>{' '}
                      {!s.diagnostic_open && <span className="badge off">{t('sc_diag_closed')}</span>}
                    </td>
                    <td className="nowrap">{fmtDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adding && (
        <Modal title={t('sc_add')} onClose={() => setAdding(false)}>
          <form className="stack" onSubmit={create}>
            <label className="field"><span>{t('sc_name')}</span><input type="text" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
            <label className="field"><span>{t('sc_region')}</span><input type="text" list="regions" value={f.region} onChange={e => setF({ ...f, region: e.target.value })} />
              <datalist id="regions">{regions.map(r => <option key={r} value={r} />)}</datalist></label>
            <label className="field"><span>{t('sc_city')}</span><input type="text" value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></label>
            <ErrorBox msg={err} />
            <button className="btn primary big">{t('create')}</button>
          </form>
        </Modal>
      )}
    </>
  )
}
