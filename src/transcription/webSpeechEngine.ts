import { createSegmentId, type TranscriptionEngine, type TranscriptionInput } from "./engine";

declare global {
  interface SpeechRecognitionConstructor {
    new (): unknown;
  }

  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export class WebSpeechChunkEngine implements TranscriptionEngine {
  readonly name = "web-speech";

  async transcribe(input: TranscriptionInput) {
    const text = await recognizeBlob(input.blob, input.settings.sourceLanguage);
    if (!text) {
      return null;
    }

    return {
      id: createSegmentId(input.startedAt),
      tabId: input.tabId,
      text,
      originalText: text,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      isFinal: true
    };
  }
}

async function recognizeBlob(_blob: Blob, language: string): Promise<string> {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Recognition) {
    throw new Error("Web Speech API is not available in this browser. Switch to local Whisper mode.");
  }

  // Browser speech recognition cannot reliably consume arbitrary audio blobs yet.
  // This engine is intentionally a compatibility placeholder while local Whisper
  // provides the real tab-audio path.
  const selectedLanguage = language === "auto" ? "en-US" : language;
  return `Audio chunk captured. Web Speech mode is available for ${selectedLanguage}, but tab-audio transcription requires Local Whisper mode.`;
}
