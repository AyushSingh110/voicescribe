export type CaptureStatus =
  | "idle"
  | "starting"
  | "capturing"
  | "processing"
  | "stopping"
  | "error";

export type EngineMode = "web-speech" | "local-whisper";
export type Theme = "light" | "dark";
export type WhisperModel = "tiny" | "base";

export interface ExtensionSettings {
  engineMode: EngineMode;
  sourceLanguage: string;
  targetLanguage: "en";
  chunkSeconds: number;
  showOverlay: boolean;
  theme: Theme;
  whisperModel: WhisperModel;
}

export interface TranscriptSegment {
  id: string;
  tabId: number;
  text: string;
  originalText?: string;
  language?: string;
  startedAt: number;
  endedAt: number;
  isFinal: boolean;
}

export interface ModelProgress {
  file: string;
  progress: number;
  status: "loading" | "done";
}

export interface RuntimeState {
  status: CaptureStatus;
  activeTabId?: number;
  error?: string;
  settings: ExtensionSettings;
  latestSegment?: TranscriptSegment;
  modelProgress?: ModelProgress;
  inferenceDevice?: "webgpu" | "wasm";
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  engineMode: "local-whisper",
  sourceLanguage: "auto",
  targetLanguage: "en",
  chunkSeconds: 3,
  showOverlay: true,
  theme: "light",
  whisperModel: "base"
};

export const STORAGE_KEYS = {
  settings: "settings",
  transcript: "transcript",
  state: "state"
} as const;
