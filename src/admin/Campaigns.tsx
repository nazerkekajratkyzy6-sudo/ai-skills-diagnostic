import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { pick, useI18n } from '../i18n'
import { AdminHead, useAdmin } from './AdminLayout'
import { ErrorBox, Modal } from '../components'
import { supabase } from '../lib/supabase'
import { useCampaigns } from '../lib/data'
import { fmtDate } from '../lib/util'

export function StatusBadge({ s }: { s: 'draft' | 'published' | 'closed' }) {
  const { t } = useI18n()
  return <span className={'badge ' + (s === 'published' ? 'pub' : s === 'closed' ? 'off' : 'draft')}>{t(s === 'draft' ? 'cp_draft' : s === 'published' ? 'cp_published' : 'cp_closed')}</span>
}

export default function Campaigns() {
  const { t, lang } = useI18n()
  const { isSuper } = useAdmin()
  const nav = useNavigate()
  const { campaigns } = useCampaigns()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name_kk: '', name_ru: '', topic_kk: '', topic_ru: '', copy_from: '' })
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    Promise.all(campaigns.map(c => supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id)
      .then(r => [c.id, r.count || 0] as const))).then(x => setCounts(Object.fromEntries(x)))
  }, [campaigns])

  if (!isSuper) return <Navigate to="/admin" replace />

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    const { data, error } = await supabase.rpc('create_campaign', { p: f })
    if (error) { setErr(error.message); return }
    nav(`/admin/campaigns/${data}`)
  }

  return (
    <>
      <AdminHead title={t('nav_campaigns')}>
        <button className="btn primary" onClick={() => setAdding(true)}>+ {t('cp_add')}</button>
      </AdminHead>
      <div className="admin-body">
        {campaigns.length === 0 ? <p className="muted">{t('cp_none')}</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('rs_campaign')}</th><th>{t('cp_status')}</th><th>{t('cp_schools')}</th><th className="num">{t('cp_results_count')}</th><th>{t('sc_created')}</th><th /></tr></thead>
            <tbody>{campaigns.map(c => (
              <tr key={c.id} className="clickable" onClick={() => nav(`/admin/campaigns/${c.id}`)}>
                <td><b>{pick(c as unknown as Record<string, unknown>, 'name', lang)}</b> {c.is_demo && <span className="badge demo">{t('demo_badge')}</span>}
                  <div className="small muted">{pick(c as unknown as Record<string, unknown>, 'topic', lang)}</div></td>
                <td><StatusBadge s={c.status} /></td>
                <td>{c.all_schools ? t('cp_all_schools') : t('cp_selected_schools')}</td>
                <td className="num">{counts[c.id] ?? '…'}</td>
                <td className="nowrap">{fmtDate(c.created_at)}</td>
                <td><Link to={`/admin/campaigns/${c.id}`} onClick={e => e.stopPropagation()}>{t('cp_edit')}</Link></td>
              </tr>))}
            </tbody></table></div>
        )}
      </div>
      {adding && (
        <Modal title={t('cp_add')} onClose={() => setAdding(false)}>
          <form className="stack" onSubmit={create}>
            <label className="field"><span>{t('cp_name_kk')}</span><input type="text" required value={f.name_kk} placeholder="AI Skills Diagnostic — 2026 желтоқсан" onChange={e => setF({ ...f, name_kk: e.target.value })} /></label>
            <label className="field"><span>{t('cp_name_ru')}</span><input type="text" required value={f.name_ru} placeholder="AI Skills Diagnostic — декабрь 2026" onChange={e => setF({ ...f, name_ru: e.target.value })} /></label>
            <label className="field"><span>{t('cp_topic_kk')}</span><input type="text" value={f.topic_kk} onChange={e => setF({ ...f, topic_kk: e.target.value })} /></label>
            <label className="field"><span>{t('cp_topic_ru')}</span><input type="text" value={f.topic_ru} onChange={e => setF({ ...f, topic_ru: e.target.value })} /></label>
            <label className="field"><span>{t('cp_copy_from')}</span>
              <select value={f.copy_from} onChange={e => setF({ ...f, copy_from: e.target.value })}>
                <option value="">{t('cp_copy_default')}</option>
                {campaigns.filter(c => !c.is_demo).map(c => <option key={c.id} value={c.id}>{pick(c as unknown as Record<string, unknown>, 'name', lang)}</option>)}
              </select></label>
            <ErrorBox msg={err} />
            <button className="btn primary big">{t('create')}</button>
          </form>
        </Modal>
      )}
    </>
  )
}
