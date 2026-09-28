import { useParams } from 'react-router'
import type { TemplateId } from '../../domain/types'
import { isTemplateId } from '../../domain/workouts'

/** The workout a settings screen edits, named by its route; upper when the route names none. */
export function useTemplateParam(): TemplateId {
  const { templateId } = useParams()
  return isTemplateId(templateId) ? templateId : 'upper'
}
