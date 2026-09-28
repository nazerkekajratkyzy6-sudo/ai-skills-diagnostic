import { Navigate, NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import type { Profile } from '../lib/types'
import { LangSwitch, useI18n, type TKey } from '../i18n'
import { Logo, Loading } from '../components'
import { useAuth } from '../lib/auth'
import { emailToLogin } from '../lib/supabase'

export default function AdminLayout() {
  const { t } = useI18n()
  const { session, profile, loading, signOut } = useAuth()
  const loc = useLocation()

  if (loading) return <div className="page"><Loading /></div>
  if (!session || !profile || !profile.is_active) return <Navigate to="/login" replace state={{ from: loc.pathname }} />

  const isSuper = profile.role === 'super_admin'
  const items: [string, TKey, boolean?][] = isSuper
    ? [['/admin', 'nav_dashboard', true], ['/admin/schools', 'nav_schools'], ['/admin/campaigns', 'nav_campaigns'],
       ['/admin/results', 'nav_results'], ['/admin/compare', 'nav_compare'], ['/admin/settings', 'nav_settings']]
    : [['/admin', 'nav_dashboard', true], [`/admin/schools/${profile.school_id}`, 'nav_my_school'],
       ['/admin/results', 'nav_results'], ['/admin/compare', 'nav_compare'], ['/admin/settings', 'nav_settings']]

  const links = items.map(([to, k, end]) => (
    <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>{t(k)}</NavLink>
  ))

  return (
    <div className="admin">
      <aside className="sidebar">
        <div className="brand"><Logo /><span>{t('app_name')}</span></div>
        <nav>{links}</nav>
        <div className="who">
          <div style={{ color: '#fff', fontWeight: 600 }}>{profile.full_name || emailToLogin(session.user.email)}</div>
          <div>{t(isSuper ? 'role_super_admin' : 'role_school_admin')}</div>
          <button className="btn sm block" onClick={signOut}>{t('logout')}</button>
        </div>
      </aside>
      <div className="admin-main">
        <nav className="mobile-nav">{links}<a href="#" onClick={e => { e.preventDefault(); signOut() }}>{t('logout')}</a></nav>
        <Outlet context={{ profile, isSuper }} />
      </div>
    </div>
  )
}

export function AdminHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="admin-head">
      <h1>{title}</h1>
      <div className="spacer" />
      {children}
      <LangSwitch compact />
    </div>
  )
}

export const useAdmin = () => useOutletContext<{ profile: Profile; isSuper: boolean }>()
