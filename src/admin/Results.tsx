import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { pick, useI18n, type TKey } from '../i18n'
import { AdminHead, useAdmin } from './AdminLayout'
import FiltersBar from './Filters'
import { GroupBadge, Loading, toast } from '../components'
import { supabase } from '../lib/supabase'
import { useCampaigns, useSchools } from '../lib/data'
import { applyFilters, buildExportRows, downloadCsv, downloadXlsx, SUBMISSION_SELECT } from '../lib/export'
import { fmtDate, fmtDuration } from '../lib/util'
import type { Filters, Submission } from '../lib/types'

const PAGE = 50

export default function Results() {
  const { t, lang } = useI18n()
  const { isSuper } = useAdmin()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { schools } = useSchools()
  const { campaigns } = useCampaigns()
  const [f, setF] = useState<Filters>(() => ({ school_id: sp.get('school') || '', campaign_id: sp.get('campaign') || '', group_no: sp.get('group') || '' }))
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<Submission[] | null>(null)
  const [count, setCount] = useState(0)
  const [exporting, setExporting] = useState(false)

  useEffect(() => { setPage(0) }, [f, search])
  useEffect(() => {
    let alive = true
    applyFilters(supabase.from('submissions').select(SUBMISSION_SELECT, { count: 'exact' }), f, search)
      .order('finished_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
      .then(({ data, count: c, error }: { data: Submission[] | null; count: number | null; error: { message: string } | null }) => {
        if (!alive) return
        if (error) { toast(error.message); setRows([]); return }
        setRows(data || []); setCount(c || 0)
      })
    return () => { alive = false }
  }, [f, search, page])

  const doExport = async (kind: 'xlsx' | 'csv') => {
    setExporting(true)
    try {
      const { header, rows: data } = await buildExportRows(f, lang, {
        name: t('rs_name'), school: t('rs_school'), region: t('sc_region'), position: t('pt_position'), campaign: t('rs_campaign'),
        date: t('rs_date'), language: t('rs_language'), time: `${t('rs_time')} (min)`, group: t('rs_group'), percent: `${t('rs_percent')} %`,
        vibe_self: t('rs_vibe_self'), tools: t('rs_tools'), tools_count: `${t('rs_tools')} (${t('st_count')})`, links: t('rs_links'),
        groupName: g => t(`group_${g}` as TKey), chosen: t('rs_chosen'), pl_master: t('rs_pl_master'), pl_know: t('rs_pl_know'),
        pl_other: t('rs_pl_other'), files: t('rs_files'), langName: l => (l === 'ru' ? t('rs_lang_ru') : t('rs_lang_kk')),
      })
      const stamp = new Date().toISOString().slice(0, 10)
      const suffix = f.group_no ? `_group${f.group_no}` : ''
      if (kind === 'csv') downloadCsv(`ai-skills-diagnostic_${stamp}${suffix}.csv`, header, data)
      else await downloadXlsx(`ai-skills-diagnostic_${stamp}${suffix}.xlsx`, header, data, t('rs_title'))
    } catch (e) { toast(t('err_api', { msg: (e as Error).message })) }
    setExporting(false)
  }

  const groupTab = (g: string) => (
    <button key={g} className={(f.group_no || '') === g ? 'on' : ''} onClick={() => setF({ ...f, group_no: g })}>
      {g ? t(`group_${g}` as TKey) : t('all')}
    </button>
  )

  return (
    <>
      <AdminHead title={t('rs_title')}>
        <button className="btn" disabled={exporting} onClick={() => doExport('xlsx')}>{exporting ? t('rs_exporting') : `⬇ ${t('rs_export_xlsx')}`}</button>
        <button className="btn" disabled={exporting} onClick={() => doExport('csv')}>⬇ {t('rs_export_csv')}</button>
      </AdminHead>
      <div className="admin-body">
        <FiltersBar value={f} onChange={setF} schools={schools} campaigns={campaigns} isSuper={isSuper} />
        <div className="tabs" aria-label={t('rs_group_lists')}>{['', '1', '2', '3'].map(groupTab)}</div>
        <div className="row" style={{ marginBottom: 12 }}>
          <input type="text" placeholder={`${t('search')}: ${t('rs_name')}`} value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 340 }} />
          <div className="spacer" /><span className="muted small">{t('total')}: <b>{count}</b></span>
        </div>
        {!rows ? <Loading /> : rows.length === 0 ? <div className="card"><p className="muted">{t('rs_none')}</p></div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('rs_name')}</th><th>{t('rs_school')}</th><th>{t('rs_campaign')}</th><th>{t('rs_date')}</th>
              <th>{t('rs_group')}</th><th className="num">{t('rs_percent')}</th><th className="num">{t('rs_time')}</th><th>{t('rs_tools')}</th></tr></thead>
            <tbody>{rows.map(s => (
              <tr key={s.id} className="clickable" onClick={() => nav(`/admin/results/${s.id}`)}>
                <td><Link to={`/admin/results/${s.id}`} onClick={e => e.stopPropagation()}>{s.full_name}</Link>
                  {s.is_demo && <> <span className="badge demo">{t('demo_badge')}</span></>}
                  {s.reviewed && <> <span className="badge ok">✓</span></>}
                  <div className="small muted">{s.position}</div></td>
                <td>{s.schools?.name}</td>
                <td className="small">{pick((s.campaigns || {}) as Record<string, unknown>, 'name', lang)}</td>
                <td className="nowrap">{fmtDate(s.finished_at)}</td>
                <td><GroupBadge g={s.group_no} /></td>
                <td className="num">{s.percent}%</td>
                <td className="num">{fmtDuration(s.duration_seconds)}</td>
                <td className="small">{(s.tools_used || []).join(', ')}</td>
              </tr>))}
            </tbody></table></div>
        )}
        {count > PAGE && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('page_prev')}</button>
            <span className="small muted">{t('shown_of', { from: page * PAGE + 1, to: Math.min(count, (page + 1) * PAGE), total: count })}</span>
            <button className="btn sm" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)}>{t('page_next')}</button>
          </div>
        )}
      </div>
    </>
  )
}
