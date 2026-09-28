import { useI18n } from '../i18n'

export function Bars({ rows, max, fmt = v => String(v) }: { rows: { label: string; value: number; title?: string }[]; max?: number; fmt?: (v: number) => string }) {
  const m = max ?? Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="bars">
      {rows.map(r => (
        <div className="bar-row" key={r.label} title={r.title ?? `${r.label}: ${fmt(r.value)}`}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          <div className="track"><div className="fill" style={{ width: `${Math.max(0, Math.min(100, (r.value / m) * 100))}%` }} /></div>
          <span className="val">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function GroupSplit({ g1, g2, g3 }: { g1: number; g2: number; g3: number }) {
  const { t } = useI18n()
  const total = g1 + g2 + g3
  const parts = [[1, g1, 'var(--g1)'], [2, g2, 'var(--g2)'], [3, g3, 'var(--g3)']] as const
  return (
    <div>
      <div className="stacked" role="img" aria-label={parts.map(([g, n]) => `${t(`group_short_${g}` as 'group_short_1')}: ${n}`).join(', ')}>
        {total > 0 && parts.map(([g, n, c]) => n > 0 && (
          <div key={g} style={{ width: `${(n / total) * 100}%`, background: c, borderRight: '2px solid var(--surface)' }}
            title={`${t(`group_short_${g}` as 'group_short_1')}: ${n} (${Math.round((n / total) * 100)}%)`}>
            {n / total > 0.08 ? n : ''}
          </div>
        ))}
      </div>
      <div className="legend">
        {parts.map(([g, n, c]) => (
          <span key={g}><i style={{ background: c }} />{t(`group_${g}` as 'group_1')}: <b>{n}</b>{total ? ` (${Math.round((n / total) * 100)}%)` : ''}</span>
        ))}
      </div>
    </div>
  )
}

export function Columns({ rows }: { rows: { label: string; value: number; title: string }[] }) {
  const m = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="columns-chart">
      {rows.map(r => (
        <div className="col" key={r.label} title={r.title}>
          <div className="c" style={{ height: `${(r.value / m) * 100}%` }} />
          <small>{r.label}</small>
        </div>
      ))}
    </div>
  )
}
