import { NavLink } from 'react-router'
import { IconHistory, IconProgress, IconSettings, IconToday } from '../components/icons'
import styles from './TabBar.module.css'

const tabs = [
  { to: '/', label: 'Today', Icon: IconToday, end: true },
  { to: '/history', label: 'History', Icon: IconHistory, end: false },
  { to: '/progress', label: 'Progress', Icon: IconProgress, end: false },
  { to: '/settings', label: 'Settings', Icon: IconSettings, end: false },
] as const

export function TabBar() {
  return (
    <nav className={styles.bar} aria-label="Main">
      {tabs.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => (isActive ? `${styles.tab} ${styles.active}` : styles.tab)}
        >
          <Icon size={24} />
          <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
