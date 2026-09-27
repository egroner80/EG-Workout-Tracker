import { createHashRouter } from 'react-router'
import { ExerciseProgressScreen } from '../features/progress/ExerciseProgressScreen'
import { HistoryScreen } from '../features/history/HistoryScreen'
import { HomeScreen } from '../features/home/HomeScreen'
import { ProgressScreen } from '../features/progress/ProgressScreen'
import { SessionDetailScreen } from '../features/history/SessionDetailScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { SummaryScreen } from '../features/summary/SummaryScreen'
import { WorkoutRoute } from '../features/workout/WorkoutRoute'
import { AppShell } from './AppShell'

/** Hash routing works on any static host without server rewrites. */
export function createAppRouter() {
  return createHashRouter([
    {
      path: '/',
      element: <AppShell />,
      children: [
        { index: true, element: <HomeScreen /> },
        { path: 'workout', element: <WorkoutRoute /> },
        { path: 'summary/:sessionId', element: <SummaryScreen /> },
        { path: 'history', element: <HistoryScreen /> },
        { path: 'history/:sessionId', element: <SessionDetailScreen /> },
        { path: 'progress', element: <ProgressScreen /> },
        { path: 'progress/:targetId', element: <ExerciseProgressScreen /> },
        { path: 'settings/*', element: <SettingsScreen /> },
      ],
    },
  ])
}
