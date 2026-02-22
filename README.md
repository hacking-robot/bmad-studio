<div align="center">
  <img src="assets/banner.svg" alt="BMad Studio" width="500">
  <p><strong>A desktop IDE for managing BMAD projects — sprint board, agent automation, and full lifecycle control</strong></p>

  ![License](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey) ![Electron](https://img.shields.io/badge/electron-33-47848F)
</div>

---

<img src="assets/screenshot1.png" alt="BMad Studio Screenshot" width="100%">

## Features

### Development Modes
- **AI-Driven Development**: Automate story implementation end-to-end using Claude Code — from branching to code generation, review, and merge
- **Human-Driven Development**: Manage your sprint workflow manually with the sprint board, using BMAD agents as assistants rather than full automation

### Sprint Board
- **Sprint Board**: Drag-and-drop stories across columns (Backlog, Ready for Dev, In Progress, Review, Done, Optional)
- **Epic Organization**: Stories grouped by epic with color-coded badges
- **Custom Story Order**: Drag-and-drop ordering within columns, persisted per epic/status
- **Story Details**: View acceptance criteria, tasks, subtasks, and file changes with task toggling
- **Search & Filter**: Find stories by text or filter by epic
- **Collapsible Columns**: Minimize columns with per-epic state persistence
- **Human Review**: Optional review column with configurable checklist items
- **Status History**: Timeline of story status changes with source tracking (user vs agent)

### AI Agent Automation
- **Full Cycle**: One-click end-to-end story processing — creates story file, branches, implements, reviews, commits, and merges with a visual stepper and real-time log
- **Epic Cycle**: Batch-run the full cycle across all backlog stories in an epic with per-story progress tracking
- **Agent Chat**: Sliding sidebar panel with persistent threads, message streaming, typing indicators, and session resume
- **Agent Terminal**: Raw agent output view with ANSI color support and tool call filtering
- **Project Workflows**: Browse and launch available BMAD workflows directly from the UI
- **AI Tool Support**: Claude Code
- **Model Selection**: Choose between Opus and Sonnet
- **Smart Auto-Response**: Orchestrator detects agent prompts and provides intelligent context during automation
- **Cost Tracking**: Per-project LLM API cost ledger displayed in the status bar
- **Verbose Mode**: Toggle detailed tool call information in the chat view

### Project Management
- **Project Wizard**: Guided new project setup with BMAD installation, artifact detection, and template validation
- **Project Switcher**: Quickly switch between recent projects (up to 10)
- **BMAD Scanner**: Auto-discovers agents, workflows, and version info from `_bmad/` directory
- **Version Gate**: Blocks usage with pre-BMAD 6 projects and prompts for upgrade
- **Environment Check**: Verifies required tools (Claude Code CLI, Git) on project open
- **Planning Artifacts**: View epics, goals, and planning documents within the app

### Git Integration
- **Branch Management**: Create, switch, and view branches with last-commit activity timestamps
- **Diff Viewer**: Side-by-side git diff with resizable panel and changed files list
- **Uncommitted Changes**: View modified files in the working directory
- **Merge Support**: Merge story branches to base with merge status checks
- **Configurable Settings**: Base branch (main/master/develop), epic branches, gitignore handling — per-project

### Developer Experience
- **Dark/Light Mode**: Gruvbox-themed toggle
- **Command Palette**: Quick actions via `Cmd/Ctrl+K`
- **Keyboard Shortcuts**: Comprehensive shortcuts with `Cmd/Ctrl+/` reference dialog
- **Auto-Refresh**: File watching detects story file changes in real time
- **Auto-Update**: Checks for updates on launch, downloads in background, installs on quit
- **System Notifications**: Native OS notifications for agent messages when app is unfocused
- **Window Persistence**: Remembers window position and size across restarts

## Compatibility

| Requirement | Supported |
|-------------|-----------|
| BMAD Version | **BMAD 6** |
| Project Types | BMM (BMAD Method), GDS (BMAD Game Dev) |
| AI Tool | Claude Code |

> **Note**: BMad Studio requires **BMAD 6**. Earlier versions are blocked at startup. Builds are available for macOS, Windows, and Linux, but only **macOS** has been tested.

## Download

[![Latest Release](https://img.shields.io/github/v/release/hacking-robot/bmad-studio?label=Latest&color=E97451)](https://github.com/hacking-robot/bmad-studio/releases/latest)

| Platform | Download |
|----------|----------|
| macOS | [![Download for macOS](https://img.shields.io/badge/Download-.dmg-E97451)](https://github.com/hacking-robot/bmad-studio/releases/latest) |
| Windows | [![Download for Windows](https://img.shields.io/badge/Download-.exe-E97451)](https://github.com/hacking-robot/bmad-studio/releases/latest) |
| Linux | [![Download for Linux](https://img.shields.io/badge/Download-.AppImage-E97451)](https://github.com/hacking-robot/bmad-studio/releases/latest) |

## Build from Source

```bash
# Clone the repository
git clone https://github.com/hacking-robot/bmad-studio.git
cd bmad-studio

# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Build for production
npm run build
```

## Usage

1. Launch BMad Studio
2. Select your BMAD project folder (or create a new project with the wizard)
3. View your stories organized by status on the sprint board
4. Click a story card to view full details, chat history, and file changes
5. Use `Cmd/Ctrl+K` to open the command palette for quick actions
6. Open the agent chat sidebar to communicate with BMAD agents
7. Run Full Cycle or Epic Cycle to automate story processing end-to-end

### Supported Project Structures

**BMM (BMAD Method)** projects:
```
your-project/
├── _bmad/                    # BMAD agent & workflow definitions
├── docs/
│   ├── planning-artifacts/
│   │   ├── epics.md          # Epic definitions
│   │   └── stories/
│   │       ├── story-1.md
│   │       └── story-2.md
│   └── implementation-artifacts/
│       └── sprint-status.yaml  # Story status tracking
```

**GDS (BMAD Game Dev)** projects:
```
your-project/
├── _bmad/                    # BMAD agent & workflow definitions
├── epics.md                  # Epic definitions at root
└── docs/
    └── stories/
        ├── epic-1/
        │   ├── 1-1-story-slug.md
        │   └── 1-2-another-story.md
        └── epic-2/
            └── 2-1-story-name.md
```

### Story Status

Stories use frontmatter to define their status:

```yaml
---
status: ready-for-dev
---
```

Valid statuses: `backlog`, `ready-for-dev`, `in-progress`, `review`, `done`, `optional`

## Development

```bash
npm run dev              # Vite dev server only
npm run electron:dev     # Full Electron app in dev mode
npm run build            # Production build
npm run typecheck        # Type checking
```

## Tech Stack

- React 18 + TypeScript
- Electron 33
- MUI (Material UI) 6
- Zustand for state management
- Vite + electron-builder
- Emotion (CSS-in-JS) with Gruvbox theme

## License

MIT
