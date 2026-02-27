export type ProjectType = 'bmm' | 'gds' | 'dashboard'

export interface ProjectConfig {
  epicsPath: string
  sprintStatusPath: string
}

export const PROJECT_CONFIGS: Record<ProjectType, ProjectConfig> = {
  bmm: {
    epicsPath: 'planning-artifacts/epics.md',
    sprintStatusPath: 'implementation-artifacts/sprint-status.yaml'
  },
  gds: {
    epicsPath: 'planning-artifacts/epics.md',
    sprintStatusPath: 'implementation-artifacts/sprint-status.yaml'
  },
  dashboard: {
    epicsPath: '',
    sprintStatusPath: ''
  }
}

/** Check if the installed modules include a board-capable module (bmm or gds) */
export function hasBoardModule(modules: string[]): boolean {
  return modules.some(m => m === 'bmm' || m === 'gds')
}

export function getEpicsFullPath(projectPath: string, projectType: ProjectType, outputFolder: string = '_bmad-output'): string {
  return `${projectPath}/${outputFolder}/${PROJECT_CONFIGS[projectType].epicsPath}`
}

export function getSprintStatusFullPath(projectPath: string, projectType: ProjectType, outputFolder: string = '_bmad-output'): string {
  return `${projectPath}/${outputFolder}/${PROJECT_CONFIGS[projectType].sprintStatusPath}`
}
