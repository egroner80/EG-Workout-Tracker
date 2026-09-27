import { Outlet, useLocation } from 'react-router'
import { useWorkoutStore } from '../state/workoutStore'
import styles from './AppShell.module.css'
import { TabBar } from './TabBar'
import { UpdateBanner } from './UpdateBanner'

/** Routes that run full-screen, without the tab bar. */
const FOCUS_ROUTES = ['/workout', '/summary']

export function AppShell() {
  const { pathname } = useLocation()
  const workoutActive = useWorkoutStore((state) => state.session !== null)
  const focused = FOCUS_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))

  return (
    <div className={focused ? styles.focusShell : styles.shell}>
      <UpdateBanner canShow={pathname === '/' && !workoutActive} />
      <main className={focused ? styles.focusMain : styles.main}>
        <Outlet />
      </main>
      {!focused && <TabBar />}
    </div>
  )
}
