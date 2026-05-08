export type CaptureStatus =
  | "idle"
  | "starting"
  | "capturing"
  | "processing"
  | "stopping"
  | "error";

export type EngineMode = "web-speech" | "local-whisper";

export interface ExtensionSettings {
  engineMode: EngineMode;
  sourceLanguage: string;
  targetLanguage: "en";
  chunkSeconds: number;
  showOverlay: boolean;
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

export interface RuntimeState {
  status: CaptureStatus;
  activeTabId?: number;
  error?: string;
  settings: ExtensionSettings;
  latestSegment?: TranscriptSegment;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  engineMode: "local-whisper",
  sourceLanguage: "auto",
  targetLanguage: "en",
  chunkSeconds: 6,
  showOverlay: true
};

export const STORAGE_KEYS = {
  settings: "settings",
  transcript: "transcript",
  state: "state"
} as const;
