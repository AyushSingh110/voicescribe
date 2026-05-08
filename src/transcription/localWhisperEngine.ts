import { pipeline } from "@huggingface/transformers";
import { blobToMonoFloat32 } from "./audio";
import { createSegmentId, type TranscriptionEngine, type TranscriptionInput } from "./engine";

type AutomaticSpeechRecognitionPipeline = {
  (audio: Float32Array, options?: Record<string, unknown>): Promise<unknown>;
};

const createPipeline = pipeline as unknown as (
  task: "automatic-speech-recognition",
  model: string,
  options: Record<string, unknown>
) => Promise<AutomaticSpeechRecognitionPipeline>;

export class LocalWhisperEngine implements TranscriptionEngine {
  readonly name = "local-whisper";
  private transcriberPromise?: Promise<AutomaticSpeechRecognitionPipeline>;

  async transcribe(input: TranscriptionInput) {
    const audio = await blobToMonoFloat32(input.blob);
    if (audio.length === 0) {
      return null;
    }

    const transcriber = await this.getTranscriber();
    const result = await transcriber(audio, {
      task: "translate",
      language: input.settings.sourceLanguage === "auto" ? undefined : input.settings.sourceLanguage
    });

    const text = normalizeOutputText(result);
    if (!text) {
      return null;
    }

    return {
      id: createSegmentId(input.startedAt),
      tabId: input.tabId,
      text,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      isFinal: true
    };
  }

  private getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
    this.transcriberPromise ??= createPipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny",
      { dtype: "q8" }
    );

    return this.transcriberPromise;
  }
}

function normalizeOutputText(result: unknown): string {
  if (typeof result === "object" && result && "text" in result) {
    return String(result.text).trim();
  }

  if (Array.isArray(result)) {
    return result.map(normalizeOutputText).join(" ").trim();
  }

  return "";
}
