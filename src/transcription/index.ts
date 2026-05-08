import type { EngineMode } from "../shared/types";
import type { TranscriptionEngine } from "./engine";
import { LocalWhisperEngine } from "./localWhisperEngine";
import { WebSpeechChunkEngine } from "./webSpeechEngine";

export function createTranscriptionEngine(mode: EngineMode): TranscriptionEngine {
  if (mode === "local-whisper") {
    return new LocalWhisperEngine();
  }

  return new WebSpeechChunkEngine();
}
