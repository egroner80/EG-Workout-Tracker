import { createHashRouter } from 'react-router'
import { ExerciseProgressScreen } from '../features/progress/ExerciseProgressScreen'
import { HistoryScreen } from '../features/history/HistoryScreen'
import { HomeScreen } from '../features/home/HomeScreen'
import { ProgressScreen } from '../features/progress/ProgressScreen'
import { SessionDetailScreen } from '../features/history/SessionDetailScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { SummaryScreen } from '../features/summary/SummaryScreen'
import { WorkoutError } from '../features/recovery/WorkoutError'
import { WorkoutRoute } from '../features/workout/WorkoutRoute'
import { AppShell } from './AppShell'
import { ScreenError } from './ScreenError'

/** Hash routing works on any static host without server rewrites. */
export function createAppRouter() {
  return createHashRouter([
    {
      path: '/',
      element: <AppShell />,
      errorElement: <ScreenError />,
      children: [
        { index: true, element: <HomeScreen />, errorElement: <ScreenError /> },
        { path: 'workout', element: <WorkoutRoute />, errorElement: <WorkoutError /> },
        { path: 'summary/:sessionId', element: <SummaryScreen />, errorElement: <ScreenError /> },
        { path: 'history', element: <HistoryScreen />, errorElement: <ScreenError /> },
        { path: 'history/:sessionId', element: <SessionDetailScreen />, errorElement: <ScreenError /> },
        { path: 'progress', element: <ProgressScreen />, errorElement: <ScreenError /> },
        { path: 'progress/:targetId', element: <ExerciseProgressScreen />, errorElement: <ScreenError /> },
        { path: 'settings/*', element: <SettingsScreen />, errorElement: <ScreenError /> },
      ],
    },
  ])
}
