// Re-export everything from useDocuments for backward compatibility
export {
  useDocuments as usePlanningArtifacts,
  getArtifactTypeLabel,
  getArtifactTypeColor,
  inferArtifactType,
  generateDisplayName,
} from './useDocuments'
export type { PlanningArtifact, DocumentType, DocumentFile, DocumentFolder } from './useDocuments'
