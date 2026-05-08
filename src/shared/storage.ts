import { DEFAULT_SETTINGS, STORAGE_KEYS, type ExtensionSettings, type RuntimeState, type TranscriptSegment } from "./types";

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.settings] ?? {}) };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export async function getTranscript(): Promise<TranscriptSegment[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.transcript);
  return result[STORAGE_KEYS.transcript] ?? [];
}

export async function appendTranscriptSegment(segment: TranscriptSegment): Promise<void> {
  const transcript = await getTranscript();
  transcript.push(segment);
  await chrome.storage.local.set({ [STORAGE_KEYS.transcript]: transcript.slice(-500) });
}

export async function clearTranscript(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.transcript]: [] });
}

export async function saveState(state: RuntimeState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.state]: state });
}

export async function getState(): Promise<RuntimeState> {
  const settings = await getSettings();
  const result = await chrome.storage.local.get(STORAGE_KEYS.state);
  return {
    status: "idle",
    settings,
    ...(result[STORAGE_KEYS.state] ?? {})
  };
}
