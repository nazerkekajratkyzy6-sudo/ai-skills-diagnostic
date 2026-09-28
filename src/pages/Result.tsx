import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pick, useI18n, type TKey } from '../i18n'
import { Topbar, Loading, CopyBox } from '../components'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/util'

interface ResultInfo {
  full_name: string; school: string; finished_at: string; language: string; group_no: 1 | 2 | 3
  campaign_kk: string; campaign_ru: string; completed_tasks: { title_kk: string; title_ru: string; done: boolean }[]
}

export default function Result() {
  const { t, lang } = useI18n()
  const { token } = useParams()
  const [r, setR] = useState<ResultInfo | null | undefined>(undefined)

  useEffect(() => {
    const valid = /^[0-9a-f-]{36}$/i.test(token || '')
    if (!valid) { setR(null); return }
    supabase.rpc('get_result', { p_token: token }).then(({ data }) => setR((data as ResultInfo) ?? null))
  }, [token])

  if (r === undefined) return (<><Topbar /><div className="page"><Loading /></div></>)
  if (r === null) return (<><Topbar /><div className="page"><div className="card" style={{ marginTop: 24 }}><div className="alert error">{t('result_not_found')}</div></div></div></>)

  const g = r.group_no
  return (
    <>
      <Topbar />
      <div className="page">
        <div className="card result-hero stack" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 44 }} aria-hidden="true">✓</div>
          <h1>{t('result_title')}</h1>
          <p className="muted">{t('result_thanks')}</p>
          <div><b>{r.full_name}</b><br /><span className="muted">{r.school} · {pick(r as unknown as Record<string, unknown>, 'campaign', lang)} · {fmtDate(r.finished_at)}</span></div>
          <hr />
          <div className="muted">{t('result_level')}:</div>
          <div className="level">{t(`level_${g}` as TKey)}</div>
          <div className={`group-card g${g}`}>
            <div className="small" style={{ opacity: .9 }}>{t('result_group')}:</div>
            <div className="gname">{t(`group_${g}` as TKey)}</div>
            <div style={{ marginTop: 6, opacity: .95 }}>{t(`group_desc_${g}` as TKey)}</div>
          </div>
        </div>
        <div className="card">
          <h3>{t('result_tasks')}</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {r.completed_tasks.map((x, i) => (
              <li key={i} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{pick(x as unknown as Record<string, unknown>, 'title', lang)}</span>
                <span className={'badge ' + (x.done ? 'ok' : '')}>{x.done ? t('review_done') : t('review_not_done')}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card stack">
          <p className="small muted">{t('result_save')}</p>
          <CopyBox value={window.location.href} />
        </div>
      </div>
    </>
  )
}
