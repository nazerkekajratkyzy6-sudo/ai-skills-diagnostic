import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pick, useI18n, type TKey } from '../i18n'
import { Topbar, Loading, CopyBox, GroupBadge } from '../components'
import { supabase, errCode } from '../lib/supabase'
import { fmtDate, personalLink } from '../lib/util'
import { TOOL_LINKS, cabinetLink, type CabinetInfo, type WorkStatus } from '../lib/course'

export function StatusBadge({ s }: { s: WorkStatus | null | undefined }) {
  const { t } = useI18n()
  if (s === 'accepted') return <span className="badge ok">✓ {t('st_accepted')}</span>
  if (s === 'needs_rework') return <span className="badge warn">{t('st_needs_rework')}</span>
  return <span className="badge">{t('st_new')}</span>
}

export default function Cabinet() {
  const { t, lang } = useI18n()
  const { personalCode = '' } = useParams()
  const [info, setInfo] = useState<CabinetInfo | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_cabinet', { p_personal_code: personalCode }).then(({ data, error }) => {
      if (error) setErr(errCode(error)); else setInfo(data as CabinetInfo)
    })
  }, [personalCode])

  if (err) return (<><Topbar /><div className="page"><div className="card" style={{ marginTop: 24 }}>
    <div className="alert error" role="alert">{t(('e_' + err) as TKey)}</div></div></div></>)
  if (!info) return (<><Topbar /><div className="page"><Loading /></div></>)

  const g = info.group_no
  const code = info.participant.personal_code
  const done = info.modules.filter(m => m.status === 'accepted').length
  const total = info.modules.length
  const pct = total ? Math.round(done / total * 100) : 0
  const tools = [
    { url: TOOL_LINKS.smartboard, label: t('tool_smartboard') },
    { url: TOOL_LINKS.prompt, label: t('tool_prompt') },
    { url: TOOL_LINKS.navigator, label: t('tool_navigator') },
  ].filter(x => x.url)

  return (
    <>
      <Topbar />
      <div className="page stack">
        <div className="card stack" style={{ marginTop: 16 }}>
          <div className="row between">
            <div>
              <h1 style={{ marginBottom: 4 }}>{t('cab_open')}</h1>
              <div><b>{info.participant.full_name}</b></div>
              <div className="muted small">{info.school.name}{info.participant.position ? ` · ${info.participant.position}` : ''}</div>
            </div>
            {info.school.is_demo && <span className="badge demo">DEMO</span>}
          </div>
        </div>

        {/* Деңгей / уровень */}
        {g ? (
          <div className={`group-card g${g}`}>
            <div className="small" style={{ opacity: .9 }}>{t('cab_my_level')}:</div>
            <div className="gname">{t(`group_${g}` as TKey)}</div>
            <div style={{ marginTop: 6, opacity: .95 }}>{t(`group_desc_${g}` as TKey)}</div>
          </div>
        ) : (
          <div className="card stack">
            <div className="alert info">{t('cab_no_diag')}</div>
            <Link className="btn primary big block" to={`/p/${code}`}>{t('cab_take_diag')}</Link>
          </div>
        )}

        {/* Курс */}
        {g && (
          <div className="card stack">
            <div className="row between">
              <h2 style={{ margin: 0 }}>{t('cab_course')}</h2>
              <GroupBadge g={g} />
            </div>
            {total === 0 ? <p className="muted">{t('cab_no_modules')}</p> : (
              <>
                <div>
                  <div className="progress" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
                  <div className="hint">{t('cab_progress', { done, total })}</div>
                </div>
                <ol className="module-list">
                  {info.modules.map(m => (
                    <li key={m.key}>
                      <Link to={`/k/${code}/m/${m.key}`} className="module-item">
                        <div>
                          <div className="module-title">{pick(m, 'title', lang)}</div>
                          <div className="muted small">{pick(m, 'goal', lang)}</div>
                        </div>
                        <StatusBadge s={m.status} />
                      </Link>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}

        {/* Жинақ / копилка */}
        <div className="card stack">
          <h2 style={{ margin: 0 }}>{t('cab_piggy')}</h2>
          {info.works.filter(w => w.status === 'accepted').length === 0
            ? <p className="muted">{t('cab_piggy_empty')}</p>
            : (
              <ul className="file-list">
                {info.works.filter(w => w.status === 'accepted').map(w => (
                  <li key={w.module_key}>
                    <span>
                      <Link to={`/k/${code}/m/${w.module_key}`}>{pick(w, 'title', lang)}</Link>
                      <span className="muted small"> · {fmtDate(w.updated_at)}{w.max_score ? ` · ${w.score}/${w.max_score}` : ''}</span>
                      {w.link && <><br /><a href={w.link} target="_blank" rel="noreferrer" className="small evidence">{w.link}</a></>}
                      {w.files.length > 0 && <><br /><span className="small muted">📄 {w.files.map(f => f.name).join(', ')}</span></>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </div>

        {/* Құралдар / инструменты */}
        {tools.length > 0 && (
          <div className="card stack">
            <h2 style={{ margin: 0 }}>{t('cab_tools')}</h2>
            <div className="tool-grid">
              {tools.map(x => <a key={x.label} className="btn big" href={x.url} target="_blank" rel="noreferrer">{x.label} ↗</a>)}
            </div>
          </div>
        )}

        {/* Диагностика тарихы / история */}
        {info.history.length > 0 && (
          <div className="card stack">
            <h2 style={{ margin: 0 }}>{t('cab_history')}</h2>
            <ul className="file-list">
              {info.history.map(h => (
                <li key={h.result_token}>
                  <span>{pick(h, 'campaign', lang)} <span className="muted small">· {fmtDate(h.finished_at)} · {Math.round(h.percent)}%</span></span>
                  <GroupBadge g={h.group_no} />
                </li>
              ))}
            </ul>
            <p className="small muted" style={{ margin: 0 }}>{t('cab_repeat_hint')}</p>
            <CopyBox label={t('cab_repeat')} value={personalLink(code)} />
          </div>
        )}

        <div className="card stack">
          <p className="small muted" style={{ margin: 0 }}>{t('cab_link_save')}</p>
          <CopyBox value={cabinetLink(code)} />
        </div>
      </div>
    </>
  )
}
