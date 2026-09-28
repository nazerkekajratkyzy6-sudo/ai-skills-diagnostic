import { useMemo } from 'react'
import { pick, useI18n } from '../i18n'
import type { Campaign, Filters, School } from '../lib/types'

export default function FiltersBar({ value, onChange, schools, campaigns, isSuper }: {
  value: Filters; onChange: (f: Filters) => void; schools: School[]; campaigns: Campaign[]; isSuper: boolean
}) {
  const { t, lang } = useI18n()
  const regions = useMemo(() => Array.from(new Set(schools.map(s => s.region).filter(Boolean) as string[])).sort(), [schools])
  const set = (k: keyof Filters, v: string | boolean) => onChange({ ...value, [k]: v })
  const visibleSchools = schools.filter(s => value.include_demo || !s.is_demo).filter(s => !value.region || s.region === value.region)
  const visibleCampaigns = campaigns.filter(c => value.include_demo || !c.is_demo)
  return (
    <div className="card tight no-print" style={{ marginBottom: 16 }}>
      <div className="filters">
        {isSuper && (
          <label className="field"><span>{t('flt_region')}</span>
            <select value={value.region || ''} onChange={e => onChange({ ...value, region: e.target.value, school_id: '' })}>
              <option value="">{t('all')}</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select></label>
        )}
        {isSuper && (
          <label className="field"><span>{t('flt_school')}</span>
            <select value={value.school_id || ''} onChange={e => set('school_id', e.target.value)}>
              <option value="">{t('all')}</option>
              {visibleSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
        )}
        <label className="field"><span>{t('flt_campaign')}</span>
          <select value={value.campaign_id || ''} onChange={e => set('campaign_id', e.target.value)}>
            <option value="">{t('all')}</option>
            {visibleCampaigns.map(c => <option key={c.id} value={c.id}>{pick(c as unknown as Record<string, unknown>, 'name', lang)}</option>)}
          </select></label>
        <label className="field"><span>{t('flt_group')}</span>
          <select value={value.group_no || ''} onChange={e => set('group_no', e.target.value)}>
            <option value="">{t('all')}</option>
            {[1, 2, 3].map(g => <option key={g} value={g}>{t(`group_short_${g}` as 'group_short_1')}</option>)}
          </select></label>
        <label className="field"><span>{t('flt_language')}</span>
          <select value={value.language || ''} onChange={e => set('language', e.target.value)}>
            <option value="">{t('all')}</option>
            <option value="kk">{t('rs_lang_kk')}</option>
            <option value="ru">{t('rs_lang_ru')}</option>
          </select></label>
        <label className="field"><span>{t('flt_date_from')}</span>
          <input type="date" value={value.date_from || ''} onChange={e => set('date_from', e.target.value)} /></label>
        <label className="field"><span>{t('flt_date_to')}</span>
          <input type="date" value={value.date_to || ''} onChange={e => set('date_to', e.target.value)} /></label>
        {isSuper && (
          <label className="checkbox" style={{ minHeight: 40 }}>
            <input type="checkbox" checked={!!value.include_demo} onChange={e => set('include_demo', e.target.checked)} />
            <span className="small">{t('flt_demo')}</span></label>
        )}
        <button className="btn sm" type="button" onClick={() => onChange({})}>{t('flt_reset')}</button>
      </div>
    </div>
  )
}
