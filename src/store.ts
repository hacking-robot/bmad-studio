import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  Epic,
  Story,
  StoryContent,
  StoryStatus,
  Agent,
  ProjectType,
  AgentHistoryEntry,
  AITool,
  ClaudeModel,
  CustomEndpointConfig,
  HumanReviewChecklistItem,
  StoryReviewState,
  ChatMessage,
  AgentThread,
  StatusChangeEntry,
  StatusChangeSource,
} from "./types";
import type { BmadScanResult } from "./types/bmadScan";
import type { WorkflowConfig } from "./types/flow";
import {
  FullCycleState,
  FullCycleStepType,
  FullCycleStepStatus,
  initialFullCycleState,
  EpicCycleState,
  EpicStoryStatus,
  initialEpicCycleState,
} from "./types/fullCycle";
import {
  ProjectWizardState,
  WizardStepStatus,
  initialWizardState,
} from "./types/projectWizard";
import { getWizardSteps } from "./data/wizardSteps";
import { flushPendingThreadSave } from "./utils/chatUtils";

export type ViewMode = "board" | "chat" | "dashboard";

export interface RecentProject {
  path: string;
  projectType: ProjectType;
  name: string;
  outputFolder?: string;
  developerMode?: "ai" | "human";
  baseBranch?: string;
  enableEpicBranches?: boolean;
  allowDirectEpicMerge?: boolean;
  disableGitBranching?: boolean;
  colorTheme?: string;
}

const MAX_HISTORY_ENTRIES = 50;
const MAX_RECENT_PROJECTS = 10;
const MAX_STATUS_HISTORY_PER_STORY = 50;
const MAX_GLOBAL_STATUS_HISTORY = 100;

// Debounce settings saves to prevent rapid writes that corrupt the file
let saveTimeout: NodeJS.Timeout | null = null;
let pendingSettings: Record<string, unknown> | null = null;

async function debouncedSave(settings: Record<string, unknown>) {
  pendingSettings = settings;

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    if (pendingSettings) {
      try {
        await window.fileAPI.saveSettings(pendingSettings);
      } catch (error) {
        console.error("Failed to save settings:", error);
      }
      pendingSettings = null;
    }
    saveTimeout = null;
  }, 1000); // Wait 1 second before saving
}

// Custom storage using Electron IPC
const electronStorage = {
  getItem: async (_name: string): Promise<string | null> => {
    try {
      const settings = await window.fileAPI.getSettings();
      return JSON.stringify({ state: settings, version: 0 });
    } catch {
      return null;
    }
  },
  setItem: async (_name: string, value: string): Promise<void> => {
    try {
      const parsed = JSON.parse(value);
      if (parsed.state) {
        // Only save the settings we care about
        const {
          themeMode,
          colorTheme,
          aiTool,
          claudeModel,
          customEndpoint,
          projectPath,
          projectType,
          outputFolder,
          selectedEpicId,
          collapsedColumnsByEpic,
          agentHistory,
          recentProjects,
          notificationsEnabled,
          verboseMode,
          baseBranch,
          allowDirectEpicMerge,
          bmadInGitignore,
          bmadInGitignoreUserSet,
          storyOrder,
          enableHumanReviewColumn,
          humanReviewChecklist,
          humanReviewStates,
          humanReviewStories,
          maxThreadMessages,
          statusHistoryByStory,
          globalStatusHistory,
          lastViewedStatusHistoryAt,
          enableEpicBranches,
          disableGitBranching,
          fullCycleReviewCount,
          developerMode,
          bmadUserName,
          bmadLanguage,
          hasConfiguredProfile,
          disableEnvCheck,
          chatSidebarWidth,
          gitDiffPanelWidth,
          zoomLevel,
        } = parsed.state;

        // Migrate git settings from app-level to per-project in recentProjects
        const migratedRecentProjects = (recentProjects || []).map(
          (p: RecentProject) => {
            if (p.path === projectPath) {
              const updates: Partial<RecentProject> = {};
              if (p.baseBranch === undefined && baseBranch)
                updates.baseBranch = baseBranch;
              if (
                p.enableEpicBranches === undefined &&
                enableEpicBranches !== undefined
              )
                updates.enableEpicBranches = enableEpicBranches;
              if (
                p.allowDirectEpicMerge === undefined &&
                allowDirectEpicMerge !== undefined
              )
                updates.allowDirectEpicMerge = allowDirectEpicMerge;
              if (
                p.disableGitBranching === undefined &&
                disableGitBranching !== undefined
              )
                updates.disableGitBranching = disableGitBranching;
              if (p.developerMode === undefined && developerMode)
                updates.developerMode = developerMode;
              if (Object.keys(updates).length > 0) return { ...p, ...updates };
            }
            return p;
          },
        );

        // Don't persist full output - it can contain characters that break JSON
        // Just save metadata and a small summary
        const sanitizedHistory = (agentHistory || []).map(
          (entry: AgentHistoryEntry) => ({
            ...entry,
            output: [], // Don't persist output - it's only useful in current session
          }),
        );

        // Use debounced save to prevent rapid writes
        // Note: enableAgents is intentionally NOT persisted - must re-enable each session
        debouncedSave({
          themeMode,
          colorTheme: colorTheme || "gruvbox-dark",
          aiTool: aiTool || "claude-code",
          claudeModel: claudeModel || "opus",
          customEndpoint: customEndpoint || null,
          projectPath,
          projectType,
          outputFolder: outputFolder || "_bmad-output",
          selectedEpicId,
          collapsedColumnsByEpic,
          agentHistory: sanitizedHistory,
          recentProjects: migratedRecentProjects,
          notificationsEnabled: notificationsEnabled ?? false,
          verboseMode: verboseMode ?? false,
          bmadInGitignore: bmadInGitignore ?? false,
          bmadInGitignoreUserSet: bmadInGitignoreUserSet ?? false,
          storyOrder: storyOrder || {},
          enableHumanReviewColumn: enableHumanReviewColumn ?? false,
          humanReviewChecklist: humanReviewChecklist || [],
          humanReviewStates: humanReviewStates || {},
          humanReviewStories: humanReviewStories || [],
          maxThreadMessages: maxThreadMessages ?? 100,
          statusHistoryByStory: statusHistoryByStory || {},
          globalStatusHistory: globalStatusHistory || [],
          lastViewedStatusHistoryAt: lastViewedStatusHistoryAt || 0,
          fullCycleReviewCount: fullCycleReviewCount ?? 1,
          bmadUserName: bmadUserName || '',
          bmadLanguage: bmadLanguage || 'en',
          hasConfiguredProfile: hasConfiguredProfile ?? false,
          disableEnvCheck: disableEnvCheck ?? false,
          chatSidebarWidth: chatSidebarWidth ?? null,
          gitDiffPanelWidth: gitDiffPanelWidth ?? 600,
          zoomLevel: zoomLevel ?? 100,
        });
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  },
  removeItem: async (_name: string): Promise<void> => {
    await window.fileAPI.saveSettings({
      themeMode: "dark",
      colorTheme: "gruvbox-dark",
      aiTool: "claude-code",
      claudeModel: "opus",
      customEndpoint: null,
      projectPath: null,
      projectType: null,
      outputFolder: "_bmad-output",
      selectedEpicId: null,
      collapsedColumnsByEpic: {},
      agentHistory: [],
      recentProjects: [],
      notificationsEnabled: false,
      verboseMode: false,
      bmadInGitignore: false,
      bmadInGitignoreUserSet: false,
      storyOrder: {},
      enableHumanReviewColumn: false,
      humanReviewChecklist: [],
      humanReviewStates: {},
      humanReviewStories: [],
      maxThreadMessages: 100,
      statusHistoryByStory: {},
      globalStatusHistory: [],
      lastViewedStatusHistoryAt: 0,
      fullCycleReviewCount: 1,
    });
  },
};

interface AppState {
  // Hydration
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  // Hidden features
  enableAgents: boolean;
  toggleEnableAgents: () => void;

  // Theme
  themeMode: "light" | "dark";
  setThemeMode: (mode: "light" | "dark") => void;
  toggleTheme: () => void;
  colorTheme: string;
  setColorTheme: (theme: string) => void;

  // AI Tool
  aiTool: AITool;
  setAITool: (tool: AITool) => void;

  // Claude Model (only applies when aiTool is 'claude-code')
  claudeModel: ClaudeModel;
  setClaudeModel: (model: ClaudeModel) => void;

  // Custom Endpoint (for Anthropic-compatible APIs like GLM, Kimi)
  customEndpoint: CustomEndpointConfig | null;
  setCustomEndpoint: (config: CustomEndpointConfig | null) => void;

  // Notifications
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  isUserDragging: boolean;
  setIsUserDragging: (dragging: boolean) => void;

  // Verbose Chat Mode
  verboseMode: boolean;
  setVerboseMode: (enabled: boolean) => void;

  // Git settings
  baseBranch: string;
  setBaseBranch: (branch: string) => void;
  allowDirectEpicMerge: boolean;
  setAllowDirectEpicMerge: (allow: boolean) => void;
  bmadInGitignore: boolean; // When true, bmad folders are gitignored so branch restrictions are relaxed
  setBmadInGitignore: (inGitignore: boolean, userSet?: boolean) => void;
  bmadInGitignoreUserSet: boolean; // When true, user has manually set bmadInGitignore (don't auto-detect)
  enableEpicBranches: boolean; // When true, show epic branch features (GitHub icon in EpicFilter, epic branches in BranchSwitcher)
  setEnableEpicBranches: (enabled: boolean) => void;
  disableGitBranching: boolean; // When true, bypass all branch restrictions and hide branch UI
  setDisableGitBranching: (disabled: boolean) => void;
  disableEnvCheck: boolean; // When true, skip environment check on project open
  setDisableEnvCheck: (disabled: boolean) => void;
  fullCycleReviewCount: number; // 0-5, how many code review rounds in full cycle
  setFullCycleReviewCount: (count: number) => void;

  // Developer Mode (per-project, persisted)
  developerMode: "ai" | "human";
  setDeveloperMode: (mode: "ai" | "human") => void;

  // BMAD Profile (user-level, written to project config.yaml on install)
  bmadUserName: string;
  setBmadUserName: (name: string) => void;
  bmadLanguage: string;
  setBmadLanguage: (lang: string) => void;
  profileDialogOpen: boolean;
  setProfileDialogOpen: (open: boolean) => void;
  hasConfiguredProfile: boolean;
  setHasConfiguredProfile: (configured: boolean) => void;

  // Project
  projectPath: string | null;
  projectType: ProjectType | null;
  outputFolder: string;
  setProjectPath: (path: string | null) => void;
  setProjectType: (type: ProjectType | null) => void;
  setOutputFolder: (folder: string) => void;

  // BMAD Scan (NOT persisted — recalculated on each project load)
  bmadScanResult: BmadScanResult | null;
  scannedWorkflowConfig: WorkflowConfig | null;
  bmadVersionError: string | null;
  setBmadScanResult: (result: BmadScanResult | null) => void;
  setScannedWorkflowConfig: (config: WorkflowConfig | null) => void;
  setBmadVersionError: (error: string | null) => void;

  // Recent Projects
  recentProjects: RecentProject[];
  addRecentProject: (project: RecentProject) => void;
  removeRecentProject: (path: string) => void;

  // Git state (reactive across components)
  currentBranch: string | null;
  hasUncommittedChanges: boolean;
  unmergedStoryBranches: string[];
  epicMergeStatusChecked: boolean; // true once we've checked merge status for current epic
  setCurrentBranch: (branch: string | null) => void;
  setHasUncommittedChanges: (hasChanges: boolean) => void;
  setUnmergedStoryBranches: (branches: string[]) => void;
  setEpicMergeStatusChecked: (checked: boolean) => void;

  // Data
  epics: Epic[];
  stories: Story[];
  loading: boolean;
  error: string | null;
  lastRefreshed: Date | null;
  isWatching: boolean;
  documentsRevision: number;
  bumpDocumentsRevision: () => void;
  setEpics: (epics: Epic[]) => void;
  setStories: (stories: Story[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastRefreshed: (date: Date | null) => void;
  setIsWatching: (watching: boolean) => void;

  // Filters
  selectedEpicId: number | null;
  setSelectedEpicId: (id: number | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Column collapse state (per epic)
  collapsedColumnsByEpic: Record<string, StoryStatus[]>;
  toggleColumnCollapse: (status: StoryStatus) => void;
  getCollapsedColumns: () => StoryStatus[];

  // Story order (per epic per status)
  storyOrder: Record<string, Record<string, string[]>>;
  setStoryOrder: (epicId: string, status: string, storyIds: string[]) => void;
  getStoryOrder: (epicId: string, status: string) => string[];

  // Story dialog
  selectedStory: Story | null;
  storyContent: StoryContent | null;
  setSelectedStory: (story: Story | null) => void;
  setStoryContent: (content: StoryContent | null) => void;

  // Help Panel
  helpPanelOpen: boolean;
  helpPanelTab: number;
  helpPanelScrollToAgent: string | null;
  setHelpPanelOpen: (
    open: boolean,
    tab?: number,
    scrollToAgent?: string,
  ) => void;
  toggleHelpPanel: () => void;
  clearHelpPanelScrollToAgent: () => void;

  // New Project Dialog
  newProjectDialogOpen: boolean;
  pendingNewProject: {
    path: string;
    projectType: ProjectType;
    outputFolder?: string;
    bmadInstalled?: boolean;
  } | null;
  setNewProjectDialogOpen: (open: boolean) => void;
  setPendingNewProject: (
    project: {
      path: string;
      projectType: ProjectType;
      outputFolder?: string;
      bmadInstalled?: boolean;
    } | null,
  ) => void;

  // Agents
  agents: Record<string, Agent>;
  activeAgentId: string | null;
  agentPanelOpen: boolean;
  addAgent: (agent: Agent) => void;
  updateAgent: (agentId: string, updates: Partial<Agent>) => void;
  appendAgentOutput: (agentId: string, output: string) => void;
  removeAgent: (agentId: string) => void;
  setActiveAgent: (agentId: string | null) => void;
  toggleAgentPanel: () => void;
  setAgentPanelOpen: (open: boolean) => void;
  getAgentForStory: (storyId: string) => Agent | null;

  // Agent History (persisted)
  agentHistory: AgentHistoryEntry[];
  addToHistory: (entry: AgentHistoryEntry) => void;
  updateHistoryEntry: (id: string, updates: Partial<AgentHistoryEntry>) => void;
  clearHistory: () => void;
  getHistoryForStory: (storyId: string) => AgentHistoryEntry[];

  // Human Review
  enableHumanReviewColumn: boolean;
  setEnableHumanReviewColumn: (enabled: boolean) => void;
  humanReviewChecklist: HumanReviewChecklistItem[];
  humanReviewStates: Record<string, StoryReviewState>;
  toggleReviewItem: (storyId: string, itemId: string) => void;
  isReviewComplete: (storyId: string) => boolean;
  // Human Review status override (app-level, not written to BMAD)
  humanReviewStories: string[];
  addToHumanReview: (storyId: string) => void;
  removeFromHumanReview: (storyId: string) => void;
  isInHumanReview: (storyId: string) => boolean;
  getEffectiveStatus: (story: Story) => StoryStatus;

  // View Mode (board or chat)
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;

  // Chat Interface
  chatThreads: Record<string, AgentThread>;
  selectedChatAgent: string | null;
  maxThreadMessages: number;
  setSelectedChatAgent: (agentId: string | null) => void;
  setMaxThreadMessages: (max: number) => void;
  addChatMessage: (agentId: string, message: ChatMessage) => void;
  updateChatMessage: (
    agentId: string,
    messageId: string,
    updates: Partial<ChatMessage>,
  ) => void;
  setChatTyping: (agentId: string, isTyping: boolean) => void;
  setChatActivity: (agentId: string, activity: string | undefined) => void;
  markChatRead: (agentId: string) => void;
  incrementUnread: (agentId: string) => void;
  clearChatThread: (agentId: string) => void;
  setAgentInitialized: (agentId: string, initialized: boolean) => void;
  setChatSessionId: (agentId: string, sessionId: string) => void;
  // Pending message to send when switching to chat
  pendingChatMessage: {
    agentId: string;
    message: string;
    storyId?: string;
    branchName?: string;
  } | null;
  setPendingChatMessage: (
    pending: {
      agentId: string;
      message: string;
      storyId?: string;
      branchName?: string;
    } | null,
  ) => void;
  clearPendingChatMessage: () => void;
  setThreadContext: (
    agentId: string,
    storyId: string | undefined,
    branchName: string | undefined,
  ) => void;

  // Zoom Level
  zoomLevel: number;
  setZoomLevel: (level: number) => void;

  // Chat Sidebar
  chatSidebarWidth: number | null;
  setChatSidebarWidth: (width: number | null) => void;

  // Git Diff Panel (NOT persisted — transient UI state)
  gitDiffPanelOpen: boolean;
  gitDiffPanelBranch: string | null;
  gitDiffPanelWidth: number;
  openGitDiffPanel: (branchName: string) => void;
  closeGitDiffPanel: () => void;
  setGitDiffPanelWidth: (width: number) => void;

  // Status History
  statusHistoryByStory: Record<string, StatusChangeEntry[]>;
  globalStatusHistory: StatusChangeEntry[];
  statusHistoryPanelOpen: boolean;
  lastViewedStatusHistoryAt: number;
  recordStatusChange: (
    storyId: string,
    storyTitle: string,
    epicId: number,
    storyNumber: number,
    oldStatus: StoryStatus,
    newStatus: StoryStatus,
    source: StatusChangeSource,
  ) => void;
  getStatusHistoryForStory: (storyId: string) => StatusChangeEntry[];
  setStatusHistoryPanelOpen: (open: boolean) => void;
  markStatusHistoryViewed: () => void;
  getUnreadStatusHistoryCount: () => number;

  // Project Cost Tracking (NOT persisted — recomputed from ledger on project open)
  projectCostTotal: number;
  setProjectCostTotal: (total: number) => void;
  addToProjectCostTotal: (amount: number) => void;

  // Full Cycle Automation
  fullCycle: FullCycleState;
  startFullCycle: (storyId: string, totalSteps: number) => void;
  updateFullCycleStep: (
    step: number,
    name: string,
    type: FullCycleStepType,
  ) => void;
  appendFullCycleLog: (log: string) => void;
  setFullCycleError: (error: string) => void;
  completeFullCycle: () => void;
  cancelFullCycle: () => void;
  retryFullCycle: () => void;
  setFullCycleMinimized: (minimized: boolean) => void;
  setFullCycleSessionId: (sessionId: string) => void;
  skipFullCycleStep: (stepIndex: number) => void;
  advanceFullCycleStep: () => void;
  fullCycleDialogOpen: boolean;
  setFullCycleDialogOpen: (open: boolean) => void;

  // Epic Cycle Automation
  epicCycle: EpicCycleState;
  epicCycleDialogOpen: boolean;
  setEpicCycleDialogOpen: (open: boolean) => void;
  startEpicCycle: (epicId: number, storyIds: string[]) => void;
  advanceEpicCycleStory: () => void;
  setEpicCycleError: (error: string) => void;
  cancelEpicCycle: () => void;
  completeEpicCycle: () => void;
  resetEpicCycle: () => void;
  retryEpicCycle: () => void;

  // Auto-Update (NOT persisted — transient state from electron-updater)
  updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date';
  updateVersion: string;
  updateDownloadPercent: number;
  setUpdateStatus: (status: AppState['updateStatus']) => void;
  setUpdateVersion: (version: string) => void;
  setUpdateDownloadPercent: (percent: number) => void;

  // Environment Check Dialog
  envCheckDialogOpen: boolean;
  envCheckResults: import("../electron/preload").EnvCheckItem[] | null;
  envCheckLoading: boolean;
  setEnvCheckDialogOpen: (open: boolean) => void;
  setEnvCheckResults: (
    results: import("../electron/preload").EnvCheckItem[] | null,
  ) => void;
  setEnvCheckLoading: (loading: boolean) => void;

  // Project Workflows Dialog
  projectWorkflowsDialogOpen: boolean;
  setProjectWorkflowsDialogOpen: (open: boolean) => void;

  // Project Wizard
  projectWizard: ProjectWizardState;
  startProjectWizard: (
    projectPath: string,
    outputFolder?: string,
    developerMode?: "ai" | "human",
    selectedModules?: string[],
    customContentPaths?: string[],
  ) => void;
  updateWizardStep: (stepIndex: number, status: WizardStepStatus) => void;
  advanceWizardStep: () => void;
  skipWizardStep: (stepIndex: number) => void;
  appendWizardInstallLog: (line: string) => void;
  setWizardError: (error: string | null) => void;
  completeWizard: () => void;
  cancelWizard: () => void;
  resumeWizard: (state: ProjectWizardState) => void;
  goToWizardStep: (stepIndex: number) => void;
  rerunWizardStep: (stepIndex: number) => void;
  setWizardActiveSubStep: (step: number) => void;

  // Computed - filtered stories
  getFilteredStories: () => Story[];
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Hydration
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      // Hidden features
      enableAgents: false,
      toggleEnableAgents: () =>
        set((state) => ({ enableAgents: !state.enableAgents })),

      // Theme
      themeMode: "dark",
      setThemeMode: (mode) => set({ themeMode: mode }),
      toggleTheme: () =>
        set((state) => ({
          themeMode: state.themeMode === "light" ? "dark" : "light",
        })),
      colorTheme: "gruvbox-dark",
      setColorTheme: (theme) =>
        set((state) => ({
          colorTheme: theme,
          recentProjects: state.projectPath
            ? state.recentProjects.map((p) =>
                p.path === state.projectPath
                  ? { ...p, colorTheme: theme }
                  : p,
              )
            : state.recentProjects,
        })),

      // AI Tool
      aiTool: "claude-code",
      setAITool: (tool) => set({ aiTool: tool }),

      // Claude Model
      claudeModel: "opus",
      setClaudeModel: (model) => set({ claudeModel: model }),

      // Custom Endpoint
      customEndpoint: null,
      setCustomEndpoint: (config) => set({ customEndpoint: config }),

      // Notifications
      notificationsEnabled: false,
      setNotificationsEnabled: (enabled) =>
        set({ notificationsEnabled: enabled }),
      isUserDragging: false,
      setIsUserDragging: (dragging) => set({ isUserDragging: dragging }),

      // Verbose Chat Mode
      verboseMode: false,
      setVerboseMode: (enabled) => set({ verboseMode: enabled }),

      // Git settings
      baseBranch: "main",
      setBaseBranch: (branch) =>
        set((state) => ({
          baseBranch: branch,
          recentProjects: state.projectPath
            ? state.recentProjects.map((p) =>
                p.path === state.projectPath ? { ...p, baseBranch: branch } : p,
              )
            : state.recentProjects,
        })),
      allowDirectEpicMerge: false,
      setAllowDirectEpicMerge: (allow) =>
        set((state) => ({
          allowDirectEpicMerge: allow,
          recentProjects: state.projectPath
            ? state.recentProjects.map((p) =>
                p.path === state.projectPath
                  ? { ...p, allowDirectEpicMerge: allow }
                  : p,
              )
            : state.recentProjects,
        })),
      bmadInGitignore: false,
      setBmadInGitignore: (inGitignore, userSet) =>
        set({
          bmadInGitignore: inGitignore,
          ...(userSet !== undefined && { bmadInGitignoreUserSet: userSet }),
        }),
      bmadInGitignoreUserSet: false,
      enableEpicBranches: false,
      setEnableEpicBranches: (enabled) =>
        set((state) => ({
          enableEpicBranches: enabled,
          recentProjects: state.projectPath
            ? state.recentProjects.map((p) =>
                p.path === state.projectPath
                  ? { ...p, enableEpicBranches: enabled }
                  : p,
              )
            : state.recentProjects,
        })),
      disableGitBranching: true,
      setDisableGitBranching: (disabled) =>
        set((state) => ({
          disableGitBranching: disabled,
          recentProjects: state.projectPath
            ? state.recentProjects.map((p) =>
                p.path === state.projectPath
                  ? { ...p, disableGitBranching: disabled }
                  : p,
              )
            : state.recentProjects,
        })),
      disableEnvCheck: false,
      setDisableEnvCheck: (disabled) => set({ disableEnvCheck: disabled }),
      fullCycleReviewCount: 1,
      setFullCycleReviewCount: (count) =>
        set({ fullCycleReviewCount: Math.max(0, Math.min(5, count)) }),

      // Developer Mode
      developerMode: "ai",
      setDeveloperMode: (mode) =>
        set((state) => ({
          developerMode: mode,
          recentProjects: state.projectPath
            ? state.recentProjects.map((p) =>
                p.path === state.projectPath
                  ? { ...p, developerMode: mode }
                  : p,
              )
            : state.recentProjects,
        })),

      // BMAD Profile
      bmadUserName: "Neo",
      setBmadUserName: (name) => set({ bmadUserName: name }),
      bmadLanguage: "English",
      setBmadLanguage: (lang) => set({ bmadLanguage: lang }),
      profileDialogOpen: false,
      setProfileDialogOpen: (open) => set({ profileDialogOpen: open }),
      hasConfiguredProfile: false,
      setHasConfiguredProfile: (configured) => set({ hasConfiguredProfile: configured }),

      // Project
      projectPath: null,
      projectType: null,
      outputFolder: "_bmad-output",
      setProjectPath: (path) => {
        const state = get();
        if (state.projectPath && path !== state.projectPath) {
          flushPendingThreadSave();
          for (const [agentId, thread] of Object.entries(state.chatThreads)) {
            if (thread && (thread as AgentThread).messages.length > 0) {
              window.chatAPI?.saveThread(
                state.projectPath,
                agentId,
                thread as AgentThread,
              );
            }
          }
        }
        set({
          projectPath: path,
          bmadVersionError: null,
          chatThreads: {},
          selectedChatAgent: null,
          gitDiffPanelOpen: false,
          gitDiffPanelBranch: null,
        });
      },
      setProjectType: (type) => set({ projectType: type }),
      setOutputFolder: (folder) => set({ outputFolder: folder }),

      // BMAD Scan (NOT persisted)
      bmadScanResult: null,
      scannedWorkflowConfig: null,
      bmadVersionError: null,
      setBmadScanResult: (result) => set({ bmadScanResult: result }),
      setScannedWorkflowConfig: (config) =>
        set({ scannedWorkflowConfig: config }),
      setBmadVersionError: (error) => set({ bmadVersionError: error }),

      // Recent Projects
      recentProjects: [],
      addRecentProject: (project) =>
        set((state) => {
          // Remove if already exists (to move it to top)
          const filtered = state.recentProjects.filter(
            (p) => p.path !== project.path,
          );
          // Add to beginning and limit to max
          const updated = [project, ...filtered].slice(0, MAX_RECENT_PROJECTS);
          return { recentProjects: updated };
        }),
      removeRecentProject: (path) =>
        set((state) => ({
          recentProjects: state.recentProjects.filter((p) => p.path !== path),
        })),

      // Git state (reactive across components)
      currentBranch: null,
      hasUncommittedChanges: false,
      unmergedStoryBranches: [],
      epicMergeStatusChecked: false,
      setCurrentBranch: (branch) => {
        const current = get().currentBranch;
        // Skip if branch hasn't changed - prevents resetting merge status check
        if (branch === current) return;
        set({
          currentBranch: branch,
          unmergedStoryBranches: [],
          epicMergeStatusChecked: false, // Reset - need to re-check merge status
        });
      },
      setHasUncommittedChanges: (hasChanges) =>
        set({ hasUncommittedChanges: hasChanges }),
      setUnmergedStoryBranches: (branches) => {
        set({ unmergedStoryBranches: branches, epicMergeStatusChecked: true });
      },
      setEpicMergeStatusChecked: (checked) =>
        set({ epicMergeStatusChecked: checked }),

      // Data
      epics: [],
      stories: [],
      loading: false,
      error: null,
      lastRefreshed: null,
      isWatching: false,
      setEpics: (epics) => set({ epics }),
      setStories: (stories) => set({ stories }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setLastRefreshed: (date) => set({ lastRefreshed: date }),
      setIsWatching: (watching) => set({ isWatching: watching }),
      documentsRevision: 0,
      bumpDocumentsRevision: () => set((state) => ({ documentsRevision: state.documentsRevision + 1 })),

      // Filters
      selectedEpicId: null,
      setSelectedEpicId: (id) => set({ selectedEpicId: id }),
      searchQuery: "",
      setSearchQuery: (query) => set({ searchQuery: query }),

      // Column collapse state (per epic)
      collapsedColumnsByEpic: {},
      toggleColumnCollapse: (status) =>
        set((state) => {
          const epicKey =
            state.selectedEpicId === null
              ? "all"
              : String(state.selectedEpicId);
          const currentCollapsed = state.collapsedColumnsByEpic[epicKey] || [];
          const isCollapsed = currentCollapsed.includes(status);
          return {
            collapsedColumnsByEpic: {
              ...state.collapsedColumnsByEpic,
              [epicKey]: isCollapsed
                ? currentCollapsed.filter((s) => s !== status)
                : [...currentCollapsed, status],
            },
          };
        }),
      getCollapsedColumns: () => {
        const state = get();
        const epicKey =
          state.selectedEpicId === null ? "all" : String(state.selectedEpicId);
        return state.collapsedColumnsByEpic[epicKey] || [];
      },

      // Story order (per epic per status)
      storyOrder: {},
      setStoryOrder: (epicId, status, storyIds) =>
        set((state) => ({
          storyOrder: {
            ...state.storyOrder,
            [epicId]: {
              ...(state.storyOrder[epicId] || {}),
              [status]: storyIds,
            },
          },
        })),
      getStoryOrder: (epicId, status) => {
        const state = get();
        return state.storyOrder[epicId]?.[status] || [];
      },

      // Story dialog
      selectedStory: null,
      storyContent: null,
      setSelectedStory: (story) => set({ selectedStory: story }),
      setStoryContent: (content) => set({ storyContent: content }),

      // Help Panel
      helpPanelOpen: false,
      helpPanelTab: 0,
      helpPanelScrollToAgent: null,
      setHelpPanelOpen: (open, tab = 0, scrollToAgent) =>
        set({
          helpPanelOpen: open,
          helpPanelTab: tab,
          helpPanelScrollToAgent: scrollToAgent || null,
        }),
      toggleHelpPanel: () =>
        set((state) => ({ helpPanelOpen: !state.helpPanelOpen })),
      clearHelpPanelScrollToAgent: () => set({ helpPanelScrollToAgent: null }),

      // New Project Dialog
      newProjectDialogOpen: false,
      pendingNewProject: null,
      setNewProjectDialogOpen: (open) => set({ newProjectDialogOpen: open }),
      setPendingNewProject: (project) => set({ pendingNewProject: project }),

      // Agents
      agents: {},
      activeAgentId: null,
      agentPanelOpen: false,
      addAgent: (agent) =>
        set((state) => ({
          agents: { ...state.agents, [agent.id]: agent },
        })),
      updateAgent: (agentId, updates) =>
        set((state) => {
          const agent = state.agents[agentId];
          if (!agent) return state;
          return {
            agents: {
              ...state.agents,
              [agentId]: { ...agent, ...updates },
            },
          };
        }),
      appendAgentOutput: (agentId, output) =>
        set((state) => {
          const agent = state.agents[agentId];
          if (!agent) return state;
          return {
            agents: {
              ...state.agents,
              [agentId]: {
                ...agent,
                output: [...agent.output, output],
              },
            },
          };
        }),
      removeAgent: (agentId) =>
        set((state) => {
          const { [agentId]: _, ...rest } = state.agents;
          return {
            agents: rest,
            activeAgentId:
              state.activeAgentId === agentId ? null : state.activeAgentId,
          };
        }),
      setActiveAgent: (agentId) => set({ activeAgentId: agentId }),
      toggleAgentPanel: () =>
        set((state) => ({ agentPanelOpen: !state.agentPanelOpen })),
      setAgentPanelOpen: (open) => set({ agentPanelOpen: open }),
      getAgentForStory: (storyId) => {
        const { agents } = get();
        return Object.values(agents).find((a) => a.storyId === storyId) || null;
      },

      // Agent History
      agentHistory: [],
      addToHistory: (entry) =>
        set((state) => {
          // Check if entry already exists (prevent duplicates)
          if (state.agentHistory.some((h) => h.id === entry.id)) {
            return state;
          }
          // Don't store output in history - it's saved to files
          const trimmedEntry = {
            ...entry,
            output: [], // Output is stored in separate files
          };
          // Add to front, limit total entries
          const newHistory = [trimmedEntry, ...state.agentHistory].slice(
            0,
            MAX_HISTORY_ENTRIES,
          );
          return { agentHistory: newHistory };
        }),
      updateHistoryEntry: (id, updates) =>
        set((state) => {
          const index = state.agentHistory.findIndex((h) => h.id === id);
          if (index === -1) return state;
          const updated = [...state.agentHistory];
          // Don't update output - it's stored in files
          const { output: _output, ...safeUpdates } = updates;
          updated[index] = { ...updated[index], ...safeUpdates };
          return { agentHistory: updated };
        }),
      clearHistory: () => set({ agentHistory: [] }),
      getHistoryForStory: (storyId) => {
        const { agentHistory } = get();
        return agentHistory.filter((h) => h.storyId === storyId);
      },

      // Human Review
      enableHumanReviewColumn: false,
      setEnableHumanReviewColumn: (enabled) =>
        set({ enableHumanReviewColumn: enabled }),
      humanReviewChecklist: [],
      humanReviewStates: {},
      toggleReviewItem: (storyId, itemId) =>
        set((state) => {
          const current = state.humanReviewStates[storyId] || {
            storyId,
            checkedItems: [],
            lastUpdated: 0,
          };
          const isChecked = current.checkedItems.includes(itemId);
          const newCheckedItems = isChecked
            ? current.checkedItems.filter((id) => id !== itemId)
            : [...current.checkedItems, itemId];

          return {
            humanReviewStates: {
              ...state.humanReviewStates,
              [storyId]: {
                storyId,
                checkedItems: newCheckedItems,
                lastUpdated: Date.now(),
              },
            },
          };
        }),
      isReviewComplete: (storyId) => {
        const { humanReviewStates, humanReviewChecklist } = get();
        const reviewState = humanReviewStates[storyId];
        if (!reviewState || humanReviewChecklist.length === 0) return false;
        return reviewState.checkedItems.length === humanReviewChecklist.length;
      },
      // Human Review status override (app-level, not written to BMAD)
      humanReviewStories: [],
      addToHumanReview: (storyId) =>
        set((state) => ({
          humanReviewStories: state.humanReviewStories.includes(storyId)
            ? state.humanReviewStories
            : [...state.humanReviewStories, storyId],
        })),
      removeFromHumanReview: (storyId) =>
        set((state) => ({
          humanReviewStories: state.humanReviewStories.filter(
            (id) => id !== storyId,
          ),
        })),
      isInHumanReview: (storyId) => {
        const { humanReviewStories } = get();
        return humanReviewStories.includes(storyId);
      },
      getEffectiveStatus: (story) => {
        const { humanReviewStories, enableHumanReviewColumn } = get();
        if (enableHumanReviewColumn && humanReviewStories.includes(story.id)) {
          return "human-review";
        }
        return story.status;
      },

      // View Mode
      viewMode: "board",
      setViewMode: (mode) => set({ viewMode: mode }),
      toggleViewMode: () =>
        set((state) => {
          if (state.viewMode === "chat") {
            // Return to the appropriate home view
            return { viewMode: state.projectType === "dashboard" ? "dashboard" : "board" };
          }
          return { viewMode: "chat" };
        }),

      // Chat Interface
      chatThreads: {},
      selectedChatAgent: null,
      maxThreadMessages: 100,
      pendingChatMessage: null,
      setSelectedChatAgent: (agentId) => set({ selectedChatAgent: agentId }),
      setPendingChatMessage: (pending) => set({ pendingChatMessage: pending }),
      clearPendingChatMessage: () => set({ pendingChatMessage: null }),
      setMaxThreadMessages: (max) => set({ maxThreadMessages: max }),
      addChatMessage: (agentId, message) =>
        set((state) => {
          const thread = state.chatThreads[agentId] || {
            agentId,
            messages: [],
            lastActivity: Date.now(),
            unreadCount: 0,
            isTyping: false,
            isInitialized: false,
          };

          // Add message and trim to max
          const messages = [...thread.messages, message];
          const trimmedMessages = messages.slice(-state.maxThreadMessages);

          return {
            chatThreads: {
              ...state.chatThreads,
              [agentId]: {
                ...thread,
                messages: trimmedMessages,
                lastActivity: Date.now(),
              },
            },
          };
        }),
      updateChatMessage: (agentId, messageId, updates) =>
        set((state) => {
          const thread = state.chatThreads[agentId];
          if (!thread) return state;

          const messages = thread.messages.map((msg) =>
            msg.id === messageId ? { ...msg, ...updates } : msg,
          );

          return {
            chatThreads: {
              ...state.chatThreads,
              [agentId]: {
                ...thread,
                messages,
              },
            },
          };
        }),
      setChatTyping: (agentId, isTyping) =>
        set((state) => {
          const thread = state.chatThreads[agentId] || {
            agentId,
            messages: [],
            lastActivity: Date.now(),
            unreadCount: 0,
            isTyping: false,
            isInitialized: false,
          };

          return {
            chatThreads: {
              ...state.chatThreads,
              [agentId]: {
                ...thread,
                isTyping,
                // Clear activity when typing stops
                thinkingActivity: isTyping
                  ? thread.thinkingActivity
                  : undefined,
              },
            },
          };
        }),
      setChatActivity: (agentId, activity) =>
        set((state) => {
          const thread = state.chatThreads[agentId] || {
            agentId,
            messages: [],
            lastActivity: Date.now(),
            unreadCount: 0,
            isTyping: false,
            isInitialized: false,
          };

          return {
            chatThreads: {
              ...state.chatThreads,
              [agentId]: {
                ...thread,
                thinkingActivity: activity,
              },
            },
          };
        }),
      markChatRead: (agentId) =>
        set((state) => {
          const thread = state.chatThreads[agentId];
          if (!thread) return state;

          return {
            chatThreads: {
              ...state.chatThreads,
              [agentId]: {
                ...thread,
                unreadCount: 0,
              },
            },
          };
        }),
      incrementUnread: (agentId) =>
        set((state) => {
          const thread = state.chatThreads[agentId];
          if (!thread) return state;

          // Don't increment if this agent is selected
          if (state.selectedChatAgent === agentId) return state;

          return {
            chatThreads: {
              ...state.chatThreads,
              [agentId]: {
                ...thread,
                unreadCount: thread.unreadCount + 1,
              },
            },
          };
        }),
      clearChatThread: (agentId) =>
        set((state) => ({
          chatThreads: {
            ...state.chatThreads,
            [agentId]: {
              agentId,
              messages: [],
              lastActivity: Date.now(),
              unreadCount: 0,
              isTyping: false,
              isInitialized: false,
              sessionId: undefined, // Clear session so agent reloads on next message
            },
          },
        })),
      setAgentInitialized: (agentId, initialized) =>
        set((state) => {
          const thread = state.chatThreads[agentId] || {
            agentId,
            messages: [],
            lastActivity: Date.now(),
            unreadCount: 0,
            isTyping: false,
            isInitialized: false,
          };

          return {
            chatThreads: {
              ...state.chatThreads,
              [agentId]: {
                ...thread,
                isInitialized: initialized,
              },
            },
          };
        }),
      setChatSessionId: (agentId, sessionId) =>
        set((state) => {
          const thread = state.chatThreads[agentId] || {
            agentId,
            messages: [],
            lastActivity: Date.now(),
            unreadCount: 0,
            isTyping: false,
            isInitialized: false,
          };

          return {
            chatThreads: {
              ...state.chatThreads,
              [agentId]: {
                ...thread,
                sessionId,
              },
            },
          };
        }),
      setThreadContext: (agentId, storyId, branchName) =>
        set((state) => {
          const thread = state.chatThreads[agentId] || {
            agentId,
            messages: [],
            lastActivity: Date.now(),
            unreadCount: 0,
            isTyping: false,
            isInitialized: false,
          };

          return {
            chatThreads: {
              ...state.chatThreads,
              [agentId]: {
                ...thread,
                storyId,
                branchName,
              },
            },
          };
        }),

      // Zoom Level
      zoomLevel: 100,
      setZoomLevel: (level) => {
        const clamped = Math.max(50, Math.min(200, level))
        set({ zoomLevel: clamped })
        window.fileAPI.setZoom(clamped)
      },

      // Chat Sidebar
      chatSidebarWidth: null,
      setChatSidebarWidth: (width) => set({ chatSidebarWidth: width }),

      // Git Diff Panel (NOT persisted)
      gitDiffPanelOpen: false,
      gitDiffPanelBranch: null,
      gitDiffPanelWidth: 600,
      openGitDiffPanel: (branchName) =>
        set({ gitDiffPanelOpen: true, gitDiffPanelBranch: branchName }),
      closeGitDiffPanel: () =>
        set({ gitDiffPanelOpen: false, gitDiffPanelBranch: null }),
      setGitDiffPanelWidth: (width) =>
        set({ gitDiffPanelWidth: Math.max(400, Math.min(1500, width)) }),

      // Status History
      statusHistoryByStory: {},
      globalStatusHistory: [],
      statusHistoryPanelOpen: false,
      recordStatusChange: (
        storyId,
        storyTitle,
        epicId,
        storyNumber,
        oldStatus,
        newStatus,
        source,
      ) =>
        set((state) => {
          // Skip if no actual change
          if (oldStatus === newStatus) return state;

          const entry: StatusChangeEntry = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            storyId,
            storyTitle,
            epicId,
            storyNumber,
            oldStatus,
            newStatus,
            timestamp: Date.now(),
            source,
          };

          // Update per-story history
          const storyHistory = state.statusHistoryByStory[storyId] || [];
          const newStoryHistory = [entry, ...storyHistory].slice(
            0,
            MAX_STATUS_HISTORY_PER_STORY,
          );

          // Update global history
          const newGlobalHistory = [entry, ...state.globalStatusHistory].slice(
            0,
            MAX_GLOBAL_STATUS_HISTORY,
          );

          return {
            statusHistoryByStory: {
              ...state.statusHistoryByStory,
              [storyId]: newStoryHistory,
            },
            globalStatusHistory: newGlobalHistory,
          };
        }),
      getStatusHistoryForStory: (storyId) => {
        const { statusHistoryByStory } = get();
        return statusHistoryByStory[storyId] || [];
      },
      setStatusHistoryPanelOpen: (open) =>
        set({ statusHistoryPanelOpen: open }),
      lastViewedStatusHistoryAt: 0,
      markStatusHistoryViewed: () =>
        set({ lastViewedStatusHistoryAt: Date.now() }),
      getUnreadStatusHistoryCount: () => {
        const { globalStatusHistory, lastViewedStatusHistoryAt } = get();
        return globalStatusHistory.filter(
          (entry) => entry.timestamp > lastViewedStatusHistoryAt,
        ).length;
      },

      // Project Cost Tracking (NOT persisted)
      projectCostTotal: 0,
      setProjectCostTotal: (total) => set({ projectCostTotal: total }),
      addToProjectCostTotal: (amount) =>
        set((state) => ({ projectCostTotal: state.projectCostTotal + amount })),

      // Full Cycle Automation
      fullCycle: initialFullCycleState,
      fullCycleDialogOpen: false,
      setFullCycleDialogOpen: (open) => set({ fullCycleDialogOpen: open }),
      startFullCycle: (storyId, totalSteps) =>
        set({
          fullCycle: {
            ...initialFullCycleState,
            isRunning: true,
            storyId,
            totalSteps,
            stepStatuses: new Array(totalSteps).fill(
              "pending" as FullCycleStepStatus,
            ),
            startTime: Date.now(),
            stepStartTime: Date.now(),
          },
          fullCycleDialogOpen: true,
        }),
      updateFullCycleStep: (step, name, type) =>
        set((state) => {
          const newStatuses = [...state.fullCycle.stepStatuses];
          newStatuses[step] = "running";
          return {
            fullCycle: {
              ...state.fullCycle,
              currentStep: step,
              stepName: name,
              stepType: type,
              stepStatus: "running",
              stepStatuses: newStatuses,
              stepStartTime: Date.now(),
            },
          };
        }),
      appendFullCycleLog: (log) =>
        set((state) => ({
          fullCycle: {
            ...state.fullCycle,
            logs: [...state.fullCycle.logs, log],
          },
        })),
      setFullCycleError: (error) =>
        set((state) => {
          const newStatuses = [...state.fullCycle.stepStatuses];
          if (state.fullCycle.currentStep < newStatuses.length) {
            newStatuses[state.fullCycle.currentStep] = "error";
          }
          return {
            fullCycle: {
              ...state.fullCycle,
              error,
              stepStatus: "error",
              stepStatuses: newStatuses,
            },
          };
        }),
      completeFullCycle: () =>
        set((state) => {
          const newStatuses = state.fullCycle.stepStatuses.map((s) =>
            s === "running" ? "completed" : s,
          );
          return {
            fullCycle: {
              ...state.fullCycle,
              isRunning: false,
              stepStatus: "completed",
              stepStatuses: newStatuses,
            },
          };
        }),
      cancelFullCycle: () =>
        set((state) => ({
          fullCycle: {
            ...state.fullCycle,
            isRunning: false,
            error: "Cancelled by user",
          },
        })),
      retryFullCycle: () =>
        set((state) => {
          // Find the first step that isn't completed or skipped
          const stepStatuses = state.fullCycle.stepStatuses;
          let resumeStep = 0;
          for (let i = 0; i < stepStatuses.length; i++) {
            if (
              stepStatuses[i] !== "completed" &&
              stepStatuses[i] !== "skipped"
            ) {
              resumeStep = i;
              break;
            }
          }
          // Reset the status of failed/pending steps to pending
          const newStatuses = stepStatuses.map((s, i) =>
            i >= resumeStep ? ("pending" as FullCycleStepStatus) : s,
          );
          return {
            fullCycle: {
              ...state.fullCycle,
              isRunning: true,
              currentStep: resumeStep,
              error: null,
              stepStatus: "pending",
              stepStatuses: newStatuses,
              stepStartTime: Date.now(),
            },
          };
        }),
      setFullCycleMinimized: (minimized) =>
        set((state) => ({
          fullCycle: {
            ...state.fullCycle,
            minimized,
          },
        })),
      setFullCycleSessionId: (sessionId) =>
        set((state) => ({
          fullCycle: {
            ...state.fullCycle,
            sessionId,
          },
        })),
      skipFullCycleStep: (stepIndex) =>
        set((state) => {
          const newStatuses = [...state.fullCycle.stepStatuses];
          newStatuses[stepIndex] = "skipped";
          return {
            fullCycle: {
              ...state.fullCycle,
              currentStep: stepIndex + 1,
              stepStatus: "skipped",
              stepStatuses: newStatuses,
            },
          };
        }),
      advanceFullCycleStep: () =>
        set((state) => {
          const newStatuses = [...state.fullCycle.stepStatuses];
          if (state.fullCycle.currentStep < newStatuses.length) {
            newStatuses[state.fullCycle.currentStep] = "completed";
          }
          return {
            fullCycle: {
              ...state.fullCycle,
              currentStep: state.fullCycle.currentStep + 1,
              stepStatus: "completed",
              stepStatuses: newStatuses,
            },
          };
        }),

      // Epic Cycle Automation
      epicCycle: initialEpicCycleState,
      epicCycleDialogOpen: false,
      setEpicCycleDialogOpen: (open) => set({ epicCycleDialogOpen: open }),
      startEpicCycle: (epicId, storyIds) =>
        set({
          epicCycle: {
            ...initialEpicCycleState,
            isRunning: true,
            epicId,
            storyQueue: storyIds,
            currentStoryIndex: 0,
            storyStatuses: storyIds.map(() => "pending" as EpicStoryStatus),
            startTime: Date.now(),
          },
          epicCycleDialogOpen: true,
        }),
      advanceEpicCycleStory: () =>
        set((state) => {
          const newStatuses = [...state.epicCycle.storyStatuses];
          if (state.epicCycle.currentStoryIndex < newStatuses.length) {
            newStatuses[state.epicCycle.currentStoryIndex] = "completed";
          }
          return {
            epicCycle: {
              ...state.epicCycle,
              currentStoryIndex: state.epicCycle.currentStoryIndex + 1,
              storyStatuses: newStatuses,
            },
          };
        }),
      setEpicCycleError: (error) =>
        set((state) => {
          const newStatuses = [...state.epicCycle.storyStatuses];
          if (state.epicCycle.currentStoryIndex < newStatuses.length) {
            newStatuses[state.epicCycle.currentStoryIndex] = "error";
          }
          return {
            epicCycle: {
              ...state.epicCycle,
              error,
              storyStatuses: newStatuses,
            },
          };
        }),
      cancelEpicCycle: () =>
        set((state) => ({
          epicCycle: {
            ...state.epicCycle,
            isRunning: false,
            error: "Cancelled by user",
          },
        })),
      completeEpicCycle: () =>
        set((state) => ({
          epicCycle: {
            ...state.epicCycle,
            isRunning: false,
          },
        })),
      resetEpicCycle: () =>
        set({
          epicCycle: initialEpicCycleState,
        }),
      retryEpicCycle: () =>
        set((state) => {
          // Resume from the failed story, resetting its status to pending
          const newStatuses = [...state.epicCycle.storyStatuses];
          if (state.epicCycle.currentStoryIndex < newStatuses.length) {
            newStatuses[state.epicCycle.currentStoryIndex] = "pending";
          }
          return {
            epicCycle: {
              ...state.epicCycle,
              isRunning: true,
              error: null,
              storyStatuses: newStatuses,
            },
          };
        }),

      // Environment Check Dialog (NOT persisted)
      // Auto-Update
      updateStatus: 'idle',
      updateVersion: '',
      updateDownloadPercent: 0,
      setUpdateStatus: (status) => set({ updateStatus: status }),
      setUpdateVersion: (version) => set({ updateVersion: version }),
      setUpdateDownloadPercent: (percent) => set({ updateDownloadPercent: percent }),

      envCheckDialogOpen: false,
      envCheckResults: null,
      envCheckLoading: false,
      setEnvCheckDialogOpen: (open) => set({ envCheckDialogOpen: open }),
      setEnvCheckResults: (results) => set({ envCheckResults: results }),
      setEnvCheckLoading: (loading) => set({ envCheckLoading: loading }),

      // Project Workflows Dialog
      projectWorkflowsDialogOpen: false,
      setProjectWorkflowsDialogOpen: (open) =>
        set({ projectWorkflowsDialogOpen: open }),

      // Project Wizard
      projectWizard: initialWizardState,
      startProjectWizard: (
        projectPath,
        outputFolder,
        developerMode,
        selectedModules,
        customContentPaths,
      ) => {
        const modules = selectedModules?.length ? selectedModules : ["bmm"];
        const primary = modules.includes("gds")
          ? "gds"
          : modules.includes("bmm")
            ? "bmm"
            : "dashboard";
        const steps = getWizardSteps(
          primary as "bmm" | "gds" | "dashboard",
        );
        set({
          projectWizard: {
            ...initialWizardState,
            isActive: true,
            projectPath,
            outputFolder: outputFolder || "_bmad-output",
            developerMode,
            selectedModules: modules,
            customContentPaths: customContentPaths?.length ? customContentPaths : undefined,
            stepStatuses: new Array(steps.length).fill(
              "pending" as WizardStepStatus,
            ),
          },
          // Set project path/type so AgentChat can function during wizard
          projectPath,
          projectType: primary as ProjectType,
          outputFolder: outputFolder || "_bmad-output",
          developerMode: developerMode || "ai",
          // Clear stale scan data from previous project so old agents don't show
          bmadScanResult: null,
          scannedWorkflowConfig: null,
        });
      },
      updateWizardStep: (stepIndex, status) =>
        set((state) => {
          const newStatuses = [...state.projectWizard.stepStatuses];
          newStatuses[stepIndex] = status;
          return {
            projectWizard: {
              ...state.projectWizard,
              stepStatuses: newStatuses,
              currentStep:
                status === "active"
                  ? stepIndex
                  : state.projectWizard.currentStep,
            },
          };
        }),
      advanceWizardStep: () =>
        set((state) => {
          const newStatuses = [...state.projectWizard.stepStatuses];
          if (state.projectWizard.currentStep < newStatuses.length) {
            newStatuses[state.projectWizard.currentStep] = "completed";
          }
          return {
            projectWizard: {
              ...state.projectWizard,
              currentStep: state.projectWizard.currentStep + 1,
              stepStatuses: newStatuses,
            },
          };
        }),
      skipWizardStep: (stepIndex) =>
        set((state) => {
          const newStatuses = [...state.projectWizard.stepStatuses];
          newStatuses[stepIndex] = "skipped";
          // If skipping the current step, advance
          const newCurrentStep =
            stepIndex === state.projectWizard.currentStep
              ? stepIndex + 1
              : state.projectWizard.currentStep;
          return {
            projectWizard: {
              ...state.projectWizard,
              currentStep: newCurrentStep,
              stepStatuses: newStatuses,
            },
          };
        }),
      appendWizardInstallLog: (line) =>
        set((state) => ({
          projectWizard: {
            ...state.projectWizard,
            installProgress: [...state.projectWizard.installProgress, line],
          },
        })),
      setWizardError: (error) =>
        set((state) => ({
          projectWizard: {
            ...state.projectWizard,
            error,
          },
        })),
      completeWizard: () =>
        set({
          projectWizard: initialWizardState,
        }),
      cancelWizard: () =>
        set({
          projectWizard: initialWizardState,
          projectPath: null,
          projectType: null,
        }),
      resumeWizard: (wizardState) =>
        set({
          projectWizard: { ...wizardState, error: null },
          projectPath: wizardState.projectPath,
          projectType: (wizardState.selectedModules?.includes("gds")
            ? "gds"
            : "bmm") as ProjectType,
          outputFolder: wizardState.outputFolder || "_bmad-output",
          developerMode: wizardState.developerMode || "ai",
          bmadScanResult: null,
          scannedWorkflowConfig: null,
        }),
      goToWizardStep: (stepIndex) =>
        set((state) => ({
          projectWizard: {
            ...state.projectWizard,
            currentStep: stepIndex,
          },
        })),
      rerunWizardStep: (stepIndex) =>
        set((state) => {
          const newStatuses = [...state.projectWizard.stepStatuses];
          newStatuses[stepIndex] = "pending";
          return {
            projectWizard: {
              ...state.projectWizard,
              currentStep: stepIndex,
              stepStatuses: newStatuses,
            },
          };
        }),
      setWizardActiveSubStep: (step) =>
        set((state) => ({
          projectWizard: {
            ...state.projectWizard,
            wizardActiveSubStep: step,
          },
        })),

      // Computed
      getFilteredStories: () => {
        const { stories, selectedEpicId, epics, searchQuery } = get();
        let filtered = stories;

        // Filter by epic (skip if selected epic doesn't exist in current project)
        if (
          selectedEpicId !== null &&
          epics.some((e) => e.id === selectedEpicId)
        ) {
          filtered = filtered.filter((s) => s.epicId === selectedEpicId);
        }

        // Filter by search query
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(
            (s) =>
              s.title.toLowerCase().includes(query) ||
              s.id.toLowerCase().includes(query),
          );
        }

        return filtered;
      },
    }),
    {
      name: "bmad-studio-storage",
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        colorTheme: state.colorTheme,
        aiTool: state.aiTool,
        claudeModel: state.claudeModel,
        customEndpoint: state.customEndpoint,
        projectPath: state.projectPath,
        projectType: state.projectType,
        outputFolder: state.outputFolder,
        selectedEpicId: state.selectedEpicId,
        collapsedColumnsByEpic: state.collapsedColumnsByEpic,
        agentHistory: state.agentHistory,
        recentProjects: state.recentProjects,
        notificationsEnabled: state.notificationsEnabled,
        verboseMode: state.verboseMode,
        baseBranch: state.baseBranch,
        allowDirectEpicMerge: state.allowDirectEpicMerge,
        bmadInGitignore: state.bmadInGitignore,
        bmadInGitignoreUserSet: state.bmadInGitignoreUserSet,
        storyOrder: state.storyOrder,
        enableHumanReviewColumn: state.enableHumanReviewColumn,
        humanReviewChecklist: state.humanReviewChecklist,
        humanReviewStates: state.humanReviewStates,
        humanReviewStories: state.humanReviewStories,
        maxThreadMessages: state.maxThreadMessages,
        statusHistoryByStory: state.statusHistoryByStory,
        globalStatusHistory: state.globalStatusHistory,
        lastViewedStatusHistoryAt: state.lastViewedStatusHistoryAt,
        enableEpicBranches: state.enableEpicBranches,
        disableGitBranching: state.disableGitBranching,
        disableEnvCheck: state.disableEnvCheck,
        fullCycleReviewCount: state.fullCycleReviewCount,
        developerMode: state.developerMode,
        bmadUserName: state.bmadUserName,
        bmadLanguage: state.bmadLanguage,
        hasConfiguredProfile: state.hasConfiguredProfile,
        chatSidebarWidth: state.chatSidebarWidth,
        gitDiffPanelWidth: state.gitDiffPanelWidth,
        zoomLevel: state.zoomLevel,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Mark any "running" agents in history as "interrupted" since the app restarted
          const updatedHistory = state.agentHistory.map((entry) => {
            if (entry.status === "running") {
              return {
                ...entry,
                status: "interrupted" as const,
                endTime: Date.now(),
              };
            }
            return entry;
          });
          if (updatedHistory.some((h, i) => h !== state.agentHistory[i])) {
            state.agentHistory = updatedHistory;
          }
          // Restore per-project git settings from recentProjects
          if (state.projectPath && state.recentProjects.length > 0) {
            const current = state.recentProjects.find(
              (p) => p.path === state.projectPath,
            );
            if (current) {
              if (current.baseBranch) state.baseBranch = current.baseBranch;
              if (current.enableEpicBranches !== undefined)
                state.enableEpicBranches = current.enableEpicBranches;
              if (current.allowDirectEpicMerge !== undefined)
                state.allowDirectEpicMerge = current.allowDirectEpicMerge;
              if (current.disableGitBranching !== undefined)
                state.disableGitBranching = current.disableGitBranching;
              if (current.developerMode)
                state.developerMode = current.developerMode;
              if (current.colorTheme)
                state.colorTheme = current.colorTheme;
            }
          }
          // Set correct initial viewMode based on project type
          if (state.projectType === 'dashboard') {
            state.viewMode = 'dashboard';
          }
          // Restore persisted zoom level
          if (state.zoomLevel && state.zoomLevel !== 100) {
            window.fileAPI.setZoom(state.zoomLevel)
          }
          state.setHasHydrated(true);
        }
      },
    },
  ),
);
