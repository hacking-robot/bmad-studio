import { WizardStep } from '../types/projectWizard'

export const BMM_WIZARD_STEPS: WizardStep[] = [
  {
    id: 'install',
    name: 'Install BMAD',
    phase: 'install',
    type: 'system',
    description: 'Install the bmad-method package into this project via npx',
    required: true,
    outputDir: '_bmad',
    tooltip: 'Runs npx to install the BMAD method framework into your project. This creates the _bmad folder with all agents, workflows, and configuration files needed for the BMAD development process.',
    subSteps: ['Download BMAD package via npx', 'Create _bmad/ folder structure', 'Install agents, workflows, and configs']
  },
  {
    id: 'brainstorming',
    name: 'Brainstorming',
    phase: 'analysis',
    type: 'agent',
    description: 'Brainstorm ideas and features with the Analyst',
    required: false,
    commandRef: 'brainstorming',
    commandModule: 'core',
    commandType: 'workflows',
    agentId: 'analyst',
    agentName: 'Analyst',
    outputDir: 'brainstorming',
    outputDirPrefix: 'brainstorming-session-',
    tooltip: 'An interactive session with the Analyst agent to explore ideas, features, and possibilities for your project. Produces a brainstorming report that feeds into later planning steps. Useful for new projects where the scope is still being defined.',
    subSteps: ['Explore ideas and features', 'Analyze feasibility', 'Produce brainstorming report']
  },
  {
    id: 'market-research',
    name: 'Market Research',
    phase: 'analysis',
    type: 'agent',
    description: 'Market size, growth, competition, and customer insights',
    required: false,
    commandRef: 'market-research',
    commandModule: 'bmm',
    commandType: 'workflows',
    agentId: 'analyst',
    agentName: 'Analyst',
    outputDir: 'research',
    outputDirPrefix: 'market-',
    tooltip: 'The Analyst agent researches market size, growth potential, competitive landscape, and target customer insights. Helps validate your product idea against real market conditions before investing in development.',
    subSteps: ['Market size and growth analysis', 'Competitive landscape', 'Target customer insights', 'Market validation']
  },
  {
    id: 'domain-research',
    name: 'Domain Research',
    phase: 'analysis',
    type: 'agent',
    description: 'Industry analysis, regulations, technology trends, and ecosystem dynamics',
    required: false,
    commandRef: 'domain-research',
    commandModule: 'bmm',
    commandType: 'workflows',
    agentId: 'analyst',
    agentName: 'Analyst',
    outputDir: 'research',
    outputDirPrefix: 'domain-',
    tooltip: 'Deep dive into your project\'s industry domain: regulatory requirements, technology trends, ecosystem dynamics, and domain-specific constraints. Especially valuable for projects in regulated industries or unfamiliar domains.',
    subSteps: ['Industry analysis', 'Regulatory requirements', 'Technology trends', 'Ecosystem dynamics']
  },
  {
    id: 'technical-research',
    name: 'Technical Research',
    phase: 'analysis',
    type: 'agent',
    description: 'Technology evaluation, architecture decisions, and implementation approaches',
    required: false,
    commandRef: 'technical-research',
    commandModule: 'bmm',
    commandType: 'workflows',
    agentId: 'analyst',
    agentName: 'Analyst',
    outputDir: 'research',
    outputDirPrefix: 'technical-',
    tooltip: 'Evaluates technology options, compares frameworks and tools, and analyzes implementation approaches. Helps make informed tech stack decisions before committing to an architecture.',
    subSteps: ['Technology evaluation', 'Framework comparison', 'Implementation approaches']
  },
  {
    id: 'product-brief',
    name: 'Product Brief',
    phase: 'analysis',
    type: 'agent',
    description: 'Create a high-level product brief summarizing the vision',
    required: false,
    commandRef: 'create-product-brief',
    commandModule: 'bmm',
    commandType: 'workflows',
    agentId: 'analyst',
    agentName: 'Analyst',
    outputFilePrefix: 'product-brief',
    tooltip: 'Creates a concise product brief that captures the project vision, target users, core value proposition, and high-level goals. Serves as the foundation document that aligns all subsequent planning and development work.',
    subSteps: ['Define project vision', 'Identify target users', 'Core value proposition', 'High-level goals']
  },
  {
    id: 'create-prd',
    name: 'Create PRD',
    phase: 'planning',
    type: 'agent',
    description: 'Create the Product Requirements Document with the PM',
    required: true,
    commandRef: 'create-prd',
    commandModule: 'bmm',
    commandType: 'workflows',
    agentId: 'pm',
    agentName: 'PM',
    outputFile: 'prd.md',
    tooltip: 'The PM agent creates a detailed Product Requirements Document (PRD) defining features, user flows, functional and non-functional requirements. This is a required step — the PRD drives all downstream architecture and story creation.',
    subSteps: ['Gather requirements', 'Define user flows', 'Functional requirements', 'Non-functional requirements', 'Output PRD.md']
  },
  {
    id: 'create-ux-design',
    name: 'Create UX Design',
    phase: 'planning',
    type: 'agent',
    description: 'Design the user experience and interface',
    required: false,
    commandRef: 'create-ux-design',
    commandModule: 'bmm',
    commandType: 'workflows',
    agentId: 'ux-designer',
    agentName: 'UX Designer',
    outputFilePrefix: 'ux-design',
    tooltip: 'The UX Designer agent creates a UX specification with user flows, wireframe descriptions, and interface guidelines. Produces a ux-design-specification.md that developers reference during implementation. Skip this if your project has no UI or you prefer to design as you go.',
    subSteps: ['User flow design', 'Wireframe descriptions', 'Interface guidelines', 'Output ux-spec.md']
  },
  {
    id: 'create-architecture',
    name: 'Create Architecture',
    phase: 'solutioning',
    type: 'agent',
    description: 'Design the system architecture with the Architect',
    required: true,
    commandRef: 'create-architecture',
    commandModule: 'bmm',
    commandType: 'workflows',
    agentId: 'architect',
    agentName: 'Architect',
    outputFile: 'architecture.md',
    tooltip: 'The Architect agent designs the system architecture: tech stack, component structure, data models, APIs, and integration patterns. This required step produces architecture.md, which guides all implementation work and ensures technical consistency.',
    subSteps: ['Tech stack selection', 'Component structure', 'Data models', 'API design', 'Output architecture.md']
  },
  {
    id: 'generate-project-context',
    name: 'Generate Project Context',
    phase: 'solutioning',
    type: 'agent',
    description: 'Generate a project context file for AI-assisted development',
    required: true,
    commandRef: 'generate-project-context',
    commandModule: 'bmm',
    commandType: 'workflows',
    agentId: 'analyst',
    agentName: 'Analyst',
    outputFile: 'project-context.md',
    tooltip: 'Generates a comprehensive project-context.md that summarizes all planning artifacts into a single reference document. AI agents use this during development to understand the full project scope without re-reading every artifact. Required for efficient AI-assisted development.',
    subSteps: ['Collect all planning artifacts', 'Synthesize into unified context', 'Output project-context.md']
  },
  {
    id: 'create-epics-and-stories',
    name: 'Create Epics & Stories',
    phase: 'solutioning',
    type: 'agent',
    description: 'Break the project into epics and stories with the PM',
    required: true,
    commandRef: 'create-epics-and-stories',
    commandModule: 'bmm',
    commandType: 'workflows',
    agentId: 'pm',
    agentName: 'PM',
    outputFile: 'epics.md',
    tooltip: 'The PM agent breaks down the PRD and architecture into epics (major feature groups) and individual stories with acceptance criteria. Produces epics.md and story files that populate the sprint board. This is what creates the work items you\'ll see on the board.',
    subSteps: ['Define epic groups', 'Break down into stories', 'Write acceptance criteria', 'Output epics.md']
  },
  {
    id: 'readiness-check',
    name: 'Readiness Check',
    phase: 'solutioning',
    type: 'agent',
    description: 'Verify the project is ready for implementation',
    required: true,
    commandRef: 'check-implementation-readiness',
    commandModule: 'bmm',
    commandType: 'workflows',
    agentId: 'architect',
    agentName: 'Architect',
    tooltip: 'The Architect agent reviews all planning artifacts (PRD, architecture, stories) to verify consistency, completeness, and readiness for implementation. Catches gaps or conflicts between documents before development begins, preventing costly rework later.',
    subSteps: ['Review all artifacts', 'Check consistency', 'Verify completeness', 'Identify gaps']
  },
  {
    id: 'sprint-planning',
    name: 'Sprint Planning',
    phase: 'implementation',
    type: 'agent',
    description: 'Initialize sprint planning to create story tracking',
    required: true,
    commandRef: 'sprint-planning',
    commandModule: 'bmm',
    commandType: 'workflows',
    agentId: 'sm',
    agentName: 'Scrum Master',
    outputFile: 'sprint-status.yaml',
    tooltip: 'The Scrum Master agent initializes sprint planning by creating sprint-status.yaml, which tracks all epics and stories with their statuses. This file is what populates the sprint board — without it, no stories will appear on the board.',
    subSteps: ['Parse epics and stories', 'Assign initial statuses', 'Create sprint-status.yaml']
  }
]

// Backward-compatible alias
export const WIZARD_STEPS = BMM_WIZARD_STEPS

export const GDS_WIZARD_STEPS: WizardStep[] = [
  {
    id: 'install',
    name: 'Install BMAD',
    phase: 'install',
    type: 'system',
    description: 'Install the bmad-method package with Game Dev Studio module into this project via npx',
    required: true,
    outputDir: '_bmad',
    tooltip: 'Runs npx to install the BMAD method framework with the Game Dev Studio module into your project. This creates the _bmad folder with game-specific agents, workflows, and configuration files.',
    subSteps: ['Download BMAD package via npx', 'Create _bmad/ folder structure', 'Install GDS agents, workflows, and configs']
  },
  {
    id: 'brainstorm-game',
    name: 'Brainstorm Game',
    phase: 'analysis',
    type: 'agent',
    description: 'Brainstorm game concepts, mechanics, and themes with the Game Designer',
    required: false,
    commandRef: 'brainstorm-game',
    commandModule: 'gds',
    commandType: 'workflows',
    agentId: 'game-designer',
    agentName: 'Game Designer',
    outputDir: 'brainstorming',
    outputDirPrefix: 'brainstorming-session-',
    tooltip: 'An interactive brainstorming session with the Game Designer to explore game concepts, mechanics, themes, and player experiences. Helps crystallize your game idea before committing to a full design document.',
    subSteps: ['Explore game concepts', 'Define core mechanics', 'Identify themes and player experience', 'Produce brainstorming report']
  },
  {
    id: 'game-brief',
    name: 'Game Brief',
    phase: 'analysis',
    type: 'agent',
    description: 'Create a high-level game brief summarizing the concept',
    required: false,
    commandRef: 'game-brief',
    commandModule: 'gds',
    commandType: 'workflows',
    agentId: 'game-designer',
    agentName: 'Game Designer',
    outputFile: 'game-brief.md',
    tooltip: 'Creates a concise game brief capturing the core concept, target audience, platform, genre, and key mechanics. Serves as the foundation document that aligns all subsequent game design and development work.',
    subSteps: ['Define core concept and genre', 'Target audience and platform', 'Key mechanics overview', 'Output game-brief.md']
  },
  {
    id: 'create-gdd',
    name: 'Create GDD',
    phase: 'planning',
    type: 'agent',
    description: 'Create the Game Design Document with the Game Designer',
    required: true,
    commandRef: 'gdd',
    commandModule: 'gds',
    commandType: 'workflows',
    agentId: 'game-designer',
    agentName: 'Game Designer',
    outputFile: 'gdd.md',
    tooltip: 'The Game Designer creates a comprehensive Game Design Document (GDD) defining gameplay mechanics, systems, progression, UI/UX, and technical requirements. This is a required step — the GDD drives all downstream architecture and story creation.',
    subSteps: ['Gameplay mechanics design', 'Systems and progression', 'UI/UX specifications', 'Technical requirements', 'Generate epics from design', 'Output GDD.md and epics.md']
  },
  {
    id: 'narrative',
    name: 'Narrative Design',
    phase: 'planning',
    type: 'agent',
    description: 'Design the game narrative, story, and dialogue systems',
    required: false,
    commandRef: 'narrative',
    commandModule: 'gds',
    commandType: 'workflows',
    agentId: 'game-designer',
    agentName: 'Game Designer',
    outputFile: 'narrative-design.md',
    tooltip: 'The Game Designer creates a narrative design document covering story arcs, characters, dialogue systems, and lore. Skip this if your game has minimal narrative elements.',
    subSteps: ['Story arcs and plot', 'Character development', 'Dialogue systems', 'Lore and world-building', 'Output narrative-design.md']
  },
  {
    id: 'game-architecture',
    name: 'Game Architecture',
    phase: 'solutioning',
    type: 'agent',
    description: 'Design the game system architecture',
    required: true,
    commandRef: 'game-architecture',
    commandModule: 'gds',
    commandType: 'workflows',
    agentId: 'game-architect',
    agentName: 'Game Architect',
    outputFile: 'game-architecture.md',
    tooltip: 'The Game Architect designs the technical architecture: game engine integration, rendering pipeline, physics systems, networking, asset pipeline, and component structure. This required step ensures the game is built on a solid technical foundation.',
    subSteps: ['Engine integration', 'Rendering and physics', 'Asset pipeline', 'Component structure', 'Output architecture.md']
  },
  {
    id: 'generate-project-context',
    name: 'Generate Project Context',
    phase: 'solutioning',
    type: 'agent',
    description: 'Generate a project context file for AI-assisted development',
    required: true,
    commandRef: 'generate-project-context',
    commandModule: 'gds',
    commandType: 'workflows',
    agentId: 'analyst',
    agentName: 'Analyst',
    outputFile: 'project-context.md',
    tooltip: 'Generates a comprehensive project-context.md that summarizes all planning artifacts (game brief, GDD, architecture) into a single reference document. AI agents use this during development to understand the full project scope without re-reading every artifact.',
    subSteps: ['Collect all planning artifacts', 'Synthesize into unified context', 'Output project-context.md']
  },
  {
    id: 'sprint-planning',
    name: 'Sprint Planning',
    phase: 'implementation',
    type: 'agent',
    description: 'Initialize sprint planning to create story tracking',
    required: true,
    commandRef: 'sprint-planning',
    commandModule: 'gds',
    commandType: 'workflows',
    agentId: 'game-scrum-master',
    agentName: 'Game Scrum Master',
    outputFile: 'sprint-status.yaml',
    tooltip: 'The Game Scrum Master initializes sprint planning by creating sprint-status.yaml, which tracks all epics and stories with their statuses. This file is what populates the sprint board.',
    subSteps: ['Parse epics and stories', 'Assign initial statuses', 'Create sprint-status.yaml']
  }
]

// Get the appropriate wizard steps for a primary module
export function getWizardSteps(primaryModule: 'bmm' | 'gds'): WizardStep[] {
  return primaryModule === 'gds' ? GDS_WIZARD_STEPS : BMM_WIZARD_STEPS
}

// Get the indices of required steps for a given step list
export function getRequiredStepIndices(steps: WizardStep[]): number[] {
  return steps
    .map((step, index) => step.required ? index : -1)
    .filter(i => i >= 0)
}

export const WIZARD_TOTAL_STEPS = WIZARD_STEPS.length

// Get the indices of required steps (backward compat for BMM)
export const REQUIRED_STEP_INDICES = getRequiredStepIndices(BMM_WIZARD_STEPS)

// Phase labels for grouping in the stepper
export const PHASE_LABELS: Record<string, string> = {
  install: 'Setup',
  analysis: 'Analysis',
  planning: 'Planning',
  solutioning: 'Solutioning',
  implementation: 'Implementation'
}
