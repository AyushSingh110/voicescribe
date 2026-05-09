import type { EngineMode, ModelProgress } from "../shared/types";
import type { TranscriptionEngine } from "./engine";
import { LocalWhisperEngine } from "./localWhisperEngine";
import { WebSpeechChunkEngine } from "./webSpeechEngine";

export function createTranscriptionEngine(
  mode: EngineMode,
  onProgress?: (progress: ModelProgress) => void
): TranscriptionEngine {
  if (mode === "local-whisper") {
    return new LocalWhisperEngine(onProgress);
  }

  return new WebSpeechChunkEngine();
}
