import { createSegmentId, type TranscriptionEngine, type TranscriptionInput } from "./engine";
import type { TranscriptSegment } from "../shared/types";

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

const LANG_MAP: Record<string, string> = {
  auto: "en-US",
  hi: "hi-IN",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN"
};

export class WebSpeechChunkEngine implements TranscriptionEngine {
  readonly name = "web-speech";
  private recognition: SpeechRecognitionInstance | null = null;
  private buffer = "";
  private running = false;

  async transcribe(input: TranscriptionInput): Promise<TranscriptSegment | null> {
    if (!this.running) {
      this.startRecognition(input.settings.sourceLanguage);
    }

    const text = this.buffer.trim();
    this.buffer = "";

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

  dispose(): void {
    this.running = false;
    this.recognition?.stop();
    this.recognition = null;
    this.buffer = "";
  }

  private startRecognition(language: string): void {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      throw new Error("Web Speech API is not supported in this browser. Use Local Whisper instead.");
    }

    this.recognition = new SR();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = LANG_MAP[language] ?? "en-US";
    this.running = true;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          this.buffer += result[0].transcript + " ";
        }
      }
    };

    this.recognition.onerror = () => {
      this.running = false;
    };

    this.recognition.onend = () => {
      // Auto-restart if we didn't intentionally stop
      if (this.running) {
        try {
          this.recognition?.start();
        } catch {
          this.running = false;
        }
      }
    };

    this.recognition.start();
  }
}
